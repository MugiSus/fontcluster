import { least } from 'd3-array';
import { Box2, Vector2 } from 'three';

/** Screen-space connector geometry; callers own the measured preview bounds. */
export function getPreviewConnector(
  bounds: Box2,
  center: Vector2,
  radius: number,
  exclusionBounds: Box2 = bounds,
) {
  // Reserve breathing room around both the sample images and their name.
  const region = exclusionBounds.clone().expandByVector(new Vector2(16, 8));
  if (region.distanceToPoint(center) <= radius) return null;

  const { min, max } = region;
  // Keep the directional center between the second and third sample rows.
  const middle = bounds.getCenter(new Vector2());
  const direction = center.clone().sub(middle);
  const start = least(
    [
      new Vector2(middle.x, min.y),
      new Vector2(max.x, middle.y),
      new Vector2(middle.x, max.y),
      new Vector2(min.x, middle.y),
    ].filter(
      // Only use a side facing the target so the line cannot cross the preview.
      (candidate) =>
        candidate.clone().sub(middle).dot(center.clone().sub(candidate)) >= 0,
    ),
    (candidate) => candidate.clone().sub(middle).angleTo(direction),
  );
  if (!start) return null;

  return {
    start,
    end: center.clone().lerp(start, radius / center.distanceTo(start)),
  };
}
