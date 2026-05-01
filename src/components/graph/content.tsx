import {
  For,
  Show,
  createSignal,
  createEffect,
  createMemo,
  createSelector,
  onCleanup,
} from 'solid-js';
import { quadtree } from 'd3-quadtree';
import { emit } from '@tauri-apps/api/event';
import { type FontWeight } from '../../types/font';
import { WeightSelector } from '../weight-selector';
import { ImageVisibilityToggle } from './image-visibility-toggle';
import { CircleSlash2Icon } from 'lucide-solid';
import { GraphPoint } from './point';
import { ZoomControls } from './zoom-controls';
import { useElementSize } from '../../hooks/use-element-size';
import { appState } from '../../store';
import { setSelectedFontKey } from '../../actions';
import {
  type GraphPointData,
  type GraphVisibleBounds,
  type GraphViewBox,
  collectVisibleImageKeys,
  getVisibleBounds,
  partitionVisiblePoints,
} from './lib';

const GRAPH_PADDING = 50;
const GRAPH_SIZE = 1000;

const MIN_VIEWBOX_SIZE = 10;
const MAX_VIEWBOX_SIZE = 3000;

const ZOOM_FACTOR_RATIO = 1.05;
const PINCH_ZOOM_DELTA_BASE = 5;

const INITIAL_VIEWBOX: GraphViewBox = {
  x: -GRAPH_PADDING,
  y: -GRAPH_PADDING,
  width: GRAPH_SIZE + GRAPH_PADDING * 2,
  height: GRAPH_SIZE + GRAPH_PADDING * 2,
};

