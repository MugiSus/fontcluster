import { createMemo, createRoot } from 'solid-js';
import { quadtree, type Quadtree } from 'd3-quadtree';
import { extent, range } from 'd3-array';
import { scaleSymlog } from 'd3-scale';
import { appState, type GraphMode } from '@/store';
import { type FontItem } from '@/types/font';
import { GRAPH_PADDING, GRAPH_SIZE } from './constants';
import {
  radialDendrogramLayout,
  type RadialDendrogramLayout,
} from './dendrogram-layout';
import { collectVisibleRadialImageKeys } from './radial-image-visibility';
import {
  findTreemapLeafKey,
  treemapLayout,
  type TreemapLayout,
} from './treemap-layout';
import {
  type GraphPointData,
  type GraphVisibleBounds,
  type ScatterGridLine,
} from './types';

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

const NO_GRID_LINES: ScatterGridLine[] = [];

interface FontPointIndexes {
  byKey: Map<string, GraphPointData>;
  byFamilyName: Map<string, GraphPointData[]>;
}

interface AxisProjection {
  project: (value: number) => number;
  /** σ extent visible through the graph's padded guide area; null when the
   *  source axis is degenerate (empty or single-valued). */
  gridDomain: [number, number] | null;
}

interface FontPointState {
  points: GraphPointData[];
  /** σ gridlines of the scatter layout; empty in both hierarchy layouts. */
  gridLines: ScatterGridLine[];
}

/**
 * Builds an outlier-tolerant projection for one axis: a d3
 * {@link https://d3js.org/d3-scale/symlog | symlog} scale (linear near zero,
 * logarithmic in the tails) mapping the data's full extent onto the canvas, so
 * a far outlier sets the edge without crushing the bulk into a central blob.
 * A degenerate (empty or single-valued) axis parks every point at the centre.
 */
function createAxisProjection(values: number[]): AxisProjection {
  const [min, max] = extent(values);
  if (min == null || max == null || min === max) {
    return { project: () => GRAPH_SIZE / 2, gridDomain: null };
  }

  const scale = scaleSymlog<number, number>()
    .domain([min, max])
    .range([0, GRAPH_SIZE])
    .constant(SYMLOG_CONSTANT);
  return {
    project: (value) => scale(value),
    gridDomain: [
      scale.invert(-GRAPH_PADDING),
      scale.invert(GRAPH_SIZE + GRAPH_PADDING),
    ],
  };
}

/**
 * The σ gridlines of one scatter axis: every integer σ level whose projected
 * position falls within the graph's padded guide area, including levels just
 * beyond the data extent. They use the axis's own symlog scale, so their
 * spacing tightens towards the edges exactly where the layout compresses its
 * tails, and the σ=0 line marks the collection mean.
 */
function sigmaGridLines(
  axis: ScatterGridLine['axis'],
  projection: AxisProjection,
): ScatterGridLine[] {
  if (!projection.gridDomain) return NO_GRID_LINES;
  const [min, max] = projection.gridDomain;
  return range(Math.ceil(min), Math.floor(max) + 1).map((sigma) => ({
    axis,
    sigma,
    // Graph space is y-down; match the point projection's flip.
    position:
      axis === 'x'
        ? projection.project(sigma)
        : GRAPH_SIZE - projection.project(sigma),
  }));
}

/**
 * Projects every font through the selected graph mode. Radial-tree points sit
 * on the dendrogram's leaf ring; treemap points sit at their equal-weight leaf
 * cell centers; scatter-plot points use `clustering.two` (the clustering
 * feature space's top two principal components), with each axis passed through
 * its own symlog projection. A mode whose required source data is absent
 * produces no points until `GraphContent` selects an available fallback.
 */
function createFontPointState(
  data: Record<string, FontItem>,
  mode: GraphMode,
  radial: RadialDendrogramLayout | null,
  treemap: TreemapLayout | null,
): FontPointState {
  if (mode !== 'scatter-plot') {
    const positionByKey =
      mode === 'radial-tree' ? radial?.positionByKey : treemap?.positionByKey;
    if (!positionByKey) return { points: [], gridLines: NO_GRID_LINES };

    const points = Object.values(data).flatMap((item) => {
      const position = positionByKey.get(item.meta.safe_name);
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
    return { points, gridLines: NO_GRID_LINES };
  }

  const located = Object.values(data).flatMap((item) => {
    const two = item.computed?.clustering?.two;
    return two ? [{ item, x: two[0], y: two[1] }] : [];
  });

  // Each axis is projected independently through its own symlog scale.
  const projectionX = createAxisProjection(located.map(({ x }) => x));
  const projectionY = createAxisProjection(located.map(({ y }) => y));

  const points = located.map(({ item, x, y }) => ({
    key: item.meta.safe_name,
    item,
    x: projectionX.project(x),
    // Graph space is y-down; flip so a higher score sits nearer the top.
    y: GRAPH_SIZE - projectionY.project(y),
  }));

  return {
    points,
    gridLines: [
      ...sigmaGridLines('x', projectionX),
      ...sigmaGridLines('y', projectionY),
    ],
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
    createFontPointState(
      appState.fonts.displayData,
      appState.ui.graphMode,
      radialDendrogramLayout(),
      treemapLayout(),
    ),
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

  return {
    points: () => state().points,
    gridLines: () => state().gridLines,
    selectablePoints,
    getPointByKey: (key: string) => indexes().byKey.get(key),
    getPointsByFamilyName: (familyName: string): readonly GraphPointData[] =>
      indexes().byFamilyName.get(familyName) ?? [],
    findSelectablePoint: (x: number, y: number, radius: number) => {
      if (appState.ui.graphMode === 'treemap') {
        const key = findTreemapLeafKey(x, y);
        return key && appState.fonts.filteredKeys.has(key)
          ? indexes().byKey.get(key)
          : undefined;
      }
      return selectableTree().find(x, y, radius);
    },
    getVisibleImageKeys: (
      bounds: GraphVisibleBounds,
      scale: number,
      showImages: boolean,
      showFontNames: boolean,
    ) => {
      // With images hidden and only name labels drawn, the labels are the sole
      // detail this thinning gates, so halve the non-treemap spacing.
      const isDenseLabelSpacing = !showImages && showFontNames;
      return collectVisibleRadialImageKeys(
        selectablePoints(),
        bounds,
        scale,
        appState.ui.graphMode === 'radial-tree' ||
          appState.ui.graphMode === 'treemap'
          ? isDenseLabelSpacing
            ? 16
            : 32
          : isDenseLabelSpacing
            ? 48
            : 64,
      );
    },
    getNearestSelectableFontItems: (selectedKey: string) => {
      const selectedPoint = indexes().byKey.get(selectedKey);
      if (!selectedPoint) return [];

      return findNearestFontItems(selectableTree(), selectedPoint);
    },
  };
});

export const fontPoints = fontPointIndex.points;

/** σ gridlines of the scatter layout; empty in both hierarchy layouts. */
export const scatterGridLines = fontPointIndex.gridLines;

export const getGraphPointByKey = fontPointIndex.getPointByKey;

export const getGraphPointsByFamilyName = fontPointIndex.getPointsByFamilyName;

export const findSelectableFontPoint = fontPointIndex.findSelectablePoint;

export const getVisibleImageKeys = fontPointIndex.getVisibleImageKeys;

export const getNearestSelectableFontItems =
  fontPointIndex.getNearestSelectableFontItems;
