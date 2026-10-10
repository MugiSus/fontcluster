import { createSignal, createEffect } from 'solid-js';
import { checkImageLifecycle } from './image-layer-checks';
import { checkSelectionInput } from './selection-checks';
import { profileViewport } from './profile-viewport';
import { render } from 'solid-js/web';
import { ColorModeProvider } from '@kobalte/core';
import { BatchedText, Text } from 'troika-three-text';
import type {
  GraphPointData,
  GraphPointLabel,
} from '../../src/components/graph/types';

import { useGraphViewport } from '../../src/components/graph/use-graph-viewport';
import { useGraphGlRenderer } from '../../src/components/graph/gl/use-graph-gl-renderer';

// Run with `pnpm dev`, then open /tests/graph-rendering/ and click Run checks.
// Uses actual Solid hooks, Three renderer and WebGL commands, without Tauri
// or user session data. Counters belong only to this isolated diagnostic page.
let textLayouts = 0;
let boundsUpdates = 0;
const textSync = Text.prototype.sync;
Text.prototype.sync = function (callback) {
  textLayouts++;
  return textSync.call(this, callback);
};
const updateBounds = BatchedText.prototype.updateMatrixWorld;
BatchedText.prototype.updateMatrixWorld = function (force) {
  boundsUpdates++;
  return updateBounds.call(this, force);
};

let frame = 0;
const nativeRaf = window.requestAnimationFrame.bind(window);
function tick() {
  frame++;
  nativeRaf(tick);
}
nativeRaf(tick);
let draws = 0;
let programs = 0;
let deletions = 0;
const drawFrames: number[] = [];
for (const method of [
  'drawArrays',
  'drawElements',
  'drawArraysInstanced',
  'drawElementsInstanced',
] as const) {
  const original = WebGL2RenderingContext.prototype[method] as (
    ...args: number[]
  ) => void;
  WebGL2RenderingContext.prototype[method] = function (...args: number[]) {
    draws++;
    drawFrames.push(frame);
    return original.apply(this, args);
  };
}
const link = WebGL2RenderingContext.prototype.linkProgram;
WebGL2RenderingContext.prototype.linkProgram = function (program) {
  programs++;
  return link.call(this, program);
};
const del = WebGL2RenderingContext.prototype.deleteProgram;
WebGL2RenderingContext.prototype.deleteProgram = function (program) {
  deletions++;
  return del.call(this, program);
};
const nextFrame = () =>
  new Promise<void>((resolve) => nativeRaf(() => queueMicrotask(resolve)));
