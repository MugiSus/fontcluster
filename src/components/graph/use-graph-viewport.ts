import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  untrack,
} from 'solid-js';
import { debounce } from '@solid-primitives/scheduled';
import {
  GRAPH_PADDING,
  MAX_WHEEL_DELTA,
  PINCH_ZOOM_DELTA_BASE,
  ZOOM_FACTOR_RATIO,
} from './constants';
import {
  type GraphCoordinate,
  type GraphViewBox,
  type GraphVisibleBounds,
} from './types';
import {
  getGraphCoordinateFromClientPoint,
  getPannedViewBox,
  getViewBoxFittingBounds,
  getViewBoxCenter,
  getViewBoxDeltaFromScreenDelta,
  getZoomedViewBox,
} from './viewbox';

interface UseGraphViewportProps {
  getSvgElement: () => SVGSVGElement | undefined;
  svgSize: Accessor<{ width: number; height: number }>;
  graphWidth: Accessor<number>;
  graphHeight: Accessor<number>;
}

export interface GraphViewportController {
  viewBox: Accessor<GraphViewBox>;
  zoomFactor: Accessor<number>;
  isDragging: Accessor<boolean>;
  isMoving: Accessor<boolean>;
  getGraphPointFromEvent: (event: MouseEvent) => GraphCoordinate | null;
  refreshViewportRect: () => void;
  dragPan: (event: MouseEvent) => void;
  zoomToBounds: (bounds: GraphVisibleBounds) => void;
  startPanDrag: (event: MouseEvent) => void;
  endPanDrag: () => void;
  handleWheel: (event: WheelEvent) => void;
  handleZoomIn: (focus?: GraphCoordinate) => void;
  handleZoomOut: (focus?: GraphCoordinate) => void;
  handleReset: () => void;
}

function clampWheelDelta(delta: number) {
  return Math.max(-MAX_WHEEL_DELTA, Math.min(MAX_WHEEL_DELTA, delta));
}

function getWheelDeltaUnit(event: WheelEvent, element: Element | undefined) {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    const lineHeight = element
      ? Number.parseFloat(window.getComputedStyle(element).lineHeight)
      : 16;
    return lineHeight || 16;
  }

  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return element?.clientHeight || window.innerHeight;
  }

  return 1;
}

function getNormalizedWheelDelta(
  event: WheelEvent,
  element: Element | undefined,
) {
  const unit = getWheelDeltaUnit(event, element);
  return {
    deltaX: clampWheelDelta(event.deltaX * unit),
    deltaY: clampWheelDelta(event.deltaY * unit),
  };
}

