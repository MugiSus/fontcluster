import {
  For,
  createSignal,
  createEffect,
  createMemo,
  createSelector,
} from 'solid-js';
import { quadtree } from 'd3-quadtree';
import { emit } from '@tauri-apps/api/event';
import { type FontWeight, type FontMetadata } from '../types/font';
import { WeightSelector } from './weight-selector';
import { ZoomControls } from './zoom-controls';
import { ImageVisibilityControl } from './image-visibility-control';
import { FontVectorPoint } from './font-vector-point';
import { useElementSize } from '../hooks/use-element-size';
import { appState } from '../store';
import { setSelectedFontKey } from '../actions';

const GRAPH_PADDING = 50;
const GRAPH_SIZE = 1000;

const INITIAL_VIEWBOX = {
  x: -GRAPH_PADDING,
  y: -GRAPH_PADDING,
  width: GRAPH_SIZE + GRAPH_PADDING * 2,
  height: GRAPH_SIZE + GRAPH_PADDING * 2,
};

const ZOOM_FACTOR_RATIO = 1.04;

interface VisualizedPoint {
  key: string;
  metadata: FontMetadata;
  x: number;
  y: number;
}

export function FontClusterVisualization() {
  const [viewBox, setViewBox] = createSignal(INITIAL_VIEWBOX);
  const [showImages, setShowImages] = createSignal(true);

  let svgElement: SVGSVGElement | undefined;
  const { ref: setSvgRef, size: svgSize } = useElementSize<SVGSVGElement>();

  const zoomFactor = createMemo(() => {
    const minSide = Math.min(svgSize().width, svgSize().height);
    return viewBox().width / (minSide || INITIAL_VIEWBOX.width);
  });

  const isSelected = createSelector(() => appState.ui.selectedFontKey);
  const isFamilySelected = createSelector(() => appState.ui.selectedFontFamily);

  const [isDragging, setIsDragging] = createSignal(false);
  const [isInteracting, setIsInteracting] = createSignal(false);
  const [lastMousePos, setLastMousePos] = createSignal({ x: 0, y: 0 });

  let interactionTimer: number | undefined;
  const startInteractionTimer = () => {
    setIsInteracting(true);
    if (interactionTimer) window.clearTimeout(interactionTimer);
    interactionTimer = window.setTimeout(() => {
      setIsInteracting(false);
      interactionTimer = undefined;
    }, 250);
  };

  const isMoving = createMemo(() => isDragging() || isInteracting());

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

  const selectSelectedFont = (event: MouseEvent) => {
    if (!svgElement) return;

    const rect = svgElement.getBoundingClientRect();

    const mouseX =
      event.clientX - rect.left - Math.max(rect.width - rect.height, 0) / 2;
    const mouseY =
      event.clientY - rect.top - Math.max(rect.height - rect.width, 0) / 2;

    const currentViewBox = viewBox();
    const { x: vX, y: vY, width: vWidth, height: vHeight } = currentViewBox;

    const svgMouseX =
      vX + (mouseX / Math.min(rect.width, rect.height)) * vWidth;
    const svgMouseY =
      vY + (mouseY / Math.min(rect.width, rect.height)) * vHeight;

    const selectionRadius = 40 * zoomFactor();
    const activeWeights = visualizerWeights();
    const nearest = fontQuadtree().find(svgMouseX, svgMouseY, selectionRadius);

    if (
      nearest &&
      activeWeights.includes(nearest.metadata.weight as FontWeight)
    ) {
      const metadata = appState.fonts.data[nearest.key];
      if (metadata) {
        setSelectedFontKey(nearest.key);
        if (event.shiftKey || event.ctrlKey || event.metaKey) {
          emit('copy_family_name', {
            toast: false,
            isFontName: event.ctrlKey || event.metaKey,
          });
        }
      }
    } else {
      setSelectedFontKey(null);
    }
  };

  const handleMouseMove = (event: MouseEvent) => {
    // Handle pan dragging
    if (isDragging() && event.buttons === 2) {
      const deltaX = event.clientX - lastMousePos().x;
      const deltaY = event.clientY - lastMousePos().y;

      const currentViewBox = viewBox();
      const { x, y, width, height } = currentViewBox;

      // Convert screen delta to SVG coordinates
      const svgElement = event.currentTarget as SVGElement;
      const rect = svgElement.getBoundingClientRect();
      const scaleX = width / Math.min(rect.width, rect.height);
      const scaleY = height / Math.min(rect.width, rect.height);

      const newX = x - deltaX * scaleX;
      const newY = y - deltaY * scaleY;

      setViewBox({ x: newX, y: newY, width, height });
      setLastMousePos({ x: event.clientX, y: event.clientY });
      return;
    }

    if (event.buttons === 0) return;

    selectSelectedFont(event);
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
    if (event.button === 2) {
      if (isDragging()) {
        startInteractionTimer();
      }
      setIsDragging(false);
    }
  };

  const handleWheel = (event: WheelEvent) => {
    event.preventDefault();

    const svgElement = event.currentTarget as SVGElement;
    const rect = svgElement.getBoundingClientRect();

    const mouseX =
      event.clientX - rect.left - Math.max(rect.width - rect.height, 0) / 2;
    const mouseY =
      event.clientY - rect.top - Math.max(rect.height - rect.width, 0) / 2;

    const currentViewBox = viewBox();
    const { x, y, width, height } = currentViewBox;

    const svgMouseX = x + (mouseX / Math.min(rect.width, rect.height)) * width;
    const svgMouseY = y + (mouseY / Math.min(rect.width, rect.height)) * height;

    const zoomStepFactor =
      event.deltaY > 0 ? ZOOM_FACTOR_RATIO : 1 / ZOOM_FACTOR_RATIO;

    const newWidth = width * zoomStepFactor;
    const newHeight = height * zoomStepFactor;

    const newX = svgMouseX - (svgMouseX - x) * zoomStepFactor;
    const newY = svgMouseY - (svgMouseY - y) * zoomStepFactor;

    setViewBox({ x: newX, y: newY, width: newWidth, height: newHeight });
    startInteractionTimer();
  };

  const handleZoom = (factor: number) => {
    const currentViewBox = viewBox();
    const { x, y, width, height } = currentViewBox;

    // Zoom from center
    const centerX = x + width / 2;
    const centerY = y + height / 2;

    const newWidth = width * factor;
    const newHeight = height * factor;

    const newX = centerX - (centerX - x) * factor;
    const newY = centerY - (centerY - y) * factor;

    setViewBox({ x: newX, y: newY, width: newWidth, height: newHeight });
    startInteractionTimer();
  };

  const handleReset = () => {
    setViewBox(INITIAL_VIEWBOX);
  };

  const bounds = createMemo(() => {
    const vecs = Object.values(appState.fonts.data);
    if (vecs.length === 0) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };

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

    return { minX, maxX, minY, maxY };
  });

  const allPoints = createMemo(() => {
    const vecs = Object.values(appState.fonts.data);
    const { minX, maxX, minY, maxY } = bounds();
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;

    return vecs.map((metadata) => {
      const vx = metadata.computed?.vector[0] ?? 0;
      const vy = metadata.computed?.vector[1] ?? 0;
      const x = ((vx - minX) / rangeX) * GRAPH_SIZE;
      const y = ((vy - minY) / rangeY) * GRAPH_SIZE;
      return {
        key: metadata.safe_name,
        metadata,
        x,
        y,
      } satisfies VisualizedPoint;
    });
  });

  const pointsMap = createMemo(() => {
    const map = new Map<string, VisualizedPoint>();
    for (const p of allPoints()) {
      map.set(p.key, p);
    }
    return map;
  });

  const fontQuadtree = createMemo(() => {
    const map = pointsMap();
    const activeWeights = visualizerWeights();
    const filteredKeys = appState.fonts.filteredKeys;

    const activePoints = [];
    for (const key of filteredKeys) {
      const p = map.get(key);
      if (p && activeWeights.includes(p.metadata.weight as FontWeight)) {
        activePoints.push(p);
      }
    }

    return quadtree<VisualizedPoint>()
      .x((d) => d.x)
      .y((d) => d.y)
      .addAll(activePoints);
  });

  const visiblePoints = createMemo(() => {
    const vb = viewBox();
    const size = svgSize();
    const scale = zoomFactor();

    const visibleWidth = size.width * scale;
    const visibleHeight = size.height * scale;

    const padding = 50 * scale;
    const minVisibleX = vb.x + vb.width / 2 - visibleWidth / 2 - padding;
    const maxVisibleX = vb.x + vb.width / 2 + visibleWidth / 2 + padding;
    const minVisibleY = vb.y + vb.height / 2 - visibleHeight / 2 - padding;
    const maxVisibleY = vb.y + vb.height / 2 + visibleHeight / 2 + padding;

    const filteredKeys = appState.fonts.filteredKeys;
    const activeWeights = new Set(visualizerWeights());
    const visibleFilteredPoints = [];
    const visibleUnfilteredPoints = [];

    for (const point of allPoints()) {
      const isWeightIncluded = activeWeights.has(
        point.metadata.weight as FontWeight,
      );
      const isVisible =
        point.x >= minVisibleX &&
        point.x <= maxVisibleX &&
        point.y >= minVisibleY &&
        point.y <= maxVisibleY;

      if (isWeightIncluded && isVisible) {
        if (filteredKeys.has(point.key)) {
          visibleFilteredPoints.push(point);
        } else {
          visibleUnfilteredPoints.push(point);
        }
      }
    }

    return { visibleFilteredPoints, visibleUnfilteredPoints };
  });

  return (
    <div class='relative flex size-full items-center justify-center rounded-md border bg-background shadow-sm'>
      <div class='pointer-events-none absolute bottom-2.5 right-2.5 z-10 flex items-end gap-2.5'>
        <div class='pointer-events-auto'>
          <ImageVisibilityControl
            showImages={showImages()}
            onToggle={() => setShowImages(!showImages())}
          />
        </div>
        <div class='pointer-events-auto'>
          <ZoomControls
            onZoomIn={() => handleZoom(1 / ZOOM_FACTOR_RATIO ** 5)}
            onZoomOut={() => handleZoom(ZOOM_FACTOR_RATIO ** 5)}
            onReset={handleReset}
          />
        </div>
        <div class='pointer-events-auto'>
          <WeightSelector
            weights={(appState.session.config?.weights as FontWeight[]) || []}
            selectedWeights={visualizerWeights()}
            onWeightChange={setVisualizerWeights}
            isVertical
          />
        </div>
      </div>
      <svg
        ref={(el) => {
          svgElement = el;
          setSvgRef(el);
        }}
        class='size-full select-none'
        viewBox={`${viewBox().x} ${viewBox().y} ${viewBox().width} ${viewBox().height}`}
        xmlns='http://www.w3.org/2000/svg'
        text-rendering='optimizeSpeed'
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
      >
        <g opacity={0.5}>
          <path
            d='M 490 490 L 510 510 M 510 490 L 490 510'
            fill='none'
            stroke-width={zoomFactor() * 1}
            class='pointer-events-none stroke-border'
          />
          <circle
            cx='500'
            cy='500'
            r='200'
            fill='none'
            stroke-width={zoomFactor() * 1}
            class='pointer-events-none stroke-border'
          />
          <circle
            cx='500'
            cy='500'
            r='400'
            fill='none'
            stroke-width={zoomFactor() * 1}
            class='pointer-events-none stroke-border'
          />
          <circle
            cx='500'
            cy='500'
            r='600'
            fill='none'
            stroke-width={zoomFactor() * 1}
            class='pointer-events-none stroke-border'
          />
        </g>

        <g opacity={0.2}>
          <For each={visiblePoints().visibleUnfilteredPoints}>
            {(point) => (
              <FontVectorPoint
                fontName={point.metadata.font_name}
                weight={point.metadata.weight}
                clusterId={point.metadata.computed?.k}
                safeName={point.metadata.safe_name}
                x={point.x}
                y={point.y}
                isSelected={isSelected(point.key)}
                isFamilySelected={isFamilySelected(point.metadata.family_name)}
                sessionDirectory={appState.session.directory}
                visualizerWeights={visualizerWeights()}
                zoomFactor={zoomFactor()}
                isMoving={isMoving()}
                showImages={showImages()}
                isDisabled
              />
            )}
          </For>
        </g>

        <For each={visiblePoints().visibleFilteredPoints}>
          {(point) => (
            <FontVectorPoint
              fontName={point.metadata.font_name}
              weight={point.metadata.weight}
              clusterId={point.metadata.computed?.k}
              safeName={point.metadata.safe_name}
              x={point.x}
              y={point.y}
              isSelected={isSelected(point.key)}
              isFamilySelected={isFamilySelected(point.metadata.family_name)}
              sessionDirectory={appState.session.directory}
              visualizerWeights={visualizerWeights()}
              zoomFactor={zoomFactor()}
              isMoving={isMoving()}
              showImages={showImages()}
            />
          )}
        </For>
      </svg>
    </div>
  );
}
