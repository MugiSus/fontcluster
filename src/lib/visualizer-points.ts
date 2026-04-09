import { quadtree, type Quadtree } from 'd3-quadtree';
import { type FontMetadata, type FontWeight } from '../types/font';

export const GRAPH_PADDING = 50;
export const GRAPH_SIZE = 1000;
export const WORLD_SIZE = GRAPH_SIZE + GRAPH_PADDING * 2;
export const GRAPH_CENTER = GRAPH_PADDING + GRAPH_SIZE / 2;

export interface VisualizedPoint {
  key: string;
  metadata: FontMetadata;
  x: number;
  y: number;
}

export function buildVisualizedPoints(
  fontRecord: Record<string, FontMetadata>,
): VisualizedPoint[] {
  const vecs = Object.values(fontRecord).filter((v) => v.computed?.vector);

  if (vecs.length === 0) return [];

  const [minX, maxX] = vecs.reduce<[number, number]>(
    ([min, max], v) => {
      const x = v.computed?.vector[0] ?? 0;
      return [Math.min(min, x), Math.max(max, x)];
    },
    [Infinity, -Infinity],
  );
  const [minY, maxY] = vecs.reduce<[number, number]>(
    ([min, max], v) => {
      const y = v.computed?.vector[1] ?? 0;
      return [Math.min(min, y), Math.max(max, y)];
    },
    [Infinity, -Infinity],
  );

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  return vecs.map((metadata) => {
    const vx = metadata.computed?.vector[0] ?? 0;
    const vy = metadata.computed?.vector[1] ?? 0;

    return {
      key: metadata.safe_name,
      metadata,
      x: GRAPH_PADDING + ((vx - minX) / rangeX) * GRAPH_SIZE,
      y: GRAPH_PADDING + ((vy - minY) / rangeY) * GRAPH_SIZE,
    } satisfies VisualizedPoint;
  });
}

export function buildPointsMap(
  points: VisualizedPoint[],
): Map<string, VisualizedPoint> {
  const map = new Map<string, VisualizedPoint>();

  for (const point of points) {
    map.set(point.key, point);
  }

  return map;
}

export function buildFontQuadtree(
  pointsMap: Map<string, VisualizedPoint>,
  filteredKeys: Set<string>,
  activeWeights: FontWeight[],
): Quadtree<VisualizedPoint> {
  const activeWeightSet = new Set(activeWeights);
  const activePoints: VisualizedPoint[] = [];

  for (const key of filteredKeys) {
    const point = pointsMap.get(key);
    if (!point) continue;

    if (activeWeightSet.has(point.metadata.weight as FontWeight)) {
      activePoints.push(point);
    }
  }

  return quadtree<VisualizedPoint>()
    .x((point) => point.x)
    .y((point) => point.y)
    .addAll(activePoints);
}
