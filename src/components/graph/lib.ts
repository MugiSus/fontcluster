import { quadtree } from 'd3-quadtree';
import { type FontMetadata, type FontWeight } from '../../types/font';

const IMAGE_GRID_HEX_HEIGHT_PX = 96;
const VISIBLE_BOUNDS_PADDING = 50;

export interface GraphViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GraphVisibleBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface GraphPointData {
  key: string;
  metadata: FontMetadata;
  x: number;
  y: number;
}

interface ImageGridMetrics {
  rowStep: number;
  columnStep: number;
  evenRowOffset: number;
  searchRadius: number;
}

export interface PartitionedVisiblePoints {
  visibleFilteredPoints: GraphPointData[];
  visibleUnfilteredPoints: GraphPointData[];
  visibleActivePoints: GraphPointData[];
}

export function getVisibleBounds(
  viewBox: GraphViewBox,
  size: { width: number; height: number },
  scale: number,
): GraphVisibleBounds {
  const visibleWidth = size.width * scale;
  const visibleHeight = size.height * scale;

  return {
    minX:
      viewBox.x +
      viewBox.width / 2 -
      visibleWidth / 2 -
      VISIBLE_BOUNDS_PADDING * scale,
    maxX:
      viewBox.x +
      viewBox.width / 2 +
      visibleWidth / 2 +
      VISIBLE_BOUNDS_PADDING * scale,
    minY:
      viewBox.y +
      viewBox.height / 2 -
      visibleHeight / 2 -
      VISIBLE_BOUNDS_PADDING * scale,
    maxY:
      viewBox.y +
      viewBox.height / 2 +
      visibleHeight / 2 +
      VISIBLE_BOUNDS_PADDING * scale,
  };
}

export function partitionVisiblePoints(
  points: GraphPointData[],
  filteredKeys: Set<string>,
  activeWeights: Set<FontWeight>,
  bounds: GraphVisibleBounds,
): PartitionedVisiblePoints {
  const visibleFilteredPoints: GraphPointData[] = [];
  const visibleUnfilteredPoints: GraphPointData[] = [];
  const visibleActivePoints: GraphPointData[] = [];

  for (const point of points) {
    const isWeightIncluded = activeWeights.has(
      point.metadata.weight as FontWeight,
    );
    const isVisible =
      point.x >= bounds.minX &&
      point.x <= bounds.maxX &&
      point.y >= bounds.minY &&
      point.y <= bounds.maxY;

    if (!isWeightIncluded || !isVisible) continue;

    visibleActivePoints.push(point);
    if (filteredKeys.has(point.key)) {
      visibleFilteredPoints.push(point);
      continue;
    }

    visibleUnfilteredPoints.push(point);
  }

  return {
    visibleFilteredPoints,
    visibleUnfilteredPoints,
    visibleActivePoints,
  };
}

function getImageGridMetrics(scale: number): ImageGridMetrics {
  const hexHeight = IMAGE_GRID_HEX_HEIGHT_PX * scale;
  return {
    rowStep: hexHeight * 0.75,
    columnStep: hexHeight * 0.866,
    evenRowOffset: hexHeight * 0.433,
    searchRadius: hexHeight * 0.5,
  };
}

export function collectVisibleImageKeys(
  points: GraphPointData[],
  filteredKeys: Set<string>,
  activeWeights: Set<FontWeight>,
  bounds: GraphVisibleBounds,
  scale: number,
): Set<string> {
  const { visibleActivePoints } = partitionVisiblePoints(
    points,
    filteredKeys,
    activeWeights,
    bounds,
  );
  if (visibleActivePoints.length === 0) return new Set<string>();

  const metrics = getImageGridMetrics(scale);
  const tree = quadtree<GraphPointData>()
    .x((d) => d.x)
    .y((d) => d.y)
    .addAll(visibleActivePoints);

  const visibleKeys = new Set<string>();
  const startRow = Math.floor(bounds.minY / metrics.rowStep);
  const endRow = Math.ceil(bounds.maxY / metrics.rowStep);

  for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
    const centerY = rowIndex * metrics.rowStep;
    const rowOffset = rowIndex % 2 === 0 ? metrics.evenRowOffset : 0;
    const startColumn = Math.floor(
      (bounds.minX - rowOffset) / metrics.columnStep,
    );
    const endColumn = Math.ceil((bounds.maxX - rowOffset) / metrics.columnStep);

    for (
      let columnIndex = startColumn;
      columnIndex <= endColumn;
      columnIndex += 1
    ) {
      const centerX = columnIndex * metrics.columnStep + rowOffset;
      const nearest = tree.find(centerX, centerY, metrics.searchRadius);
      if (nearest) {
        visibleKeys.add(nearest.key);
      }
    }
  }

  return visibleKeys;
}
