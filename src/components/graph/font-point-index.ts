import { createMemo, createRoot } from 'solid-js';
import { quadtree, type Quadtree, type QuadtreeLeaf } from 'd3-quadtree';
import { scaleSymlog } from 'd3-scale';
import { extent } from 'd3-array';
import { appState } from '@/store';
import { type FontItem } from '@/types/font';
import { GRAPH_SIZE } from './constants';
import {
  radialDendrogramLayout,
  type RadialDendrogramLayout,
} from './dendrogram-layout';
import {
  type GraphCoordinate,
  type GraphPointData,
  type GraphVisibleBounds,
} from './types';
import { collectVisibleImageKeys } from './lib';

const MAX_NEAREST_FONT_ITEMS = 60;

/**
 * Soft linear→log transition scale of the symlog layout, in score units.
 * symlog maps `y = sign(x)·log(1 + |x/C|)`, so the projection is only truly
 * linear as `x → 0`; by `|x| = C` the local slope has already halved (to
 * `1/2C`) and the value is ~30% below its linear extrapolation. `C` is thus
 * the soft scale at which compression takes over, not a hard "linear up to
 * here" cutoff. The model standardises each axis to ~unit σ, so this value
 * places that transition near the typical bulk and only the genuine tail gets
 * strongly compressed. Lower it to crush outliers harder; raise it to keep the
 * layout closer to linear.
 */
const SYMLOG_CONSTANT = 1.25;

interface FontPointState {
  points: GraphPointData[];
  origin: GraphCoordinate;
}

interface FontPointIndexes {
  byKey: Map<string, GraphPointData>;
  byFamilyName: Map<string, GraphPointData[]>;
}

function getFontVectorPosition(item: FontItem) {
  const position = item.computed?.positioning?.position;
  const x = position?.[0];
  const y = position?.[1];

  if (x == null || y == null) return null;
  return { x, y };
}

/**
 * Builds an outlier-tolerant projection for one axis: a d3
 * {@link https://d3js.org/d3-scale/symlog | symlog} scale (linear near zero,
 * logarithmic in the tails) mapping the data's full extent onto the canvas, so
 * a far outlier sets the edge without crushing the bulk into a central blob.
 * A degenerate (empty or single-valued) axis parks every point at the centre.
 */
function createAxisProjection(values: number[]): (value: number) => number {
  const [min, max] = extent(values);
  if (min == null || max == null) {
    return () => GRAPH_SIZE / 2;
  }

  const scale = scaleSymlog<number, number>()
    .domain([min, max])
    .range([0, GRAPH_SIZE])
    .constant(SYMLOG_CONSTANT);
  return (value) => scale(value);
}

function createFontPointState(
  data: Record<string, FontItem>,
  radial: RadialDendrogramLayout | null,
): FontPointState {
  // Dendrogram mode swaps the score projection for the radial tree layout:
  // every analysed font sits on the ring, and the (hidden) axes' origin parks
  // at the ring centre.
  if (radial) {
    const points: GraphPointData[] = Object.values(data).flatMap((item) => {
      const position = radial.positionByKey.get(item.meta.safe_name);
      return position
        ? [
            {
              key: item.meta.safe_name,
              item,
              x: position.x,
              y: position.y,
            },
          ]
        : [];
    });
    return {
      points,
      origin: { x: GRAPH_SIZE / 2, y: GRAPH_SIZE / 2 },
    };
  }

  const located = Object.values(data).flatMap((item) => {
    const position = getFontVectorPosition(item);
    return position ? [{ item, position }] : [];
  });

  // Each axis is projected independently through its own symlog scale.
  const projectX = createAxisProjection(
    located.map(({ position }) => position.x),
  );
  const projectY = createAxisProjection(
    located.map(({ position }) => position.y),
  );

  const points: GraphPointData[] = located.map(({ item, position }) => ({
    key: item.meta.safe_name,
    item,
    x: projectX(position.x),
    // Graph space is y-down; flip so a higher score sits nearer the top.
    y: GRAPH_SIZE - projectY(position.y),
  }));

  return {
    points,
    origin: {
      x: projectX(0),
      y: GRAPH_SIZE - projectY(0),
    },
  };
}

function getSelectableFontPointData(
  points: GraphPointData[],
  filteredKeys: Set<string>,
): GraphPointData[] {
  return points.filter((point) => filteredKeys.has(point.key));
}