const settle = async (count = 4) => {
  for (let i = 0; i < count; i++) await nextFrame();
};
const sample = document.createElement('canvas');
sample.width = 120;
sample.height = 30;
const ctx = sample.getContext('2d')!;
ctx.fillStyle = 'white';
ctx.fillRect(0, 0, 120, 30);
ctx.fillStyle = 'black';
ctx.font = '20px sans-serif';
ctx.fillText('Sample', 5, 24);
const sampleUrl = sample.toDataURL();
const points: GraphPointData[] = Array.from({ length: 3000 }, (_, i) => ({
  key: `font${i}`,
  x: (i % 60) * 12 + 40,
  y: Math.floor(i / 60) * 8 + 40,
  colorAngle: i * 0.2,
  item: {
    meta: {
      source: 'system',
      weight: 400,
      weights: ['400'],
      font_index: 0,
      family_names: {},
      preferred_family_names: {},
      publishers: {},
      designers: {},
      safe_name: `font${i}`,
      family_name: `family${i}`,
      font_name: `Font ${i}`,
    },
  },
}));
function Harness() {
  let canvas!: HTMLCanvasElement;
  let svg!: SVGSVGElement;
  const [selection, setSelection] = createSignal<string | null>(null);
  const [labels, setLabels] = createSignal(false);
  const [glow, setGlow] = createSignal(false);
  const [results, setResults] = createSignal('Ready');
  const size = () => ({ width: 800, height: 500 });
  const viewport = useGraphViewport({
    getSvgElement: () => svg,
    svgSize: size,
    graphWidth: () => 800,
    graphHeight: () => 500,
  });
  let changedAt = 0;
  createEffect(() => {
    viewport.viewBox();
    changedAt = frame;
  });
  useGraphGlRenderer({
    getCanvas: () => canvas,
    layout: () => null,
    size,
    viewBox: viewport.viewBox,
    zoomFactor: viewport.zoomFactor,
    points: () => points,
    getPointByKey: (key) => points.find((p) => p.key === key),
    filteredKeys: () => new Set(points.map((p) => p.key)),
    selectedKey: selection,
    selectedDendrogramAnchor: () => null,
    selectedFamily: () =>
      selection() ? `family${selection()!.slice(4)}` : null,
    visibleDetailKeys: () => new Set(points.slice(0, 8).map((p) => p.key)),
    showImages: () => false,
    showFontNames: labels,
    glow,
    showPointCore: () => true,
    showTreemapBoundaries: () => false,
    dendrogramEdges: () => [],
    dendrogramArcs: () => [],
    dendrogramNodeDots: () => [],
    dendrogramImageAnchors: () => [],
    pointLabels: (): GraphPointLabel[] =>
      points.map((p) => ({ ...p, text: p.key, orientation: 'horizontal' })),
    dendrogramAncestry: () => [],
    sessionKey: () => 'test',
    sampleImageUrl: () => sampleUrl,
  });
  async function run() {
    const report: object[] = [];
    setResults('Running');
    const check = (name: string, actual: number, expected: number) => {
      report.push({ check: name, actual, expected, pass: actual === expected });
      if (actual !== expected)
        throw new Error(`${name}: expected ${expected}, got ${actual}`);
    };
    try {
      setLabels(false);
      setGlow(false);
      await settle(8);
      const startDraws = draws;
      await settle(8);
      check('idle draws', draws - startDraws, 0);
      check('hidden text layouts', textLayouts, 0);
      for (const mode of ['pan', 'zoom in', 'zoom out']) {
        await settle();
        drawFrames.length = 0;
        if (mode === 'pan') {
          viewport.refreshViewportRect();
          viewport.startPanDrag(
            new MouseEvent('mousedown', { clientX: 100, clientY: 100 }),
          );
          viewport.dragPan(
            new MouseEvent('mousemove', { clientX: 140, clientY: 130 }),
          );
        } else if (mode === 'zoom in') viewport.handleZoomIn();
        else viewport.handleZoomOut();
        await settle(3);
        check(
          `${mode} canvas/HUD lag in frames`,
          (drawFrames[0] ?? -1) - changedAt,
          0,
        );
        viewport.endPanDrag();
      }
      setSelection('font0');
      await settle(8);
      const startPrograms = programs;
      const startDeletes = deletions;
      for (let i = 1; i < 9; i++) {
        setSelection(`font${i}`);
        await settle(3);
      }
      check(
        '8 selection switches: new GPU programs',
        programs - startPrograms,
        0,
      );
      check(
        '8 selection switches: deleted GPU programs',
        deletions - startDeletes,
        0,
      );
      const initialLayouts = textLayouts;
      setLabels(true);
      await settle(60);
      check(
        'text layouts for 8 visible of 3000 labels',
        textLayouts - initialLayouts,
        8,
      );
      const labelStart = draws;
      await settle(12);
      check('idle label draws', draws - labelStart, 0);
      const initialBounds = boundsUpdates;
      setGlow(true);
      await settle(4);
      check(
        'glow passes: scene transform traversals',
        boundsUpdates - initialBounds,
        1,
      );
      setLabels(false);
      await settle(4);
      setLabels(true);
      await settle(20);
      const afterToggle = draws;
      await settle(8);
      check(
        'label toggle settles without continuous rendering',
        draws - afterToggle,
        0,
      );
      checkImageLifecycle(check);
      await checkSelectionInput(check, points);
      setGlow(false);
      await settle(4);
      report.push({
        profile: 'pan, glow off',
        ...(await profileViewport(canvas, viewport)),
      });
      setGlow(true);
      await settle(4);
      report.push({
        profile: 'pan, glow on',
        ...(await profileViewport(canvas, viewport)),
      });
      setResults('PASS\n' + JSON.stringify(report, null, 2));
    } catch (error) {
      setResults(
        'FAIL\n' + JSON.stringify(report, null, 2) + '\n' + String(error),
      );
    }
  }
  return (
    <>
      <h1>Graph rendering regression checks</h1>
      <p>3000 nodes; 8 visible labels. Reload before repeating the suite.</p>
      <button onClick={() => void run()}>Run checks</button>
      <pre>{results()}</pre>
      <div style={{ position: 'relative', width: '800px', height: '500px' }}>
        <canvas ref={canvas} />
        <svg
          ref={svg}
          style={{
            position: 'absolute',
            inset: 0,
            width: '800px',
            height: '500px',
          }}
          viewBox={`${viewport.viewBox().x} ${viewport.viewBox().y} ${viewport.viewBox().width} ${viewport.viewBox().height}`}
        />
      </div>
    </>
  );
}
render(
  () => (
    <ColorModeProvider>
      <Harness />
    </ColorModeProvider>
  ),
  document.getElementById('root')!,
);
