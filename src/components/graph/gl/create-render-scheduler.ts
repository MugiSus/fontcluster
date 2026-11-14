import { onCleanup } from 'solid-js';

/** Owns only pending GPU work, never camera or application state. */
export function createRenderScheduler(render: () => void) {
  let frameId: number | undefined;
  let isFlushQueued = false;
  let isDisposed = false;

  const flush = () => {
    if (frameId === undefined) return;
    window.cancelAnimationFrame(frameId);
    frameId = undefined;
    render();
  };

  const requestRender = () => {
    if (isDisposed || frameId !== undefined) return;
    frameId = window.requestAnimationFrame(flush);
  };

  // Viewport input is already frame-coalesced. A second rAF here would paint
  // the DOM/HUD with the new camera but leave the canvas one frame behind.
  // The microtask lets all Solid layer effects finish before drawing in the
  // current paint; ordinary texture/selection invalidations still use rAF.
  const renderBeforePaint = () => {
    requestRender();
    if (isDisposed || isFlushQueued) return;
    isFlushQueued = true;
    queueMicrotask(() => {
      isFlushQueued = false;
      flush();
    });
  };

  onCleanup(() => {
    isDisposed = true;
    if (frameId !== undefined) window.cancelAnimationFrame(frameId);
    frameId = undefined;
  });

  return { requestRender, renderBeforePaint };
}
