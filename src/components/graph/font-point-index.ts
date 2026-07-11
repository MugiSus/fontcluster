import { createMemo, createRoot } from 'solid-js';
import { quadtree, type Quadtree } from 'd3-quadtree';
import { extent } from 'd3-array';
import { scaleSymlog } from 'd3-scale';
import { appState } from '@/store';
import { type FontItem } from '@/types/font';
import { GRAPH_SIZE } from './constants';
import {
  radialDendrogramLayout,
  type RadialDendrogramLayout,
} from './dendrogram-layout';
import { collectVisibleRadialImageKeys } from './radial-image-visibility';
import { type GraphPointData, type GraphVisibleBounds } from './types';

const MAX_NEAREST_FONT_ITEMS = 60;

/**
 * Soft linear→log transition scale of the symlog layout, in score units.
 * symlog maps `y = sign(x)·log(1 + |x/C|)`, so the projection is only truly
 * linear as `x → 0`; by `|x| = C` the local slope has already halved (to
 * `1/2C`) and the value is ~30% below its linear extrapolation. `C` is thus
 * the soft scale at which compression takes over, not a hard "linear up to
 * here" cutoff. The backend standardises each scatter axis to unit σ, so this
 * value places that transition near the typical bulk and only the genuine
 * tail gets strongly compressed. Lower it to crush outliers harder; raise it
 * to keep the layout closer to linear.
 */
const SYMLOG_CONSTANT = 1.25;

interface FontPointIndexes {
  byKey: Map<string, GraphPointData>;
  byFamilyName: Map<string, GraphPointData[]>;
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

/**
 * The graph layout: with the dendrogram toggle on, every analysed font sits
 * on the radial tree's leaf ring; with it off, fonts sit at their
 * `clustering.two` scatter coordinate (the clustering feature space's top two
 * principal components), each axis passed through its own symlog projection.
 * Fonts without a scatter coordinate (sessions clustered before it existed)
 * produce no scatter point, and sessions without a recorded dendrogram
 * produce no dendrogram points.
 */
function createFontPointState(
  data: Record<string, FontItem>,
  radial: RadialDendrogramLayout | null,
): GraphPointData[] {
  if (radial) {
    return Object.values(data).flatMap((item) => {
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
  }

  const located = Object.values(data).flatMap((item) => {
    const two = item.computed?.clustering?.two;
    return two ? [{ item, x: two[0], y: two[1] }] : [];
  });

  // Each axis is projected independently through its own symlog scale.
  const projectX = createAxisProjection(located.map(({ x }) => x));
  const projectY = createAxisProjection(located.map(({ y }) => y));

  return located.map(({ item, x, y }) => ({
    key: item.meta.safe_name,
    item,
    x: projectX(x),
    // Graph space is y-down; flip so a higher score sits nearer the top.
    y: GRAPH_SIZE - projectY(y),
  }));
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

    for (const point of state()) {
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
    getSelectableFontPointData(state(), appState.fonts.filteredKeys),
  );
  const selectableTree = createMemo(() =>
    createSelectableFontPointTree(selectablePoints()),
  );

  return {
    points: state,
    selectablePoints,
    getPointByKey: (key: string) => indexes().byKey.get(key),
    getPointsByFamilyName: (familyName: string): readonly GraphPointData[] =>
      indexes().byFamilyName.get(familyName) ?? [],
    findSelectablePoint: (x: number, y: number, radius: number) =>
      selectableTree().find(x, y, radius),
    getVisibleImageKeys: (bounds: GraphVisibleBounds, scale: number) =>
      collectVisibleRadialImageKeys(selectablePoints(), bounds, scale),
    getNearestSelectableFontItems: (selectedKey: string) => {
      const selectedPoint = indexes().byKey.get(selectedKey);
      if (!selectedPoint) return [];

      return findNearestFontItems(selectableTree(), selectedPoint);
    },
  };
});

export const fontPoints = fontPointIndex.points;

export const getGraphPointByKey = fontPointIndex.getPointByKey;

export const getGraphPointsByFamilyName = fontPointIndex.getPointsByFamilyName;

export const findSelectableFontPoint = fontPointIndex.findSelectablePoint;

export const getVisibleImageKeys = fontPointIndex.getVisibleImageKeys;

export const getNearestSelectableFontItems =
  fontPointIndex.getNearestSelectableFontItems;
