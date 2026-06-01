import {
  For,
  Show,
  createEffect,
  createSelector,
  createSignal,
} from 'solid-js';
import { polygonContains } from 'd3-polygon';
import { WeightSelector } from '../weight-selector';
import { ImageVisibilityToggle } from './image-visibility-toggle';
import { CircleSlash2Icon } from 'lucide-solid';
import { GraphPoint } from './point';
import { ZoomControls } from './zoom-controls';
import { useElementSize } from '../../hooks/use-element-size';
import { appState } from '../../store';
import { processLassoSelection, setActiveGraphWeights } from '../../actions';
import { type GraphCoordinate } from './types';
import { getSelectableFontPointsInBounds } from './font-point-index';
import { useGraphPoints } from './use-graph-points';
import { useGraphSelection } from './use-graph-selection';
import { useGraphViewport } from './use-graph-viewport';

const LASSO_DRAG_THRESHOLD_PX = 3;

export function GraphContent() {
  const [showImages, setShowImages] = createSignal(true);
  const [showFontNames, setShowFontNames] = createSignal(true);
  const [lassoPoints, setLassoPoints] = createSignal<GraphCoordinate[]>([]);

  let svgElement: SVGSVGElement | undefined;
  let lassoStartPoint: { x: number; y: number } | null = null;
  let lassoStarted = false;
  const { ref: setSvgRef, size: svgSize } = useElementSize<SVGSVGElement>();
  const sessionWeights = () =>
    appState.session.config.algorithm.rendering.weights;

  createEffect(() => {
    const weights = sessionWeights();
    if (weights.length > 0) {
      setActiveGraphWeights(weights);
    }
  });

  const viewport = useGraphViewport({
    getSvgElement: () => svgElement,
    svgSize,
  });
  const graph = useGraphPoints({
    svgSize,
    viewBox: viewport.viewBox,
    zoomFactor: viewport.zoomFactor,
    isMoving: viewport.isMoving,
  });
  const selection = useGraphSelection({
    getGraphPointFromEvent: viewport.getGraphPointFromEvent,
    getSelectionRadius: () => 40 * viewport.zoomFactor(),
    findSelectablePoint: graph.findSelectablePoint,
  });

  const isSelected = createSelector(() => appState.ui.selectedFontKey);
  const isFamilySelected = createSelector(() => appState.ui.selectedFontFamily);
  const isHovered = createSelector(() => appState.ui.hoveredFontKey);

  const appendLassoPoint = (event: MouseEvent) => {
    const point = viewport.getGraphPointFromEvent(event);
    if (!point) return;

    setLassoPoints((points) => {
      const previous = points[points.length - 1];
      if (previous && previous.x === point.x && previous.y === point.y) {
        return points;
      }
      return [...points, point];
    });
  };

  const getLassoScreenDistance = (event: MouseEvent) => {
    if (!lassoStartPoint) return 0;
    return Math.hypot(
      event.clientX - lassoStartPoint.x,
      event.clientY - lassoStartPoint.y,
    );
  };

  const processLasso = () => {
    const points = lassoPoints();
    if (points.length < 3) return;

    const bounds = points.reduce(
      (acc, point) => ({
        minX: Math.min(acc.minX, point.x),
        maxX: Math.max(acc.maxX, point.x),
        minY: Math.min(acc.minY, point.y),
        maxY: Math.max(acc.maxY, point.y),
      }),
      {
        minX: Infinity,
        maxX: -Infinity,
        minY: Infinity,
        maxY: -Infinity,
      },
    );
    const polygon = points.map(
      (point) => [point.x, point.y] as [number, number],
    );
    const safeNames = getSelectableFontPointsInBounds(bounds)
      .filter((point) => polygonContains(polygon, [point.x, point.y]))
      .map((point) => point.key);

    if (safeNames.length > 0) {
      void processLassoSelection(safeNames);
    }
  };

  const clearLasso = () => {
    lassoStartPoint = null;
    lassoStarted = false;
    setLassoPoints([]);
  };

  const handleMouseMove = (event: MouseEvent) => {
    if (event.buttons & 2) {
      clearLasso();
      viewport.dragPan(event);
      return;
    }
    if (event.buttons & 1) {
      if (getLassoScreenDistance(event) > LASSO_DRAG_THRESHOLD_PX) {
        lassoStarted = true;
      }
      appendLassoPoint(event);
      return;
    }
  };

  const handleMouseDown = (event: MouseEvent) => {
    if (event.buttons & 2) {
      clearLasso();
      viewport.startPanDrag(event);
      return;
    }
    if (event.buttons & 1) {
      lassoStartPoint = { x: event.clientX, y: event.clientY };
      lassoStarted = false;
      setLassoPoints([]);
      appendLassoPoint(event);
      return;
    }
  };

  const handleMouseUp = (event: MouseEvent) => {
    if (lassoStarted) {
      appendLassoPoint(event);
      processLasso();
    } else if (getLassoScreenDistance(event) <= LASSO_DRAG_THRESHOLD_PX) {
      selection.selectFromMouseEvent(event);
    }
    clearLasso();
    viewport.endPanDrag();
  };

  return (
    <div
      class='relative flex size-full items-center justify-center bg-background'
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={clearLasso}
      onWheel={viewport.handleWheel}
      onContextMenu={(event) => event.preventDefault()}
    >
      <Show
        when={graph.allPoints().length > 0}
        fallback={
          <div class='flex size-full flex-col items-center justify-center text-sm text-muted-foreground'>
            <CircleSlash2Icon class='mb-4 size-6' />
            <h2>No Results</h2>
            <p class='text-xs'>Complete processing to see results</p>
          </div>
        }
      >
        <div
          class='pointer-events-none absolute bottom-3 right-3 z-10 flex flex-col items-end gap-3 *:pointer-events-auto'
          onMouseDown={(event) => event.stopPropagation()}
        >
          <Show
            when={
              sessionWeights().length > 1 ? sessionWeights().join(',') : false
            }
            keyed
          >
            <WeightSelector
              weights={sessionWeights()}
              defaultValue={sessionWeights()}
              onChange={setActiveGraphWeights}
              isVertical
            />
          </Show>
          <ImageVisibilityToggle
            showImages={showImages()}
            showFontNames={showFontNames()}
            onToggleImages={() => setShowImages(!showImages())}
            onToggleFontNames={() => setShowFontNames(!showFontNames())}
          />
          <ZoomControls
            onZoomIn={viewport.handleZoomIn}
            onZoomOut={viewport.handleZoomOut}
            onReset={viewport.handleReset}
          />
        </div>

        {/* <div class='pointer-events-none absolute bottom-3 left-3 z-10'>
          <Show when={appState.fonts.displayData[appState.ui.selectedFontKey || '']}>
            {(fontData) => (
              <div class='text-sm *:pointer-events-auto'>
                <p class='font-semibold'>{fontData().meta.font_name}</p>
                <p class='text-xs text-muted-foreground'>
                  Weight: {fontData().meta.weight}
                </p>
                <p class='text-xs text-muted-foreground'>
                  Family: {fontData().meta.family_name}
                </p>
              </div>
            )}
          </Show>
        </div> */}

        <svg
          ref={(el) => {
            svgElement = el;
            setSvgRef(el);
          }}
          class='size-full select-none'
          viewBox={`${viewport.viewBox().x} ${viewport.viewBox().y} ${viewport.viewBox().width} ${viewport.viewBox().height}`}
          xmlns='http://www.w3.org/2000/svg'
          text-rendering='optimizeSpeed'
        >
          <g>
            <path
              d='M 490 490 L 510 510 M 510 490 L 490 510'
              fill='none'
              stroke-width={viewport.zoomFactor()}
              class='pointer-events-none stroke-border'
            />
            <circle
              cx='500'
              cy='500'
              r='200'
              fill='none'
              stroke-width={viewport.zoomFactor()}
              class='pointer-events-none stroke-border'
            />
            <circle
              cx='500'
              cy='500'
              r='400'
              fill='none'
              stroke-width={viewport.zoomFactor()}
              class='pointer-events-none stroke-border'
            />
            <circle
              cx='500'
              cy='500'
              r='600'
              fill='none'
              stroke-width={viewport.zoomFactor()}
              class='pointer-events-none stroke-border'
            />
          </g>

          <g opacity={0.35}>
            <For each={graph.visiblePoints().visibleUnfilteredPoints}>
              {(point) => (
                <GraphPoint
                  fontName={point.item.meta.font_name}
                  weight={point.item.meta.weight}
                  clusterId={point.item.computed?.clustering?.k}
                  safeName={point.item.meta.safe_name}
                  x={point.x}
                  y={point.y}
                  isSelected={isSelected(point.key)}
                  isHovered={isHovered(point.key)}
                  isFamilySelected={isFamilySelected(
                    point.item.meta.family_name,
                  )}
                  sessionDirectory={appState.session.directory}
                  zoomFactor={viewport.zoomFactor()}
                  shouldShowImage={
                    showImages() &&
                    !viewport.isMoving() &&
                    graph.isImageVisible(point.key)
                  }
                  shouldShowFontName={false}
                  isDisabled
                />
              )}
            </For>
          </g>

          <For each={graph.visiblePoints().visibleFilteredPoints}>
            {(point) => (
              <GraphPoint
                fontName={point.item.meta.font_name}
                weight={point.item.meta.weight}
                clusterId={point.item.computed?.clustering?.k}
                safeName={point.item.meta.safe_name}
                x={point.x}
                y={point.y}
                isSelected={isSelected(point.key)}
                isHovered={isHovered(point.key)}
                isFamilySelected={isFamilySelected(point.item.meta.family_name)}
                sessionDirectory={appState.session.directory}
                zoomFactor={viewport.zoomFactor()}
                shouldShowImage={
                  showImages() &&
                  !viewport.isMoving() &&
                  graph.isImageVisible(point.key)
                }
                shouldShowFontName={
                  showFontNames() &&
                  !viewport.isMoving() &&
                  graph.isImageVisible(point.key)
                }
              />
            )}
          </For>

          <Show when={lassoPoints().length > 1}>
            <path
              d={`M ${lassoPoints()
                .map((point) => `${point.x} ${point.y}`)
                .join(' L ')}`}
              fill='hsl(var(--foreground) / 0.08)'
              stroke='currentColor'
              stroke-width={1.5 * viewport.zoomFactor()}
              stroke-dasharray={`${6 * viewport.zoomFactor()} ${5 * viewport.zoomFactor()}`}
              class='pointer-events-none text-foreground'
            />
          </Show>
        </svg>
      </Show>
    </div>
  );
}
