import { type Accessor, createMemo, createSignal, onCleanup } from 'solid-js';
import {
  GRAPH_PADDING,
  GRAPH_SIZE,
  MAX_WHEEL_DELTA,
  PINCH_ZOOM_DELTA_BASE,
  ZOOM_FACTOR_RATIO,
} from './constants';
import { type GraphCoordinate, type GraphViewBox } from './types';
import {
  getGraphCoordinateFromClientPoint,
  getPannedViewBox,
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
  isMoving: Accessor<boolean>;
  getGraphPointFromEvent: (event: MouseEvent) => GraphCoordinate | null;
  dragPan: (event: MouseEvent) => boolean;
  startPanDrag: (event: MouseEvent) => boolean;
  endPanDrag: (event: MouseEvent) => boolean;
  handleWheel: (event: WheelEvent) => void;
  handleZoomIn: () => void;
  handleZoomOut: () => void;
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
  let interactionTimer: number | undefined;

  const getCurrentViewBox = () => latestViewBox;

  const queueViewBoxUpdate = (nextViewBox: GraphViewBox) => {
    latestViewBox = nextViewBox;
    if (viewBoxAnimationFrame) return;

    viewBoxAnimationFrame = window.requestAnimationFrame(() => {
      setViewBox(latestViewBox);
      viewBoxAnimationFrame = undefined;
    });
  };

  const startInteractionTimer = () => {
    setIsInteracting(true);
    if (interactionTimer) window.clearTimeout(interactionTimer);

    interactionTimer = window.setTimeout(() => {
      setIsInteracting(false);
      interactionTimer = undefined;
    }, 250);
  };

  onCleanup(() => {
    if (viewBoxAnimationFrame) {
      window.cancelAnimationFrame(viewBoxAnimationFrame);
    }
    if (interactionTimer) {
      window.clearTimeout(interactionTimer);
    }
  });

  const zoomFactor = createMemo(() => {
    const minSide = Math.min(props.svgSize().width, props.svgSize().height);
    return viewBox().width / (minSide || initialViewBox.width);
  });

  const isMoving = createMemo(() => isDragging() || isInteracting());

  const getGraphPointFromEvent = (event: MouseEvent) =>
    getGraphCoordinateFromClientPoint({
      clientX: event.clientX,
      clientY: event.clientY,
      element: props.getSvgElement(),
      viewBox: getCurrentViewBox(),
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
    if (!isDragging() || event.buttons !== 2) return false;

    const deltaX = event.clientX - lastMousePos().x;
    const deltaY = event.clientY - lastMousePos().y;

    panByScreenDelta({
      deltaX: -deltaX,
      deltaY: -deltaY,
      shouldStartInteraction: false,
    });
    setLastMousePos({ x: event.clientX, y: event.clientY });
    return true;
  };

  const startPanDrag = (event: MouseEvent) => {
    if (event.button !== 2) return false;

    event.preventDefault();
    setIsDragging(true);
    setLastMousePos({ x: event.clientX, y: event.clientY });
    return true;
  };

  const endPanDrag = (event: MouseEvent) => {
    if (event.button !== 2) return false;

    if (isDragging()) {
      startInteractionTimer();
    }
    setIsDragging(false);
    return true;
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

  const handleZoomIn = () => {
    const center = getViewBoxCenter(getCurrentViewBox());
    zoomInto({
      focusX: center.x,
      focusY: center.y,
      zoomFactor: ZOOM_FACTOR_RATIO ** -8,
    });
  };

  const handleZoomOut = () => {
    const center = getViewBoxCenter(getCurrentViewBox());
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
    isMoving,
    getGraphPointFromEvent,
    dragPan,
    startPanDrag,
    endPanDrag,
    handleWheel,
    handleZoomIn,
    handleZoomOut,
    handleReset,
  };
}