function createSelectableFontPointTree(
  points: GraphPointData[],
): Quadtree<GraphPointData> {
  return quadtree<GraphPointData>()
    .x((point) => point.x)
    .y((point) => point.y)
    .addAll(points);
}

function findNearestFontItems(
  tree: Quadtree<GraphPointData>,
  selectedPoint: GraphPointData,
): FontItem[] {
  const searchTree = tree.copy();
  const nearestItems: FontItem[] = [];

  while (
    nearestItems.length < MAX_NEAREST_FONT_ITEMS &&
    searchTree.size() > 0
  ) {
    const nearest = searchTree.find(selectedPoint.x, selectedPoint.y);
    if (!nearest) break;

    searchTree.remove(nearest);
    if (nearest.key !== selectedPoint.key) {
      nearestItems.push(nearest.item);
    }
  }

  return nearestItems;
}

const fontPointIndex = createRoot(() => {
  const state = createMemo(() =>
    createFontPointState(appState.fonts.displayData, radialDendrogramLayout()),
  );
  const indexes = createMemo<FontPointIndexes>(() => {
    const byKey = new Map<string, GraphPointData>();
    const byFamilyName = new Map<string, GraphPointData[]>();

    for (const point of state().points) {
      byKey.set(point.key, point);

      const familyName = point.item.meta.family_name;
      const familyPoints = byFamilyName.get(familyName);
      if (familyPoints) {
        familyPoints.push(point);
      } else {
        byFamilyName.set(familyName, [point]);
      }
    }

    return { byKey, byFamilyName };
  });
  const selectablePoints = createMemo(() =>
    getSelectableFontPointData(state().points, appState.fonts.filteredKeys),
  );
  const selectableTree = createMemo(() =>
    createSelectableFontPointTree(selectablePoints()),
  );

  const getSelectablePointsInBounds = (
    bounds: GraphVisibleBounds,
  ): GraphPointData[] => {
    const points: GraphPointData[] = [];
    selectableTree().visit((node, x0, y0, x1, y1) => {
      if (
        x0 > bounds.maxX ||
        x1 < bounds.minX ||
        y0 > bounds.maxY ||
        y1 < bounds.minY
      ) {
        return true;
      }

      if (node.length) return false;

      let leaf: QuadtreeLeaf<GraphPointData> | undefined = node;
      while (leaf) {
        const point = leaf.data;
        if (
          point.x >= bounds.minX &&
          point.x <= bounds.maxX &&
          point.y >= bounds.minY &&
          point.y <= bounds.maxY
        ) {
          points.push(point);
        }
        leaf = leaf.next;
      }
      return false;
    });
    return points;
  };

  return {
    points: () => state().points,
    origin: () => state().origin,
    selectablePoints,
    getPointByKey: (key: string) => indexes().byKey.get(key),
    getPointsByFamilyName: (familyName: string): readonly GraphPointData[] =>
      indexes().byFamilyName.get(familyName) ?? [],
    findSelectablePoint: (x: number, y: number, radius: number) =>
      selectableTree().find(x, y, radius),
    getVisibleImageKeys: (bounds: GraphVisibleBounds, scale: number) =>
      collectVisibleImageKeys(selectableTree(), bounds, scale),
    getNearestSelectableFontItems: (selectedKey: string) => {
      const selectedPoint = indexes().byKey.get(selectedKey);
      if (!selectedPoint) return [];

      return findNearestFontItems(selectableTree(), selectedPoint);
    },
    getSelectablePointsInBounds,
  };
});

export const fontPoints = fontPointIndex.points;

export const graphOrigin = fontPointIndex.origin;

export const getGraphPointByKey = fontPointIndex.getPointByKey;

export const getGraphPointsByFamilyName = fontPointIndex.getPointsByFamilyName;

export const getSelectableFontPoints = fontPointIndex.selectablePoints;

export const findSelectableFontPoint = fontPointIndex.findSelectablePoint;

export const getVisibleImageKeys = fontPointIndex.getVisibleImageKeys;

export const getNearestSelectableFontItems =
  fontPointIndex.getNearestSelectableFontItems;

export const getSelectableFontPointsInBounds =
  fontPointIndex.getSelectablePointsInBounds;
