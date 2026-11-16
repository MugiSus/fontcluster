import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSAnimation } from 'motion';
import { getScrollInertia } from '../src/lib/scroll-inertia.ts';

test('low-speed inertia decays proportionally faster, without a final speed spike', () => {
  const { keyframes, duration } = getScrollInertia({
    velocity: 1000,
    restDelta: 1,
  });
  const steps = keyframes.slice(1).map((value, i) => value - keyframes[i]);
  const ratios = steps.slice(1).map((value, i) => value / steps[i]);
  assert.ok(steps[0] > 7.8 && steps[0] < 8, 'preserve release speed');
  assert.ok(Math.abs(ratios[0] - 0.975) < 1e-10);
  assert.ok(ratios.at(-1) < 0.93, 'stronger braking in the tail');
  assert.ok(
    steps.every((value, i) => value > 0 && (!i || value <= steps[i - 1])),
  );
  assert.ok(duration < 1, 'avoid the previous multi-second tail');
});

test('direction, remaining-distance threshold, and list boundaries', () => {
  const forward = getScrollInertia({ velocity: 1000, restDelta: 1 });
  const backward = getScrollInertia({ velocity: -1000, restDelta: 1 });
  assert.deepEqual(
    backward.keyframes,
    forward.keyframes.map((v) => -v),
  );
  const precise = getScrollInertia({ velocity: 1000, restDelta: 0.0001 });
  const remainder = precise.keyframes.at(-1) - forward.keyframes.at(-1);
  assert.ok(remainder > 0 && remainder <= 1);
  for (const velocity of [-1000, 1000]) {
    const bounded = getScrollInertia({
      velocity,
      restDelta: 1,
      min: -12,
      max: 20,
    });
    assert.ok(bounded.keyframes.every((v) => v >= -12 && v <= 20));
    assert.equal(bounded.keyframes.at(-1), velocity < 0 ? -12 : 20);
  }
  assert.deepEqual(getScrollInertia({ velocity: 0, restDelta: 1 }), {
    keyframes: [0],
    duration: 0,
  });
});

test('Motion interpolates the same curve at 60 and 120 Hz and finishes once', () => {
  const curve = getScrollInertia({ velocity: 1000, restDelta: 0.5 });
  const runs = [60, 120].map((hz) => {
    let updates = 0;
    let completions = 0;
    let tick;
    let value = 0;
    const animation = new JSAnimation({
      keyframes: curve.keyframes,
      duration: curve.duration * 1000,
      ease: 'linear',
      driver: (update) => {
        tick = update;
        return { start() {}, stop() {}, now: () => 0 };
      },
      onUpdate: (next) => {
        updates++;
        value = next;
      },
      onComplete: () => completions++,
    });
    const samples = Array.from({ length: hz / 2 + 1 }, (_, i) => {
      tick((i * 1000) / hz);
      return value;
    });
    assert.ok(updates >= samples.length);
    assert.ok(samples.every((v, i) => !i || v > samples[i - 1]));
    tick(curve.duration * 1000 + 1);
    assert.equal(value, curve.keyframes.at(-1));
    assert.equal(completions, 1);
    animation.stop();
    return samples;
  });
  runs[0].forEach((v, i) => assert.ok(Math.abs(v - runs[1][i * 2]) < 1e-8));
});
