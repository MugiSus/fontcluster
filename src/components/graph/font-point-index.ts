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
  byFamilyName: Map<string, GraphPointData[]>;
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
    const byFamilyName = new Map<string, GraphPointData[]>();

    for (const point of points()) {
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
    getSelectableFontPointData(points(), appState.fonts.filteredKeys),
  );
  const selectableTree = createMemo(() =>
    createSelectableFontPointTree(selectablePoints()),
  );

  return {
    points,
    selectablePoints,
    getPointByKey: (key: string) => indexes().byKey.get(key),
    getPointsByFamilyName: (familyName: string): readonly GraphPointData[] =>
      indexes().byFamilyName.get(familyName) ?? [],
    findSelectablePoint: (x: number, y: number, radius: number) => {
      const findLeafKeyAt = activeGraphLayout()?.findLeafKeyAt;
      if (findLeafKeyAt) {
        const key = findLeafKeyAt(x, y);
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
      // detail this thinning gates, so reduce the normal spacing.
      const isDenseLabelSpacing = !showImages && showFontNames;
      const detailImageGapPx =
        appState.ui.graphMode === 'scatter-plot' ||
        appState.ui.graphMode === 'rectangular-treemap' ||
        appState.ui.graphMode === 'voronoi-treemap'
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
            detailImageGapPx,
          )
        : collectVisibleCartesianImageKeys(
            selectableTree(),
            bounds,
            scale,
            detailImageGapPx,
          );
    },
  };
});

export const fontPoints = fontPointIndex.points;

export const getGraphPointByKey = fontPointIndex.getPointByKey;

export const getGraphPointsByFamilyName = fontPointIndex.getPointsByFamilyName;

export const findSelectableFontPoint = fontPointIndex.findSelectablePoint;

export const getVisibleImageKeys = fontPointIndex.getVisibleImageKeys;
