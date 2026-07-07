import { createMemo, createRoot } from 'solid-js';
import { quadtree, type Quadtree } from 'd3-quadtree';
import { appState } from '@/store';
import { type FontItem } from '@/types/font';
import {
  radialDendrogramLayout,
  type RadialDendrogramLayout,
} from './dendrogram-layout';
import { collectVisibleRadialImageKeys } from './radial-image-visibility';
import { type GraphPointData, type GraphVisibleBounds } from './types';

const MAX_NEAREST_FONT_ITEMS = 60;

interface FontPointIndexes {
  byKey: Map<string, GraphPointData>;
  byFamilyName: Map<string, GraphPointData[]>;
}

/**
 * Dendrogram mode is the graph layout: every analysed font sits on the radial
 * tree's leaf ring. Sessions without a recorded dendrogram produce no graph
 * points and are outside the supported display path.
 */
function createFontPointState(
  data: Record<string, FontItem>,
  radial: RadialDendrogramLayout | null,
): GraphPointData[] {
  if (!radial) return [];
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
