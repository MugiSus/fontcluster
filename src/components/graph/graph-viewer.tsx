import { Show, createSignal, onCleanup, onMount } from 'solid-js';
import { polygonContains } from 'd3-polygon';
import { CircleSlash2Icon } from 'lucide-solid';
import { appState } from '../../store';
import { processLassoSelection } from '../../actions';
import { useElementSize } from '../../hooks/use-element-size';
import { type FontWeight } from '../../types/font';
import {
  fontPoints,
  graphOrigin,
  getSelectableFontPoints,
  getSelectableFontPointsInBounds,
} from './font-point-index';
import { GraphGlLayer } from './gl/graph-gl-layer';
import {
  type GraphCoordinate,
  type GraphToolMode,
  type GraphVisibleBounds,
} from './types';
import { useGraphPoints } from './use-graph-points';
import { useGraphSelection } from './use-graph-selection';
import { useGraphViewport } from './use-graph-viewport';
import { cn } from '../../lib/utils';

const POINTER_DRAG_THRESHOLD_PX = 4;

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
  const [zoomBounds, setZoomBounds] = createSignal<GraphVisibleBounds | null>(
    null,
  );
  let svgElement: SVGSVGElement | undefined;
  let lassoStartPoint: { x: number; y: number } | null = null;
  let lassoStarted = false;
  let zoomStartPoint: GraphCoordinate | null = null;
  let zoomStartScreenPoint: { x: number; y: number } | null = null;
  let zoomStarted = false;

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

  const clearZoom = () => {
    zoomStartPoint = null;
    zoomStartScreenPoint = null;
    zoomStarted = false;
    setZoomBounds(null);
  };

  const handleMouseMove = (event: MouseEvent) => {
    if (event.buttons === 4) {
      viewport.dragPan(event);
      return;
    }
    if (event.buttons === 1) {
      if (props.toolMode === 'drag') {
        viewport.dragPan(event);
        return;
      }
      if (props.toolMode === 'zoom') {
        if (
          zoomStartScreenPoint &&
          Math.hypot(
            event.clientX - zoomStartScreenPoint.x,
            event.clientY - zoomStartScreenPoint.y,
          ) > POINTER_DRAG_THRESHOLD_PX
        ) {
          zoomStarted = true;
        }
        if (!zoomStarted) return;
        if (!zoomStartPoint) return;

        const point = viewport.getGraphPointFromEvent(event);
        if (!point) return;

        setZoomBounds({
          minX: Math.min(zoomStartPoint.x, point.x),
          maxX: Math.max(zoomStartPoint.x, point.x),
          minY: Math.min(zoomStartPoint.y, point.y),
          maxY: Math.max(zoomStartPoint.y, point.y),
        });
        return;
      }
      if (props.toolMode === 'select') {
        selection.trackDraggingSelection(event);
        return;
      }
      if (getLassoScreenDistance(event) > POINTER_DRAG_THRESHOLD_PX) {
        lassoStarted = true;
      }
      appendLassoPoint(event);
    }
  };

  const handleMouseDown = (event: MouseEvent) => {
    if (event.button === 1) {
      selection.clearDraggingSelection();
      viewport.startPanDrag(event);
      return;
    }
    if (event.button === 2 && props.toolMode === 'zoom') {
      selection.clearDraggingSelection();
      zoomStartPoint = viewport.getGraphPointFromEvent(event);
      zoomStartScreenPoint = { x: event.clientX, y: event.clientY };
      zoomStarted = false;
      setZoomBounds(null);
      return;
    }
    if (event.button === 0) {
      if (props.toolMode === 'drag') {
        selection.clearDraggingSelection();
        viewport.startPanDrag(event);
        return;
      }
      if (props.toolMode === 'zoom') {
        selection.clearDraggingSelection();
        zoomStartPoint = viewport.getGraphPointFromEvent(event);
        zoomStartScreenPoint = { x: event.clientX, y: event.clientY };
        zoomStarted = false;
        setZoomBounds(null);
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
    if (event.button === 1) {
      viewport.endPanDrag();
      return;
    }
    if (props.toolMode === 'zoom' && event.button === 2) {
      if (
        zoomStartPoint &&
        zoomStartScreenPoint &&
        Math.hypot(
          event.clientX - zoomStartScreenPoint.x,
          event.clientY - zoomStartScreenPoint.y,
        ) <= POINTER_DRAG_THRESHOLD_PX
      ) {
        viewport.handleZoomOut(zoomStartPoint);
      }
      clearZoom();
      return;
    }
    if (event.button === 2) {
      return;
    }
    if (props.toolMode === 'drag') {
      viewport.endPanDrag();
      return;
    }
    if (props.toolMode === 'zoom') {
      const bounds = zoomBounds();
      if (zoomStarted && bounds) {
        viewport.zoomToBounds(bounds);
      } else if (event.button === 0 && zoomStartPoint) {
        viewport.handleZoomIn(zoomStartPoint);
      }
      clearZoom();
      viewport.endPanDrag();
      return;
    }
    if (props.toolMode === 'select') {
      if (event.button === 0) {
        selection.selectFromMouseEvent(event);
      }
      viewport.endPanDrag();
      return;
    }
    if (lassoStarted) {
      appendLassoPoint(event);
      processLasso();
    } else if (getLassoScreenDistance(event) <= POINTER_DRAG_THRESHOLD_PX) {
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
        clearZoom();
        selection.clearDraggingSelection();
        viewport.endPanDrag();
      }}
      onWheel={viewport.handleWheel}
      onContextMenu={(event) => event.preventDefault()}
      onAuxClick={(event) => {
        if (event.button === 1) event.preventDefault();
      }}
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
        <GraphGlLayer
          size={svgSize}
          viewBox={viewport.viewBox}
          zoomFactor={viewport.zoomFactor}
          points={fontPoints}
          filteredKeys={() => appState.fonts.filteredKeys}
          activeWeights={() => props.activeGraphWeights}
          selectedKey={selection.selectedKey}
          hoveredKey={() => appState.ui.hoveredFontKey}
          selectedFamily={selection.selectedFamilyName}
          imageKeys={graph.visibleImageKeys}
          showImages={() => props.showImages}
          sessionDirectory={() => appState.session.directory}
        />
        <svg
          ref={(el) => {
            svgElement = el;
            setSvgRef(el);
          }}
          class='relative z-10 size-full select-none'
          style={{
            cursor: viewport.isDragging()
              ? "url('/cursors/hand-grab.svg') 12 12, grabbing"
              : props.toolMode === 'lasso-select'
                ? "url('/cursors/lasso-select.svg') 14 12, crosshair"
                : props.toolMode === 'lasso-exclude'
                  ? "url('/cursors/lasso-select-x.svg') 14 12, crosshair"
                  : props.toolMode === 'drag'
                    ? "url('/cursors/hand.svg') 12 12, grab"
                    : props.toolMode === 'zoom'
                      ? "url('/cursors/zoom-in.svg') 11 11, zoom-in"
                      : "url('/cursors/mouse-pointer-2.svg') 4 4, default",
          }}
          viewBox={`${viewport.viewBox().x} ${viewport.viewBox().y} ${viewport.viewBox().width} ${viewport.viewBox().height}`}
          xmlns='http://www.w3.org/2000/svg'
          text-rendering='optimizeSpeed'
        >
          <g>
            <line
              x1={viewport.viewBox().x - viewport.viewBox().width}
              y1={graphOrigin().y}
              x2={viewport.viewBox().x + viewport.viewBox().width * 2}
              y2={graphOrigin().y}
              stroke-width={viewport.zoomFactor()}
              class='pointer-events-none stroke-border'
            />
            <line
              x1={graphOrigin().x}
              y1={viewport.viewBox().y - viewport.viewBox().height}
              x2={graphOrigin().x}
              y2={viewport.viewBox().y + viewport.viewBox().height * 2}
              stroke-width={viewport.zoomFactor()}
              class='pointer-events-none stroke-border'
            />
          </g>

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

          <Show when={zoomBounds()}>
            {(bounds) => (
              <rect
                x={bounds().minX}
                y={bounds().minY}
                width={bounds().maxX - bounds().minX}
                height={bounds().maxY - bounds().minY}
                stroke='currentColor'
                stroke-width={1 * viewport.zoomFactor()}
                stroke-dasharray={`${6 * viewport.zoomFactor()} ${5 * viewport.zoomFactor()}`}
                class='pointer-events-none fill-foreground/5 stroke-foreground'
              />
            )}
          </Show>
        </svg>
      </Show>
    </div>
  );
}
