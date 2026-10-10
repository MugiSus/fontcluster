import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRoot } from 'solid-js';
import { createRenderScheduler } from '../src/components/graph/gl/create-render-scheduler.ts';

function fixture(run) {
  const callbacks = new Map();
  let nextId = 0;
  const previousWindow = globalThis.window;
  globalThis.window = {
    requestAnimationFrame(callback) {
      callbacks.set(++nextId, callback);
      return nextId;
    },
    cancelAnimationFrame(id) {
      callbacks.delete(id);
    },
  };
  let dispose;
  const context = createRoot((cleanup) => {
    dispose = cleanup;
    return run({
      dispose: cleanup,
      pending: () => callbacks.size,
      frame() {
        for (const [id, callback] of [...callbacks]) {
          if (!callbacks.delete(id)) continue;
          callback();
        }
      },
    });
  });
  return Promise.resolve(context).finally(() => {
    dispose();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });
}

test('ordinary invalidations coalesce and leave idle frames untouched', () =>
  fixture(({ frame, pending }) => {
    let draws = 0;
    const scheduler = createRenderScheduler(() => draws++);
    scheduler.requestRender();
    scheduler.requestRender();
    assert.equal(pending(), 1);
    assert.equal(draws, 0);
    frame();
    assert.equal(draws, 1);
    frame();
    assert.equal(draws, 1);
    assert.equal(pending(), 0);
  }));

test('camera and layer updates draw before the current paint, with no second rAF', () =>
  fixture(async ({ frame, pending }) => {
    let camera = 0;
    let layer = 0;
    const draws = [];
    const scheduler = createRenderScheduler(() =>
      draws.push({ camera, layer }),
    );
    window.requestAnimationFrame(() => {
      camera = 1;
      scheduler.renderBeforePaint();
      layer = 1;
      scheduler.requestRender();
      scheduler.renderBeforePaint();
    });
    frame();
    assert.deepEqual(draws, []); // Wait for Solid's synchronous effects to finish.
    await Promise.resolve();
    assert.deepEqual(draws, [{ camera: 1, layer: 1 }]);
    assert.equal(pending(), 0);
    frame();
    assert.equal(draws.length, 1);
  }));

test('a camera flush consumes already-pending texture/selection work', () =>
  fixture(async ({ frame, pending }) => {
    let draws = 0;
    const scheduler = createRenderScheduler(() => draws++);
    scheduler.requestRender();
    scheduler.renderBeforePaint();
    await Promise.resolve();
    assert.equal(draws, 1);
    assert.equal(pending(), 0);
    frame();
    assert.equal(draws, 1);
  }));

test('disposal cancels both rAF and pre-paint work', () =>
  fixture(async ({ dispose, frame, pending }) => {
    let draws = 0;
    const scheduler = createRenderScheduler(() => draws++);
    scheduler.renderBeforePaint();
    dispose();
    await Promise.resolve();
    frame();
    scheduler.requestRender();
    scheduler.renderBeforePaint();
    await Promise.resolve();
    assert.equal(draws, 0);
    assert.equal(pending(), 0);
  }));

test('an invalidation during rendering is not lost', () =>
  fixture(({ frame, pending }) => {
    let draws = 0;
    const scheduler = createRenderScheduler(() => {
      draws++;
      if (draws === 1) scheduler.requestRender();
    });
    scheduler.requestRender();
    frame();
    assert.equal(draws, 1);
    assert.equal(pending(), 1);
    frame();
    assert.equal(draws, 2);
    assert.equal(pending(), 0);
  }));