export function GraphContent() {
  const [viewBox, setViewBox] = createSignal(INITIAL_VIEWBOX);
  const [showImages, setShowImages] = createSignal(true);
  const [settledVisibleBounds, setSettledVisibleBounds] =
    createSignal<GraphVisibleBounds | null>(null);
  const [settledZoomFactor, setSettledZoomFactor] = createSignal(1);

  let svgElement: SVGSVGElement | undefined;
  const { ref: setSvgRef, size: svgSize } = useElementSize<SVGSVGElement>();

  const getCurrentViewBox = () => queuedViewBox ?? viewBox();

  let queuedViewBox: GraphViewBox | undefined;
  let viewBoxAnimationFrame: number | undefined;
  const queueViewBoxUpdate = (nextViewBox: GraphViewBox) => {
    queuedViewBox = nextViewBox;
    if (viewBoxAnimationFrame) return;

    viewBoxAnimationFrame = window.requestAnimationFrame(() => {
      if (queuedViewBox) {
        setViewBox(queuedViewBox);
        queuedViewBox = undefined;
      }
      viewBoxAnimationFrame = undefined;
    });
  };

  onCleanup(() => {
    if (viewBoxAnimationFrame) {
      window.cancelAnimationFrame(viewBoxAnimationFrame);
    }
  });

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

  const [graphWeights, setGraphWeights] = createSignal<FontWeight[]>([400]);

  createEffect(() => {
    const sessionWeights =
      (appState.session.config?.weights as FontWeight[]) || [];
    if (sessionWeights && sessionWeights.length > 0) {
      setGraphWeights(sessionWeights);
    }
  });

  const selectSelectedFont = (event: MouseEvent) => {
    if (!svgElement) return;

    const rect = svgElement.getBoundingClientRect();

    const mouseX =
      event.clientX - rect.left - Math.max(rect.width - rect.height, 0) / 2;
    const mouseY =
      event.clientY - rect.top - Math.max(rect.height - rect.width, 0) / 2;

    const currentViewBox = getCurrentViewBox();
    const { x: vX, y: vY, width: vWidth, height: vHeight } = currentViewBox;

    const svgMouseX =
      vX + (mouseX / Math.min(rect.width, rect.height)) * vWidth;
    const svgMouseY =
      vY + (mouseY / Math.min(rect.width, rect.height)) * vHeight;

    const selectionRadius = 40 * zoomFactor();
    const nearest = fontQuadtree().find(svgMouseX, svgMouseY, selectionRadius);

    if (nearest) {
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

  const panBy = ({
    deltaX,
    deltaY,
    shouldStartInteraction = true,
  }: {
    deltaX: number;
    deltaY: number;
    shouldStartInteraction?: boolean;
  }) => {
    const currentViewBox = getCurrentViewBox();
    const { x, y, width, height } = currentViewBox;

    if (shouldStartInteraction) {
      startInteractionTimer();
    }

    queueViewBoxUpdate({
      x: x + deltaX,
      y: y + deltaY,
      width,
      height,
    });
  };

  const panByScreenDelta = ({
    deltaX,
    deltaY,
    shouldStartInteraction = true,
  }: {
    deltaX: number;
    deltaY: number;
    shouldStartInteraction?: boolean;
  }) => {
    const currentViewBox = getCurrentViewBox();
    const { width, height } = currentViewBox;
    if (!svgElement) return;

    const rect = svgElement.getBoundingClientRect();
    const minSide = Math.min(rect.width, rect.height);
    if (minSide <= 0) return;

    panBy({
      deltaX: deltaX * (width / minSide),
      deltaY: deltaY * (height / minSide),
      shouldStartInteraction,
    });
  };

  const handleMouseMove = (event: MouseEvent) => {
    // Handle pan dragging
    if (isDragging() && event.buttons === 2) {
      const deltaX = event.clientX - lastMousePos().x;
      const deltaY = event.clientY - lastMousePos().y;

      panByScreenDelta({
        deltaX: -deltaX,
        deltaY: -deltaY,
        shouldStartInteraction: false,
      });
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

  const zoomInto = ({
    focusX,
    focusY,
    zoomFactor,
  }: {
    focusX: number;
    focusY: number;
    zoomFactor: number;
  }) => {
    const currentViewBox = getCurrentViewBox();
    const { x, y, width, height } = currentViewBox;
    if (width <= 0 || height <= 0) return;

    const newWidth = Math.min(
      Math.max(width * zoomFactor, MIN_VIEWBOX_SIZE),
      MAX_VIEWBOX_SIZE,
    );
    const effectiveZoomFactor = newWidth / width;
    const newHeight = height * effectiveZoomFactor;

    const newX = focusX - (focusX - x) * effectiveZoomFactor;
    const newY = focusY - (focusY - y) * effectiveZoomFactor;

    startInteractionTimer();
    queueViewBoxUpdate({
      x: newX,
      y: newY,
      width: newWidth,
      height: newHeight,
    });
  };

  const handleWheel = (event: WheelEvent) => {
    event.preventDefault();

    const deltaX = event.deltaX;
    const deltaY = event.deltaY;

    if (event.ctrlKey || event.metaKey) {
      const currentViewBox = getCurrentViewBox();
      const { x, y, width } = currentViewBox;
      if (!svgElement) return;

      const rect = svgElement.getBoundingClientRect();
      const minSide = Math.min(rect.width, rect.height);
      if (minSide <= 0) return;

      const mouseX =
        event.clientX - rect.left - Math.max(rect.width - rect.height, 0) / 2;
      const mouseY =
        event.clientY - rect.top - Math.max(rect.height - rect.width, 0) / 2;

      const focusX = x + (mouseX / minSide) * width;
      const focusY = y + (mouseY / minSide) * currentViewBox.height;
      const zoomFactor = ZOOM_FACTOR_RATIO ** (deltaY / PINCH_ZOOM_DELTA_BASE);

      zoomInto({ focusX, focusY, zoomFactor });
      return;
    }

    panByScreenDelta({ deltaX, deltaY });
  };

  const handleZoomIn = () => {
    const currentViewBox = getCurrentViewBox();
    const { x, y, width, height } = currentViewBox;

    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const zoomFactor = ZOOM_FACTOR_RATIO ** -8;

    zoomInto({ focusX: centerX, focusY: centerY, zoomFactor });
  };

  const handleZoomOut = () => {
    const currentViewBox = getCurrentViewBox();
    const { x, y, width, height } = currentViewBox;

    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const zoomFactor = ZOOM_FACTOR_RATIO ** 8;

    zoomInto({ focusX: centerX, focusY: centerY, zoomFactor });
  };

  const handleReset = () => {
    queueViewBoxUpdate(INITIAL_VIEWBOX);
  };

  const bounds = createMemo(() => {
    const vecs = Object.values(appState.fonts.data).filter(
      (v) => v.computed?.vector,
    );
    if (vecs.length === 0) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };

    const [minX, maxX] = vecs.reduce<[number, number]>(
      ([min, max], v) => {
        const x = v.computed!.vector[0] ?? 0;
        return [Math.min(min, x), Math.max(max, x)];
      },
      [Infinity, -Infinity],
    );
    const [minY, maxY] = vecs.reduce<[number, number]>(
      ([min, max], v) => {
        const y = v.computed!.vector[1] ?? 0;
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

    return vecs
      .filter((metadata) => metadata.computed?.vector)
      .map((metadata) => {
        const vx = metadata.computed!.vector[0] ?? 0;
        const vy = metadata.computed!.vector[1] ?? 0;
        const x = ((vx - minX) / rangeX) * GRAPH_SIZE;
        const y = ((vy - minY) / rangeY) * GRAPH_SIZE;
        return {
          key: metadata.safe_name,
          metadata,
          x,
          y,
        } satisfies GraphPointData;
      });
  });

  const activeWeightSet = createMemo(() => new Set(graphWeights()));

  const fontQuadtree = createMemo(() => {
    const activeWeights = activeWeightSet();
    const filteredKeys = appState.fonts.filteredKeys;
    const points: GraphPointData[] = [];

    for (const point of allPoints()) {
      if (
        filteredKeys.has(point.key) &&
        activeWeights.has(point.metadata.weight as FontWeight)
      ) {
        points.push(point);
      }
    }

    return quadtree<GraphPointData>()
      .x((d) => d.x)
      .y((d) => d.y)
      .addAll(points);
  });

  const visibleBounds = createMemo(() =>
    getVisibleBounds(viewBox(), svgSize(), zoomFactor()),
  );

  createEffect(() => {
    if (isMoving()) return;
    const size = svgSize();
    if (size.width === 0 || size.height === 0) return;
    setSettledVisibleBounds(visibleBounds());
    setSettledZoomFactor(zoomFactor());
  });

  const visiblePoints = createMemo(() => {
    return partitionVisiblePoints(
      allPoints(),
      appState.fonts.filteredKeys,
      activeWeightSet(),
      visibleBounds(),
    );
  });

  const visibleImageKeys = createMemo(() => {
    const bounds = settledVisibleBounds();
    if (!bounds) return new Set<string>();
    return collectVisibleImageKeys(fontQuadtree(), bounds, settledZoomFactor());
  });
  const isImageVisible = createSelector(
    visibleImageKeys,
    (key: string, keys: Set<string>) => keys.has(key),
  );

  return (
    <div
      class='relative flex size-full items-center justify-center bg-background'
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Show
        when={allPoints().length > 0}
        fallback={
          <div class='flex size-full flex-col items-center justify-center bg-muted text-sm text-muted-foreground'>
            <CircleSlash2Icon class='mb-4 size-6' />
            <h2>No results found</h2>
            <p class='text-xs'>Complete processing to see results</p>
          </div>
        }
      >
        <div class='pointer-events-none absolute bottom-4 right-4 z-10 flex items-end gap-3'>
          <div class='pointer-events-auto'>
            <ImageVisibilityToggle
              showImages={showImages()}
              onToggle={() => setShowImages(!showImages())}
            />
          </div>
          <div class='pointer-events-auto'>
            <ZoomControls
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onReset={handleReset}
            />
          </div>
          <div class='pointer-events-auto'>
            <WeightSelector
              weights={(appState.session.config?.weights as FontWeight[]) || []}
              selectedWeights={graphWeights()}
              onWeightChange={setGraphWeights}
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
        >
          <g>
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
                <GraphPoint
                  fontName={point.metadata.font_name}
                  weight={point.metadata.weight}
                  clusterId={point.metadata.computed?.k}
                  safeName={point.metadata.safe_name}
                  x={point.x}
                  y={point.y}
                  isSelected={isSelected(point.key)}
                  isFamilySelected={isFamilySelected(
                    point.metadata.family_name,
                  )}
                  sessionDirectory={appState.session.directory}
                  zoomFactor={zoomFactor()}
                  shouldShowImage={
                    showImages() && !isMoving() && isImageVisible(point.key)
                  }
                  isDisabled
                />
              )}
            </For>
          </g>

          <For each={visiblePoints().visibleFilteredPoints}>
            {(point) => (
              <GraphPoint
                fontName={point.metadata.font_name}
                weight={point.metadata.weight}
                clusterId={point.metadata.computed?.k}
                safeName={point.metadata.safe_name}
                x={point.x}
                y={point.y}
                isSelected={isSelected(point.key)}
                isFamilySelected={isFamilySelected(point.metadata.family_name)}
                sessionDirectory={appState.session.directory}
                zoomFactor={zoomFactor()}
                shouldShowImage={
                  showImages() && !isMoving() && isImageVisible(point.key)
                }
              />
            )}
          </For>
        </svg>
      </Show>
    </div>
  );
}
