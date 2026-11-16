import { debounce } from '@solid-primitives/scheduled';
import { Gesture } from '@use-gesture/vanilla';
import {
  type Accessor,
  batch,
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  untrack,
} from 'solid-js';
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
  resetCenter: Accessor<GraphCoordinate | undefined>;
  /** Magnification relative to fitting the graph bounds with padding. */
  resetZoom: Accessor<number>;
  onViewportChange: (center: GraphCoordinate) => void;
  isMousePanEnabled: Accessor<boolean>;
  onTap: (event: PointerEvent) => void;
}

export interface GraphViewportController {
  viewBox: Accessor<GraphViewBox>;
  zoomFactor: Accessor<number>;
  isDragging: Accessor<boolean>;
  isPanning: Accessor<boolean>;
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
  const resetViewBox = createMemo<GraphViewBox>(() => {
    const zoom = props.resetZoom();
    const width = (graphWidth() + GRAPH_PADDING * 2) / zoom;
    const height = (graphHeight() + GRAPH_PADDING * 2) / zoom;
    const center = props.resetCenter();
    return {
      x: (center?.x ?? graphWidth() / 2) - width / 2,
      y: (center?.y ?? graphHeight() / 2) - height / 2,
      width,
      height,
    };
  });
  const initialViewBox = untrack(resetViewBox);

  const [viewBox, setViewBox] = createSignal(initialViewBox);
  const [isDragging, setIsDragging] = createSignal(false);
  const [isPanning, setIsPanning] = createSignal(false);
  const [lastMousePos, setLastMousePos] = createSignal({ x: 0, y: 0 });

  let latestViewBox = initialViewBox;
  let viewBoxAnimationFrame: number | undefined;

  const getCurrentViewBox = () => latestViewBox;

  const queueViewBoxUpdate = (nextViewBox: GraphViewBox) => {
    latestViewBox = nextViewBox;
    if (viewBoxAnimationFrame) return;

    // eslint-disable-next-line solid/reactivity -- rAF commits staged camera state and emits an interaction event.
    viewBoxAnimationFrame = window.requestAnimationFrame(() => {
      batch(() => {
        setViewBox(latestViewBox);
        props.onViewportChange(getViewBoxCenter(latestViewBox));
      });
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

  onCleanup(() => {
    if (viewBoxAnimationFrame) {
      window.cancelAnimationFrame(viewBoxAnimationFrame);
    }
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

  const finishPanning = debounce(() => setIsPanning(false), 100);

  // Show the indicator immediately and keep it visible until movement has
  // stopped for 100ms, including gaps between input events.
  createEffect(
    on(
      () => getViewBoxCenter(viewBox()),
      (center, previous) => {
        if (!previous) return;
        // Ignore sub-0.01px rounding drift from zooming around the center.
        const hasMoved =
          Math.hypot(center.x - previous.x, center.y - previous.y) >
          zoomFactor() * 0.01;
        if (!hasMoved) return;
        setIsPanning(true);
        finishPanning();
      },
    ),
  );

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

  const panByScreenDelta = ({
    deltaX,
    deltaY,
  }: {
    deltaX: number;
    deltaY: number;
  }) => {
    const delta = getViewBoxDeltaFromScreenDelta({
      deltaX,
      deltaY,
      rect: viewportRect,
      viewBox: getCurrentViewBox(),
    });
    if (!delta) return;

    queueViewBoxUpdate(
      getPannedViewBox({
        viewBox: getCurrentViewBox(),
        deltaX: delta.x,
        deltaY: delta.y,
      }),
    );
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

    queueViewBoxUpdate(nextViewBox);
  };

  const startPanDrag = (event: MouseEvent) => {
    event.preventDefault();
    refreshViewportRect();
    setIsDragging(true);
    setLastMousePos({ x: event.clientX, y: event.clientY });
  };

  const endPanDrag = () => {
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
    queueViewBoxUpdate(resetViewBox());
  };

  // Gesture recognition owns pointer capture and multi-touch bookkeeping;
  // this controller remains the only owner of the graph camera.
  createEffect(() => {
    const element = props.getSvgElement();
    if (!element) return;
    const gestures = new Gesture(
      element,
      {
        onDrag: ({
          event,
          first,
          last,
          tap,
          canceled,
          pinching,
          touches,
          cancel,
          delta,
        }) => {
          if (
            !(event instanceof PointerEvent) ||
            (event.pointerType !== 'touch' && !props.isMousePanEnabled())
          )
            return;
          if (first) refreshViewportRect();
          if (pinching || touches > 1) {
            cancel();
            setIsDragging(false);
            return;
          }
          setIsDragging(!last && !canceled && !tap);
          if (
            canceled ||
            event.type === 'pointercancel' ||
            event.type === 'lostpointercapture'
          )
            return;
          if (tap) {
            refreshViewportRect();
            props.onTap(event);
          } else {
            panByScreenDelta({ deltaX: -delta[0], deltaY: -delta[1] });
          }
        },
        onPinch: ({ first, last, origin, offset, delta, memo }) => {
          if (first) refreshViewportRect();
          setIsDragging(!last);
          const previousOrigin = (memo ?? origin) as [number, number];
          const focus = getGraphCoordinateFromClientPoint({
            clientX: previousOrigin[0],
            clientY: previousOrigin[1],
            rect: viewportRect,
            viewBox: getCurrentViewBox(),
          });
          if (focus) {
            zoomInto({
              focusX: focus.x,
              focusY: focus.y,
              zoomFactor: (offset[0] - delta[0]) / offset[0],
            });
            panByScreenDelta({
              deltaX: previousOrigin[0] - origin[0],
              deltaY: previousOrigin[1] - origin[1],
            });
          }
          return origin;
        },
      },
      {
        eventOptions: { passive: false },
        drag: { filterTaps: true, pointer: { keys: false } },
        pinch: { pinchOnWheel: false, preventDefault: true },
      },
    );
    onCleanup(() => {
      gestures.destroy();
      setIsDragging(false);
    });
  });

  return {
    viewBox,
    zoomFactor,
    isDragging,
    isPanning,
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
