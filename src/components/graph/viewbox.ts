import { MAX_VIEWBOX_SIZE, MIN_VIEWBOX_SIZE } from './constants';
import { type GraphCoordinate, type GraphViewBox } from './types';

export function getViewBoxCenter(viewBox: GraphViewBox): GraphCoordinate {
  return {
    x: viewBox.x + viewBox.width / 2,
    y: viewBox.y + viewBox.height / 2,
  };
}

export function getPannedViewBox({
  viewBox,
  deltaX,
  deltaY,
}: {
  viewBox: GraphViewBox;
  deltaX: number;
  deltaY: number;
}): GraphViewBox {
  return {
    x: viewBox.x + deltaX,
    y: viewBox.y + deltaY,
    width: viewBox.width,
    height: viewBox.height,
  };
}

export function getZoomedViewBox({
  viewBox,
  focusX,
  focusY,
  zoomFactor,
}: {
  viewBox: GraphViewBox;
  focusX: number;
  focusY: number;
  zoomFactor: number;
}): GraphViewBox {
  if (viewBox.width <= 0 || viewBox.height <= 0) return viewBox;

  const width = Math.min(
    Math.max(viewBox.width * zoomFactor, MIN_VIEWBOX_SIZE),
    MAX_VIEWBOX_SIZE,
  );
  const effectiveZoomFactor = width / viewBox.width;
  const height = viewBox.height * effectiveZoomFactor;

  return {
    x: focusX - (focusX - viewBox.x) * effectiveZoomFactor,
    y: focusY - (focusY - viewBox.y) * effectiveZoomFactor,
    width,
    height,
  };
}

export function getGraphCoordinateFromClientPoint({
  clientX,
  clientY,
  element,
  viewBox,
}: {
  clientX: number;
  clientY: number;
  element: SVGSVGElement | undefined;
  viewBox: GraphViewBox;
}): GraphCoordinate | null {
  if (!element) return null;

  const rect = element.getBoundingClientRect();
  const minSide = Math.min(rect.width, rect.height);
  if (minSide <= 0) return null;

  const localX =
    clientX - rect.left - Math.max(rect.width - rect.height, 0) / 2;
  const localY = clientY - rect.top - Math.max(rect.height - rect.width, 0) / 2;

  return {
    x: viewBox.x + (localX / minSide) * viewBox.width,
    y: viewBox.y + (localY / minSide) * viewBox.height,
  };
}

export function getViewBoxDeltaFromScreenDelta({
  deltaX,
  deltaY,
  element,
  viewBox,
}: {
  deltaX: number;
  deltaY: number;
  element: SVGSVGElement | undefined;
  viewBox: GraphViewBox;
}): GraphCoordinate | null {
  if (!element) return null;

  const rect = element.getBoundingClientRect();
  const minSide = Math.min(rect.width, rect.height);
  if (minSide <= 0) return null;

  return {
    x: deltaX * (viewBox.width / minSide),
    y: deltaY * (viewBox.height / minSide),
  };
}
