/** Screen-space drag inertia; callers retain ownership of position and playback.
 * Uses WebKit's speed-dependent decay coefficients, without its device-specific
 * input acceleration: https://github.com/WebKit/WebKit/blob/main/Source/WebKit/WebProcess/WebPage/MomentumEventDispatcher.cpp
 */
export function getScrollInertia({
  velocity,
  restDelta,
  min = -Infinity,
  max = Infinity,
}: {
  velocity: number;
  restDelta: number;
  min?: number;
  max?: number;
}) {
  // Fixed sampling is independent of display refresh rate. Motion interpolates
  // these positions on every animation frame, including on 120 Hz displays.
  const sampleSeconds = 0.008;
  const direction = Math.sign(velocity);
  const limit = Math.max(0, direction < 0 ? -min : max);
  const distances = [0];
  let speed = Math.abs(velocity);
  let distance = 0;
  // The slowest decay bounds the uncomputed travel to less than 0.0001 px.
  // This numerical tolerance is separate from the caller's stopping threshold.
  const maximumTimeConstant = -sampleSeconds / Math.log(0.975);
  while (speed * maximumTimeConstant > 0.0001 && distance < limit) {
    const retention = 0.975 - 0.065 * Math.max(0, 1 - speed / 250);
    const decayRate = -Math.log(retention) / sampleSeconds;
    const nextSpeed = speed * retention;
    // Integrate the exponential over this sample, preserving release speed.
    distance = Math.min(limit, distance + (speed - nextSpeed) / decayRate);
    distances.push(distance);
    speed = nextSpeed;
  }

  const target = distance;
  const stopIndex = distances.findIndex(
    (value, index) =>
      index > 0 && target < limit && target - value <= restDelta,
  );
  const keyframes = distances
    .slice(0, stopIndex < 0 ? distances.length : stopIndex + 1)
    .map((value) => direction * value);
  // Stop once remaining travel is within restDelta, without a final snap that
  // would briefly accelerate the tail. A bounded list still reaches its edge.
  return { keyframes, duration: (keyframes.length - 1) * sampleSeconds };
}
