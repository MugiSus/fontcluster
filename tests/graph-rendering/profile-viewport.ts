import type { GraphViewportController } from '../../src/components/graph/use-graph-viewport';

/** Diagnostic only: nonblocking GPU timer queries and scheduled JS duration. */
export async function profileViewport(
  canvas: HTMLCanvasElement,
  viewport: GraphViewportController,
) {
  const gl = canvas.getContext('webgl2')!;
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = debug
    ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
    : gl.getParameter(gl.RENDERER);
  const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const raf = window.requestAnimationFrame.bind(window);
  const microtask = window.queueMicrotask.bind(window);
  const clear = gl.clear.bind(gl);
  const cpuTimes: number[] = [];
  const queries: WebGLQuery[] = [];
  const gpuTimes: number[] = [];
  const frameIntervals: number[] = [];
  let activeQuery: WebGLQuery | null = null;
  let disjoint = false;
  const timed = (callback: () => void) => {
    const start = performance.now();
    callback();
    cpuTimes.push(performance.now() - start);
  };
  window.requestAnimationFrame = (callback) =>
    raf((time) => timed(() => callback(time)));
  window.queueMicrotask = (callback) => microtask(() => timed(callback));
  if (timer) {
    gl.clear = (mask) => {
      if (!activeQuery) {
        const query = gl.createQuery()!;
        activeQuery = query;
        gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
        microtask(() => {
          gl.endQuery(timer.TIME_ELAPSED_EXT);
          queries.push(query);
          activeQuery = null;
        });
      }
      clear(mask);
    };
  }
  const nextFrame = () =>
    new Promise<void>((resolve) => raf(() => microtask(resolve)));
  const collect = () => {
    if (!timer) return;
    disjoint ||= gl.getParameter(timer.GPU_DISJOINT_EXT);
    while (
      queries.length &&
      gl.getQueryParameter(queries[0]!, gl.QUERY_RESULT_AVAILABLE)
    ) {
      const query = queries.shift()!;
      gpuTimes.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(query);
    }
  };
  try {
    viewport.refreshViewportRect();
    viewport.startPanDrag(
      new MouseEvent('mousedown', { clientX: 100, clientY: 100 }),
    );
    let lastFrameAt = performance.now();
    for (let i = 1; i <= 60; i++) {
      viewport.dragPan(
        new MouseEvent('mousemove', { clientX: 100 + i, clientY: 100 + i }),
      );
      await nextFrame();
      const frameAt = performance.now();
      frameIntervals.push(frameAt - lastFrameAt);
      lastFrameAt = frameAt;
      collect();
    }
    viewport.endPanDrag();
    for (let i = 0; i < 4; i++) {
      await nextFrame();
      collect();
    }
    return {
      renderer,
      samples: 60,
      animationFramesPerSecond: +(
        60000 / frameIntervals.reduce((sum, value) => sum + value, 0)
      ).toFixed(1),
      frameIntervalP95Ms: +frameIntervals
        .toSorted((a, b) => a - b)[56]!
        .toFixed(1),
      scheduledCpuMsPerInput: +(
        cpuTimes.reduce((sum, value) => sum + value, 0) / 60
      ).toFixed(3),
      longestScheduledCpuCallbackMs: +Math.max(...cpuTimes).toFixed(3),
      gpuSamples: gpuTimes.length,
      gpuMsPerFrame:
        !disjoint && gpuTimes.length
          ? +(
              gpuTimes.reduce((sum, value) => sum + value, 0) / gpuTimes.length
            ).toFixed(3)
          : null,
      gpuTimingStatus: !timer
        ? 'timer extension unavailable'
        : disjoint
          ? 'discarded: GPU disjoint'
          : 'available',
    };
  } finally {
    window.requestAnimationFrame = raf;
    window.queueMicrotask = microtask;
    gl.clear = clear;
    for (const query of queries) gl.deleteQuery(query);
  }
}
