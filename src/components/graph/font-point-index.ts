import { createMemo, createRoot } from 'solid-js';
import { quadtree, type Quadtree } from 'd3-quadtree';
import { appState } from '@/store';
import { getClusterColorAngle } from '@/lib/cluster-colors';
import { activeGraphLayout } from './layouts/active-graph-layout';
import { collectVisibleCartesianImageKeys } from './cartesian-image-visibility';
import { collectVisibleRadialImageKeys } from './radial-image-visibility';
import { type GraphPointData, type GraphVisibleBounds } from './types';

interface FontPointIndexes {
  byKey: Map<string, GraphPointData>;
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

const fontPointIndex = createRoot(() => {
  const points = createMemo<GraphPointData[]>(() => {
    const layout = activeGraphLayout();
    if (!layout) return [];
    return Object.values(appState.fonts.displayData).flatMap((item) => {
      const position = layout.positionByKey.get(item.meta.safe_name);
      return position
        ? [
            {
              key: item.meta.safe_name,
              item,
              x: position.x,
              y: position.y,
              colorAngle: getClusterColorAngle(item.computed?.clustering),
            },
          ]
        : [];
    });
  });
  const indexes = createMemo<FontPointIndexes>(() => {
    const byKey = new Map<string, GraphPointData>();

    for (const point of points()) {
      byKey.set(point.key, point);
    }

    return { byKey };
  });
  const selectablePoints = createMemo(() =>
    getSelectableFontPointData(points(), appState.fonts.filteredKeys),
  );
  const selectableTree = createMemo(() =>
    createSelectableFontPointTree(selectablePoints()),
  );

  return {
    points,
    selectablePoints,
    getPointByKey: (key: string) => indexes().byKey.get(key),
    findNearestSelectablePoint: (x: number, y: number) =>
      selectableTree().find(x, y),
    findSelectablePoint: (x: number, y: number, radius: number) => {
      return selectableTree().find(x, y, radius);
    },
    getVisibleDetailKeys: (
      bounds: GraphVisibleBounds,
      scale: number,
      showImages: boolean,
      showFontNames: boolean,
    ) => {
      // With images hidden and only name labels drawn, the labels are the sole
      // detail this thinning gates, so reduce the normal spacing.
      const isDenseLabelSpacing = !showImages && showFontNames;
      const detailGapPx =
        appState.ui.graphMode === 'scatter-plot'
          ? isDenseLabelSpacing
            ? 40
            : 60
          : isDenseLabelSpacing
            ? 16
            : 32;
      return appState.ui.graphMode === 'radial-tree'
        ? collectVisibleRadialImageKeys(
            selectablePoints(),
            bounds,
            scale,
            detailGapPx,
          )
        : collectVisibleCartesianImageKeys(
            selectableTree(),
            bounds,
            scale,
            detailGapPx,
          );
    },
  };
});

export const fontPoints = fontPointIndex.points;

export const getGraphPointByKey = fontPointIndex.getPointByKey;

export const findSelectableFontPoint = fontPointIndex.findSelectablePoint;

/** Nearest font position in every layout. */
export const findNearestSelectableFontPoint =
  fontPointIndex.findNearestSelectablePoint;

export const getVisibleDetailKeys = fontPointIndex.getVisibleDetailKeys;
