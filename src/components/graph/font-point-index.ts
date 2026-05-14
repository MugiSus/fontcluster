import { createMemo, createRoot } from 'solid-js';
import { quadtree, type Quadtree } from 'd3-quadtree';
import { appState } from '../../store';
import { type FontItem } from '../../types/font';
import { GRAPH_SIZE } from './constants';
import { type GraphPointData } from './types';

export const MAX_NEAREST_FONT_ITEMS = 120;

interface VectorBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
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

function createFontPoints(data: Record<string, FontItem>): GraphPointData[] {
  const fontItems = Object.values(data);
  const { minX, maxX, minY, maxY } = getVectorBounds(fontItems);
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  const points: GraphPointData[] = [];
  for (const item of fontItems) {
    const position = getFontVectorPosition(item);
    if (!position) continue;

    points.push({
      key: item.meta.safe_name,
      item,
      x: ((position.x - minX) / rangeX) * GRAPH_SIZE,
      y: ((position.y - minY) / rangeY) * GRAPH_SIZE,
    });
  }

  return points;
}

function createSelectableFontPointTree(
  points: GraphPointData[],
  filteredKeys: Set<string>,
): Quadtree<GraphPointData> {
  const selectablePoints = points.filter((point) =>
    filteredKeys.has(point.key),
  );

  return quadtree<GraphPointData>()
    .x((point) => point.x)
    .y((point) => point.y)
    .addAll(selectablePoints);
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

export const fontPoints = createRoot(() => {
  const memo = createMemo(() => createFontPoints(appState.fonts.data));
  return memo;
});

export const fontPointByKey = createRoot(() => {
  const memo = createMemo(
    () => new Map(fontPoints().map((point) => [point.key, point])),
  );
  return memo;
});

export const selectableFontPointTree = createRoot(() => {
  const memo = createMemo(() =>
    createSelectableFontPointTree(fontPoints(), appState.fonts.filteredKeys),
  );
  return memo;
});

export function getNearestSelectableFontItems(selectedKey: string): FontItem[] {
  const selectedPoint = fontPointByKey().get(selectedKey);
  if (!selectedPoint) return [];

  return findNearestFontItems(selectableFontPointTree(), selectedPoint);
}
