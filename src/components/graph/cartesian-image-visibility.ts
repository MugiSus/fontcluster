import { type Quadtree } from 'd3-quadtree';
import { type GraphVisibleBounds } from './types';

interface DetailPoint {
  key: string;
  x: number;
  y: number;
}

/**
 * Selects one nearby point per screen-space hex-grid site. The quadtree owns
 * nearest-neighbour lookup, while the grid keeps image and label density
 * uniform for Cartesian trees, maps and scatter plots.
 */
export function collectVisibleCartesianImageKeys<T extends DetailPoint>(
  pointTree: Quadtree<T>,
  bounds: GraphVisibleBounds,
  scale: number,
  detailImageGapPx: number,
): Set<string> {
  const hexHeight = Math.max(detailImageGapPx * scale, Number.EPSILON);
  const rowStep = hexHeight * 0.75;
  const columnStep = hexHeight * 0.866;
  const evenRowOffset = hexHeight * 0.433;
  const searchRadius = hexHeight * 0.5;
  const visibleKeys = new Set<string>();
  const startRow = Math.floor(bounds.minY / rowStep);
  const endRow = Math.ceil(bounds.maxY / rowStep);

  for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
    const centerY = rowIndex * rowStep;
    const rowOffset = rowIndex % 2 === 0 ? evenRowOffset : 0;
    const startColumn = Math.floor((bounds.minX - rowOffset) / columnStep);
    const endColumn = Math.ceil((bounds.maxX - rowOffset) / columnStep);

    for (
      let columnIndex = startColumn;
      columnIndex <= endColumn;
      columnIndex += 1
    ) {
      const centerX = columnIndex * columnStep + rowOffset;
      const nearest = pointTree.find(centerX, centerY, searchRadius);
      if (
        nearest &&
        nearest.x >= bounds.minX &&
        nearest.x <= bounds.maxX &&
        nearest.y >= bounds.minY &&
        nearest.y <= bounds.maxY
      ) {
        visibleKeys.add(nearest.key);
      }
    }
  }

  return visibleKeys;
}
