import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from 'solid-js';
import { quadtree } from 'd3-quadtree';
import { type FontWeight } from '../types/font';
import { appState } from '../store';
import { setSelectedFontKey } from '../actions';
import { emit } from '@tauri-apps/api/event';
import { WeightSelector } from './weight-selector';
import { useElementSize } from '../hooks/use-element-size';

const GRAPH_PADDING = 50;
const GRAPH_SIZE = 1000;

const INITIAL_VIEWBOX = {
  x: -GRAPH_PADDING,
  y: -GRAPH_PADDING,
  width: GRAPH_SIZE + GRAPH_PADDING * 2,
  height: GRAPH_SIZE + GRAPH_PADDING * 2,
};

const ZOOM_FACTOR_RATIO = 1.1;

export function FontClusterVisualization() {
  const [viewBox, setViewBox] = createSignal(INITIAL_VIEWBOX);
  const { ref: setRef, size: containerSize } = useElementSize<HTMLDivElement>();
  let canvasRef: HTMLCanvasElement | undefined;

  const zoomFactor = createMemo(() => {
    const { width, height } = containerSize();
    const minSide = Math.min(width, height);
    return viewBox().width / (minSide || INITIAL_VIEWBOX.width);
  });

  const [isDragging, setIsDragging] = createSignal(false);
  const [lastMousePos, setLastMousePos] = createSignal({ x: 0, y: 0 });
  const [visualizerWeights, setVisualizerWeights] = createSignal<FontWeight[]>([
    400,
  ]);

  createEffect(() => {
    const sessionWeights =
      (appState.session.config?.weights as FontWeight[]) || [];
    if (sessionWeights && sessionWeights.length > 0) {
      setVisualizerWeights(sessionWeights);
    }
  });

  const getCanvasCoords = (clientX: number, clientY: number) => {
    if (!canvasRef) return { x: 0, y: 0 };
    const rect = canvasRef.getBoundingClientRect();
    const { width, height } = rect;
    const minSide = Math.min(width, height);

    const mouseX = clientX - rect.left - Math.max(width - height, 0) / 2;
    const mouseY = clientY - rect.top - Math.max(height - width, 0) / 2;

    const vb = viewBox();
    return {
      x: vb.x + (mouseX / minSide) * vb.width,
      y: vb.y + (mouseY / minSide) * vb.height,
    };
  };

  const selectSelectedFont = (event: MouseEvent) => {
    const { x, y } = getCanvasCoords(event.clientX, event.clientY);
    const selectionRadius = 48;
    const activeWeights = visualizerWeights();

    const nearest = fontQuadtree().find(x, y, selectionRadius);

    if (
      nearest &&
      activeWeights.includes(nearest.metadata.weight as FontWeight) &&
      appState.fonts.filteredKeys.has(nearest.key)
    ) {
      setSelectedFontKey(nearest.key);
      if (event.shiftKey || event.ctrlKey || event.metaKey) {
        emit('copy_family_name', {
          toast: false,
          isFontName: event.ctrlKey || event.metaKey,
        });
      }
    } else if (event.type === 'mousedown') {
      setSelectedFontKey(null);
    }
  };

  const handleMouseMove = (event: MouseEvent) => {
    if (isDragging() && event.buttons === 2) {
      const deltaX = event.clientX - lastMousePos().x;
      const deltaY = event.clientY - lastMousePos().y;

      const vb = viewBox();
      const rect = canvasRef!.getBoundingClientRect();
      const minSide = Math.min(rect.width, rect.height);
      const scale = vb.width / minSide;

      setViewBox({
        ...vb,
        x: vb.x - deltaX * scale,
        y: vb.y - deltaY * scale,
      });
      setLastMousePos({ x: event.clientX, y: event.clientY });
      return;
    }

    if (event.buttons === 1) {
      selectSelectedFont(event);
    }
  };

  const handleMouseDown = (event: MouseEvent) => {
    if (event.button === 2) {
      event.preventDefault();
      setIsDragging(true);
      setLastMousePos({ x: event.clientX, y: event.clientY });
    } else if (event.button === 0) {
      selectSelectedFont(event);
    }
  };

  const handleMouseUp = (event: MouseEvent) => {
    if (event.button === 2) setIsDragging(false);
  };

  const handleWheel = (event: WheelEvent) => {
    event.preventDefault();
    const { x: mouseX, y: mouseY } = getCanvasCoords(
      event.clientX,
      event.clientY,
    );
    const zoom = event.deltaY > 0 ? ZOOM_FACTOR_RATIO : 1 / ZOOM_FACTOR_RATIO;
    const vb = viewBox();

    const newWidth = vb.width * zoom;
    const newHeight = vb.height * zoom;

    setViewBox({
      x: mouseX - (mouseX - vb.x) * zoom,
      y: mouseY - (mouseY - vb.y) * zoom,
      width: newWidth,
      height: newHeight,
    });
  };

  const bounds = createMemo(() => {
    const vecs = Object.values(appState.fonts.data);
    if (vecs.length === 0) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const v of vecs) {
      const x = v.computed?.vector[0] ?? 0;
      const y = v.computed?.vector[1] ?? 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return { minX, maxX, minY, maxY };
  });

  const allPoints = createMemo(() => {
    const vecs = Object.values(appState.fonts.data);
    const { minX, maxX, minY, maxY } = bounds();
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;

    return vecs.map((metadata) => ({
      key: metadata.safe_name,
      metadata,
      x: (((metadata.computed?.vector[0] ?? 0) - minX) / rangeX) * GRAPH_SIZE,
      y: (((metadata.computed?.vector[1] ?? 0) - minY) / rangeY) * GRAPH_SIZE,
    }));
  });

  const fontQuadtree = createMemo(() => {
    const points = allPoints();
    const weights = visualizerWeights();
    const filtered = appState.fonts.filteredKeys;
    const activePoints = points.filter(
      (p) =>
        weights.includes(p.metadata.weight as FontWeight) &&
        filtered.has(p.key),
    );
    return quadtree<(typeof activePoints)[0]>()
      .x((d) => d.x)
      .y((d) => d.y)
      .addAll(activePoints);
  });

  onMount(() => {
    const ctx = canvasRef?.getContext('2d');
    if (!ctx) return;

    const render = () => {
      if (!ctx || !canvasRef) return;
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = containerSize();
      if (width === 0 || height === 0) {
        requestAnimationFrame(render);
        return;
      }

      if (
        canvasRef.width !== width * dpr ||
        canvasRef.height !== height * dpr
      ) {
        canvasRef.width = width * dpr;
        canvasRef.height = height * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const vb = viewBox();
      const minSize = Math.min(width, height);
      const scale = minSize / vb.width;

      ctx.translate(width / 2, height / 2);
      ctx.scale(scale, scale);
      ctx.translate(-(vb.x + vb.width / 2), -(vb.y + vb.height / 2));

      // 1. Grid
      const isDark = document.documentElement.classList.contains('dark');
      ctx.strokeStyle = isDark ? '#27272a' : '#e2e8f0';
      ctx.lineWidth = zoomFactor() * 1;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(490, 490);
      ctx.lineTo(510, 510);
      ctx.moveTo(510, 490);
      ctx.lineTo(490, 510);
      ctx.stroke();
      [200, 400, 600].forEach((r) => {
        ctx.beginPath();
        ctx.arc(500, 500, r, 0, Math.PI * 2);
        ctx.stroke();
      });

      // 2. Points
      const points = allPoints();
      const filtered = appState.fonts.filteredKeys;
      const weights = visualizerWeights();
      const selected = appState.ui.selectedFontKey;
      const family = appState.ui.selectedFontFamily;
      const z = zoomFactor();

      const colors = [
        '#3b82f6',
        '#ef4444',
        '#eab308',
        '#22c55e',
        '#a855f7',
        '#f97316',
        '#14b8a6',
        '#6366f1',
        '#06b6d4',
        '#d946ef',
      ];
      const darkColors = [
        '#60a5fa',
        '#f87171',
        '#facc15',
        '#4ade80',
        '#c084fc',
        '#fb923c',
        '#2dd4bf',
        '#818cf8',
        '#22d3ee',
        '#e879f9',
      ];

      const drawP = (p: (typeof points)[0], opacity: number) => {
        const isWeight = weights.includes(p.metadata.weight as FontWeight);
        if (!isWeight) return;

        const isSel = p.key === selected;
        const isFam = p.metadata.family_name === family;
        const k = p.metadata.computed?.k ?? -1;
        const color =
          k === -1
            ? '#a1a1aa'
            : ((isDark ? darkColors : colors)[k % 10] ?? '#a1a1aa');

        if (isSel || isFam) {
          ctx.save();
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5 * z;
          ctx.beginPath();
          ctx.arc(p.x, p.y, (isSel ? 40 : 20) * z, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.fillStyle = color;
        ctx.translate(p.x, p.y);
        ctx.scale(z, z);
        ctx.rotate(Math.PI / 4);
        const s = isSel ? 9 : isFam ? 6 : 3;
        ctx.fillRect(-s / 2, -s / 2, s, s);
        ctx.restore();

        if (isSel || isFam) {
          ctx.save();
          ctx.strokeStyle = color;
          ctx.lineWidth = z;
          const ls = (isSel ? 15 : 12) * z;
          ctx.beginPath();
          ctx.moveTo(p.x - ls, p.y);
          ctx.lineTo(p.x + ls, p.y);
          ctx.moveTo(p.x, p.y - ls);
          ctx.lineTo(p.x, p.y + ls);
          ctx.stroke();
          ctx.restore();
        }

        if (z < 0.25 || isSel) {
          ctx.save();
          ctx.fillStyle = isDark ? '#ffffff' : '#000000';
          ctx.font = `${isSel ? 'bold' : ''} ${12 * z}px sans-serif`;
          ctx.textAlign = 'center';
          const name =
            isSel || p.metadata.font_name.length <= 16
              ? p.metadata.font_name
              : p.metadata.font_name.slice(0, 16) + '…';
          ctx.fillText(name, p.x, p.y - 12 * z);
          ctx.restore();
        }
      };

      points.forEach((p) => {
        if (!filtered.has(p.key)) drawP(p, 0.2);
      });
      points.forEach((p) => {
        if (filtered.has(p.key)) drawP(p, 1.0);
      });

      ctx.restore();
      requestAnimationFrame(render);
    };
    const frame = requestAnimationFrame(render);
    onCleanup(() => cancelAnimationFrame(frame));
  });

  return (
    <div
      ref={setRef}
      class='relative flex size-full items-center justify-center overflow-hidden rounded-md border bg-background shadow-sm'
    >
      <div class='absolute bottom-2.5 right-2.5 z-10'>
        <WeightSelector
          weights={(appState.session.config?.weights as FontWeight[]) || []}
          selectedWeights={visualizerWeights()}
          onWeightChange={setVisualizerWeights}
          isVertical
        />
      </div>
      <canvas
        ref={canvasRef}
        class='size-full cursor-crosshair'
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}