export function useGraphViewport(
  props: UseGraphViewportProps,
): GraphViewportController {
  const graphWidth = createMemo(() => props.graphWidth());
  const graphHeight = createMemo(() => props.graphHeight());
  const resetViewBox = createMemo<GraphViewBox>(() => ({
    x: -GRAPH_PADDING,
    y: -GRAPH_PADDING,
    width: graphWidth() + GRAPH_PADDING * 2,
    height: graphHeight() + GRAPH_PADDING * 2,
  }));
  const initialViewBox = untrack(resetViewBox);

  const [viewBox, setViewBox] = createSignal(initialViewBox);
  const [isDragging, setIsDragging] = createSignal(false);
  const [isInteracting, setIsInteracting] = createSignal(false);
  const [lastMousePos, setLastMousePos] = createSignal({ x: 0, y: 0 });

  let latestViewBox = initialViewBox;
  let viewBoxAnimationFrame: number | undefined;

  const getCurrentViewBox = () => latestViewBox;

  const queueViewBoxUpdate = (nextViewBox: GraphViewBox) => {
    latestViewBox = nextViewBox;
    if (viewBoxAnimationFrame) return;

    viewBoxAnimationFrame = window.requestAnimationFrame(() => {
      setViewBox(latestViewBox);
      viewBoxAnimationFrame = undefined;
    });
  };

  createEffect(
    on(
      resetViewBox,
      (nextViewBox) => {
        // Keep layout geometry and its camera framing in the same paint.
        latestViewBox = nextViewBox;
        setViewBox(nextViewBox);
      },
      { defer: true },
    ),
  );

  const finishInteraction = debounce(() => {
    setIsInteracting(false);
  }, 250);

  const startInteractionTimer = () => {
    setIsInteracting(true);
    finishInteraction();
  };

  onCleanup(() => {
    if (viewBoxAnimationFrame) {
      window.cancelAnimationFrame(viewBoxAnimationFrame);
    }
    finishInteraction.clear();
  });

  const zoomFactor = createMemo(() => {
    const currentViewBox = viewBox();
    const currentSize = props.svgSize();
    if (currentSize.width <= 0 || currentSize.height <= 0) {
      const resetBounds = resetViewBox();
      return Math.max(
        currentViewBox.width / resetBounds.width,
        currentViewBox.height / resetBounds.height,
      );
    }

    return Math.max(
      currentViewBox.width / currentSize.width,
      currentViewBox.height / currentSize.height,
    );
  });

  const isMoving = createMemo(() => isDragging() || isInteracting());

  // Cached SVG client rect. `getBoundingClientRect` forces a layout reflow, so
  // we measure it only at interaction starts (and lazily) instead of on every
  // mouse move — the coordinate math itself is then pure arithmetic.
  let viewportRect: DOMRect | null = null;
  const refreshViewportRect = () => {
    const element = props.getSvgElement();
    viewportRect = element ? element.getBoundingClientRect() : null;
  };

  const getGraphPointFromEvent = (event: MouseEvent) => {
    if (!viewportRect) refreshViewportRect();
    return getGraphCoordinateFromClientPoint({
      clientX: event.clientX,
      clientY: event.clientY,
      rect: viewportRect,
      viewBox: getCurrentViewBox(),
    });
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
    if (shouldStartInteraction) {
      startInteractionTimer();
    }

    queueViewBoxUpdate(
      getPannedViewBox({
        viewBox: getCurrentViewBox(),
        deltaX,
        deltaY,
      }),
    );
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
    const delta = getViewBoxDeltaFromScreenDelta({
      deltaX,
      deltaY,
      rect: viewportRect,
      viewBox: getCurrentViewBox(),
    });
    if (!delta) return;

    panBy({
      deltaX: delta.x,
      deltaY: delta.y,
      shouldStartInteraction,
    });
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
    startInteractionTimer();
    queueViewBoxUpdate(
      getZoomedViewBox({
        viewBox: getCurrentViewBox(),
        focusX,
        focusY,
        zoomFactor,
      }),
    );
  };

  const dragPan = (event: MouseEvent) => {
    if (!isDragging()) return;

    const deltaX = event.clientX - lastMousePos().x;
    const deltaY = event.clientY - lastMousePos().y;

    panByScreenDelta({
      deltaX: -deltaX,
      deltaY: -deltaY,
      shouldStartInteraction: false,
    });
    setLastMousePos({ x: event.clientX, y: event.clientY });
  };

  const zoomToBounds = (bounds: GraphVisibleBounds) => {
    const currentViewBox = getCurrentViewBox();
    const rect = props.getSvgElement()?.getBoundingClientRect();
    const nextViewBox = getViewBoxFittingBounds({
      bounds,
      aspectRatio:
        rect && rect.height > 0
          ? rect.width / rect.height
          : currentViewBox.width / currentViewBox.height,
    });
    if (!nextViewBox) return;

    startInteractionTimer();
    queueViewBoxUpdate(nextViewBox);
  };

  const startPanDrag = (event: MouseEvent) => {
    event.preventDefault();
    refreshViewportRect();
    setIsDragging(true);
    setLastMousePos({ x: event.clientX, y: event.clientY });
  };

  const endPanDrag = () => {
    if (isDragging()) startInteractionTimer();
    setIsDragging(false);
  };

  const handleWheel = (event: WheelEvent) => {
    event.preventDefault();
    refreshViewportRect();

    const { deltaX, deltaY } = getNormalizedWheelDelta(
      event,
      props.getSvgElement(),
    );

    if (event.ctrlKey || event.metaKey) {
      const focus = getGraphPointFromEvent(event);
      if (!focus) return;

      zoomInto({
        focusX: focus.x,
        focusY: focus.y,
        zoomFactor: ZOOM_FACTOR_RATIO ** (deltaY / PINCH_ZOOM_DELTA_BASE),
      });
      return;
    }

    panByScreenDelta({ deltaX, deltaY });
  };

  const handleZoomIn = (focus?: GraphCoordinate) => {
    const center = focus ?? getViewBoxCenter(getCurrentViewBox());
    zoomInto({
      focusX: center.x,
      focusY: center.y,
      zoomFactor: ZOOM_FACTOR_RATIO ** -4,
    });
  };

  const handleZoomOut = (focus?: GraphCoordinate) => {
    const center = focus ?? getViewBoxCenter(getCurrentViewBox());
    zoomInto({
      focusX: center.x,
      focusY: center.y,
      zoomFactor: ZOOM_FACTOR_RATIO ** 4,
    });
  };

  const handleReset = () => {
    startInteractionTimer();
    queueViewBoxUpdate(resetViewBox());
  };

  return {
    viewBox,
    zoomFactor,
    isDragging,
    isMoving,
    getGraphPointFromEvent,
    refreshViewportRect,
    dragPan,
    zoomToBounds,
    startPanDrag,
    endPanDrag,
    handleWheel,
    handleZoomIn,
    handleZoomOut,
    handleReset,
  };
}
