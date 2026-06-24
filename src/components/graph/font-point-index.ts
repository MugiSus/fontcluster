import { createMemo, createRoot } from 'solid-js';
import { quadtree, type Quadtree, type QuadtreeLeaf } from 'd3-quadtree';
import { appState } from '../../store';
import { type FontItem } from '../../types/font';
import { GRAPH_SIZE } from './constants';
import {
  type GraphCoordinate,
  type GraphPointData,
  type GraphVisibleBounds,
} from './types';
import { collectVisibleImageKeys } from './lib';

const MAX_NEAREST_FONT_ITEMS = 120;

interface VectorBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface FontPointState {
  points: GraphPointData[];
  origin: GraphCoordinate;
  graphUnitsPerRawUnit: number;
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

function getVectorBounds(fontItems: FontItem[]): VectorBounds {
  if (fontItems.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let hasPosition = false;

  for (const item of fontItems) {
    const position = getFontVectorPosition(item);
    if (!position) continue;

    hasPosition = true;
    minX = Math.min(minX, position.x);
    maxX = Math.max(maxX, position.x);
    minY = Math.min(minY, position.y);
    maxY = Math.max(maxY, position.y);
  }

  if (!hasPosition) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }

  return { minX, maxX, minY, maxY };
}

function createFontPointState(data: Record<string, FontItem>): FontPointState {
  const fontItems = Object.values(data);
  const { minX, maxX, minY, maxY } = getVectorBounds(fontItems);
  const rangeX = maxX - minX;
  const rangeY = maxY - minY;
  const graphUnitsPerRawUnit = GRAPH_SIZE / (Math.max(rangeX, rangeY) || 1);
  const offsetX = (GRAPH_SIZE - rangeX * graphUnitsPerRawUnit) / 2;
  const offsetY = (GRAPH_SIZE - rangeY * graphUnitsPerRawUnit) / 2;

  const points: GraphPointData[] = [];
  for (const item of fontItems) {
    const position = getFontVectorPosition(item);
    if (!position) continue;

    points.push({
      key: item.meta.safe_name,
      item,
      x: (position.x - minX) * graphUnitsPerRawUnit + offsetX,
      y: (maxY - position.y) * graphUnitsPerRawUnit + offsetY,
    });
  }

  const origin = {
    x: (0 - minX) * graphUnitsPerRawUnit + offsetX,
    y: (maxY - 0) * graphUnitsPerRawUnit + offsetY,
  };

  return {
    points,
    origin,
    graphUnitsPerRawUnit,
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
    createFontPointState(appState.fonts.displayData),
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
    graphUnitsPerRawUnit: () => state().graphUnitsPerRawUnit,
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

export const graphUnitsPerRawUnit = fontPointIndex.graphUnitsPerRawUnit;

export const getGraphPointByKey = fontPointIndex.getPointByKey;

export const getGraphPointsByFamilyName = fontPointIndex.getPointsByFamilyName;

export const getSelectableFontPoints = fontPointIndex.selectablePoints;

export const findSelectableFontPoint = fontPointIndex.findSelectablePoint;

export const getVisibleImageKeys = fontPointIndex.getVisibleImageKeys;

export const getNearestSelectableFontItems =
  fontPointIndex.getNearestSelectableFontItems;

export const getSelectableFontPointsInBounds =
  fontPointIndex.getSelectablePointsInBounds;
