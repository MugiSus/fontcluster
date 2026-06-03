import {
  For,
  Show,
  createSelector,
  createSignal,
  onCleanup,
  onMount,
} from 'solid-js';
import { polygonContains } from 'd3-polygon';
import { CircleSlash2Icon } from 'lucide-solid';
import { appState } from '../../store';
import { processLassoSelection } from '../../actions';
import { useElementSize } from '../../hooks/use-element-size';
import { type FontWeight } from '../../types/font';
import {
  getSelectableFontPoints,
  getSelectableFontPointsInBounds,
} from './font-point-index';
import { GraphPoint } from './point';
import { type GraphCoordinate, type GraphToolMode } from './types';
import { useGraphPoints } from './use-graph-points';
import { useGraphSelection } from './use-graph-selection';
import { useGraphViewport } from './use-graph-viewport';
import { cn } from '../../lib/utils';

const LASSO_DRAG_THRESHOLD_PX = 4;

export interface ViewportZoomControls {
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
}

interface GraphViewerProps {
  toolMode: GraphToolMode;
  showImages: boolean;
  showFontNames: boolean;
  activeGraphWeights: FontWeight[];
  onViewportZoomControlsChange?: (
    controls: ViewportZoomControls | null,
  ) => void;
}

export function GraphViewer(props: GraphViewerProps) {
  const [lassoPoints, setLassoPoints] = createSignal<GraphCoordinate[]>([]);
  let svgElement: SVGSVGElement | undefined;
  let lassoStartPoint: { x: number; y: number } | null = null;
  let lassoStarted = false;

  const { ref: setSvgRef, size: svgSize } = useElementSize<SVGSVGElement>();
  const viewport = useGraphViewport({
    getSvgElement: () => svgElement,
    svgSize,
  });
  const graph = useGraphPoints({
    svgSize,
    viewBox: viewport.viewBox,
    zoomFactor: viewport.zoomFactor,
    isMoving: viewport.isMoving,
    activeGraphWeights: () => props.activeGraphWeights,
  });
  const selection = useGraphSelection({
    getGraphPointFromEvent: viewport.getGraphPointFromEvent,
    getSelectionRadius: () => 40 * viewport.zoomFactor(),
    findSelectablePoint: graph.findSelectablePoint,
  });

  onMount(() => {
    props.onViewportZoomControlsChange?.({
      zoomIn: viewport.handleZoomIn,
      zoomOut: viewport.handleZoomOut,
      resetView: viewport.handleReset,
    });
  });

  onCleanup(() => {
    props.onViewportZoomControlsChange?.(null);
  });

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
    const selectedPoints = getSelectableFontPointsInBounds(bounds).filter(
      (point) => polygonContains(polygon, [point.x, point.y]),
    );
    if (selectedPoints.length === 0) return;

    const safeNames =
      props.toolMode === 'lasso-exclude'
        ? getSelectableFontPoints()
            .filter((point) => !polygonContains(polygon, [point.x, point.y]))
            .map((point) => point.key)
        : selectedPoints.map((point) => point.key);

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
      selection.clearDraggingSelection();
      viewport.dragPan(event);
      return;
    }
    if (event.buttons & 1) {
      if (props.toolMode === 'drag') {
        clearLasso();
        selection.clearDraggingSelection();
        viewport.dragPan(event);
        return;
      }
      if (props.toolMode === 'select') {
        selection.trackDraggingSelection(event);
        return;
      }
      if (getLassoScreenDistance(event) > LASSO_DRAG_THRESHOLD_PX) {
        lassoStarted = true;
      }
      appendLassoPoint(event);
    }
  };

  const handleMouseDown = (event: MouseEvent) => {
    if (event.buttons & 2) {
      clearLasso();
      selection.clearDraggingSelection();
      viewport.startPanDrag(event);
      return;
    }
    if (event.buttons & 1) {
      if (props.toolMode === 'drag') {
        clearLasso();
        selection.clearDraggingSelection();
        viewport.startPanDrag(event);
        return;
      }
      if (props.toolMode === 'select') {
        selection.trackDraggingSelection(event);
        return;
      }
      lassoStartPoint = { x: event.clientX, y: event.clientY };
      lassoStarted = false;
      setLassoPoints([]);
      appendLassoPoint(event);
    }
  };

  const handleMouseUp = (event: MouseEvent) => {
    if (event.button === 2) {
      clearLasso();
      viewport.endPanDrag();
      return;
    }
    if (props.toolMode === 'drag') {
      clearLasso();
      viewport.endPanDrag();
      return;
    }
    if (props.toolMode === 'select') {
      if (event.button === 0) {
        selection.selectFromMouseEvent(event);
      }
      clearLasso();
      viewport.endPanDrag();
      return;
    }
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
      onMouseLeave={() => {
        clearLasso();
        selection.clearDraggingSelection();
        viewport.endPanDrag();
      }}
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
        <svg
          ref={(el) => {
            svgElement = el;
            setSvgRef(el);
          }}
          class='size-full select-none'
          style={{
            cursor:
              props.toolMode === 'lasso-select'
                ? "url('/cursors/lasso-select.svg') 14 12, crosshair"
                : props.toolMode === 'lasso-exclude'
                  ? "url('/cursors/lasso-select-x.svg') 14 12, crosshair"
                  : props.toolMode === 'drag'
                    ? viewport.isDragging()
                      ? "url('/cursors/hand-grab.svg') 12 12, grabbing"
                      : "url('/cursors/hand.svg') 12 12, grab"
                    : "url('/cursors/mouse-pointer-2.svg') 4 4, default",
          }}
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
                  isSelected={selection.isSelectedFontKey(point.key)}
                  isHovered={isHovered(point.key)}
                  isFamilySelected={selection.isSelectedFamily(
                    point.item.meta.family_name,
                  )}
                  sessionDirectory={appState.session.directory}
                  zoomFactor={viewport.zoomFactor()}
                  shouldShowImage={
                    props.showImages &&
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
                isSelected={selection.isSelectedFontKey(point.key)}
                isHovered={isHovered(point.key)}
                isFamilySelected={selection.isSelectedFamily(
                  point.item.meta.family_name,
                )}
                sessionDirectory={appState.session.directory}
                zoomFactor={viewport.zoomFactor()}
                shouldShowImage={
                  props.showImages &&
                  !viewport.isMoving() &&
                  graph.isImageVisible(point.key)
                }
                shouldShowFontName={
                  props.showFontNames &&
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
              stroke='currentColor'
              stroke-width={1 * viewport.zoomFactor()}
              stroke-dasharray={`${6 * viewport.zoomFactor()} ${5 * viewport.zoomFactor()}`}
              fill-rule='evenodd'
              class={cn(
                'pointer-events-none',
                props.toolMode === 'lasso-exclude'
                  ? 'fill-destructive/5 stroke-destructive'
                  : 'fill-foreground/5 stroke-foreground',
              )}
            />
          </Show>
        </svg>
      </Show>
    </div>
  );
}
