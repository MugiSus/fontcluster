import { GRAPH_SIZE } from './constants';
import { type GraphVisibleBounds } from './types';

const DETAIL_IMAGE_GAP_PX = 24;
const CENTER = GRAPH_SIZE / 2;

interface DetailPoint {
  key: string;
  x: number;
  y: number;
}

interface BucketCandidate {
  key: string;
  score: number;
}

/**
 * Chooses visible image keys with a radial-tree oriented density rule.
 *
 * The graph is laid out from the center, so screen-space square or hex grids
 * thin unrelated angular neighborhoods together. This rule bins points in
 * polar space instead: radius is divided into `DETAIL_IMAGE_GAP_PX` bands,
 * then each band is divided into a whole number of angular slots whose arc
 * length at that band is approximately `DETAIL_IMAGE_GAP_PX`. Rounding the slot
 * count keeps the ring evenly divided, so no narrow seam slot survives at the
 * `theta = 0` wrap. The point closest to each polar slot center is selected.
 * This is display-only derived data; hit testing and
 * graph state remain owned by their existing quadtree/index modules.
 */
export function collectVisibleRadialImageKeys(
  points: readonly DetailPoint[],
  bounds: GraphVisibleBounds,
  scale: number,
): Set<string> {
  const gap = Math.max(DETAIL_IMAGE_GAP_PX * scale, Number.EPSILON);
  const buckets = new Map<number, Map<number, BucketCandidate>>();

  for (const point of points) {
    if (
      point.x < bounds.minX ||
      point.x > bounds.maxX ||
      point.y < bounds.minY ||
      point.y > bounds.maxY
    ) {
      continue;
    }

    const radius = Math.hypot(point.x - CENTER, point.y - CENTER);
    const normalizedAngle =
      (Math.atan2(point.y - CENTER, point.x - CENTER) + Math.PI * 2) %
      (Math.PI * 2);
    const radiusBucket = Math.floor(radius / gap);
    const radiusCenter = Math.max((radiusBucket + 0.5) * gap, Number.EPSILON);
    const slotCount = Math.max(
      1,
      Math.round((Math.PI * 2 * radiusCenter) / gap),
    );
    const angleStep = (Math.PI * 2) / slotCount;
    const angleBucket = Math.floor(normalizedAngle / angleStep) % slotCount;
    const angleToSlotCenter = Math.abs(
      normalizedAngle - (angleBucket + 0.5) * angleStep,
    );
    const score =
      Math.min(angleToSlotCenter, Math.PI * 2 - angleToSlotCenter) / angleStep +
      Math.abs(radius - radiusCenter) / gap;
    let angleBuckets = buckets.get(radiusBucket);

    if (!angleBuckets) {
      angleBuckets = new Map<number, BucketCandidate>();
      buckets.set(radiusBucket, angleBuckets);
    }

    const current = angleBuckets.get(angleBucket);
    if (!current || score < current.score) {
      angleBuckets.set(angleBucket, { key: point.key, score });
    }
  }

  const visibleKeys = new Set<string>();
  for (const angleBuckets of buckets.values()) {
    for (const candidate of angleBuckets.values()) {
      visibleKeys.add(candidate.key);
    }
  }
  return visibleKeys;
}
