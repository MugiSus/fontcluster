import { type Accessor, createMemo, createSignal, onCleanup } from 'solid-js';
import { debounce } from '@solid-primitives/scheduled';
import {
  GRAPH_PADDING,
  GRAPH_SIZE,
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
}

export interface GraphViewportController {
  viewBox: Accessor<GraphViewBox>;
  zoomFactor: Accessor<number>;
  isDragging: Accessor<boolean>;
  isMoving: Accessor<boolean>;
  getGraphPointFromEvent: (event: MouseEvent) => GraphCoordinate | null;
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
  const initialViewBox: GraphViewBox = {
    x: -GRAPH_PADDING,
    y: -GRAPH_PADDING,
    width: GRAPH_SIZE + GRAPH_PADDING * 2,
    height: GRAPH_SIZE + GRAPH_PADDING * 2,
  };

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
      return currentViewBox.width / initialViewBox.width;
    }

    return Math.max(
      currentViewBox.width / currentSize.width,
      currentViewBox.height / currentSize.height,
    );
  });

  const isMoving = createMemo(() => isDragging() || isInteracting());

  const getGraphPointFromEvent = (event: MouseEvent) =>
    getGraphCoordinateFromClientPoint({
      clientX: event.clientX,
      clientY: event.clientY,
      element: props.getSvgElement(),
    });

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
      element: props.getSvgElement(),
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
    setIsDragging(true);
    setLastMousePos({ x: event.clientX, y: event.clientY });
  };

  const endPanDrag = () => {
    if (isDragging()) startInteractionTimer();
    setIsDragging(false);
  };

  const handleWheel = (event: WheelEvent) => {
    event.preventDefault();

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
      zoomFactor: ZOOM_FACTOR_RATIO ** -8,
    });
  };

  const handleZoomOut = (focus?: GraphCoordinate) => {
    const center = focus ?? getViewBoxCenter(getCurrentViewBox());
    zoomInto({
      focusX: center.x,
      focusY: center.y,
      zoomFactor: ZOOM_FACTOR_RATIO ** 8,
    });
  };

  const handleReset = () => {
    startInteractionTimer();
    queueViewBoxUpdate(initialViewBox);
  };

  return {
    viewBox,
    zoomFactor,
    isDragging,
    isMoving,
    getGraphPointFromEvent,
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
