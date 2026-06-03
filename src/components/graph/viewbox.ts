import { MAX_VIEWBOX_SIZE, MIN_VIEWBOX_SIZE } from './constants';
import {
  type GraphCoordinate,
  type GraphViewBox,
  type GraphVisibleBounds,
} from './types';

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

export function getViewBoxFittingBounds({
  bounds,
  aspectRatio,
}: {
  bounds: GraphVisibleBounds;
  aspectRatio: number;
}): GraphViewBox | null {
  const boundsWidth = bounds.maxX - bounds.minX;
  const boundsHeight = bounds.maxY - bounds.minY;
  if (boundsWidth <= 0 || boundsHeight <= 0) return null;

  const centerX = bounds.minX + boundsWidth / 2;
  const centerY = bounds.minY + boundsHeight / 2;
  const viewBoxAspectRatio =
    Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;

  let width = boundsWidth;
  let height = boundsHeight;
  if (width / height > viewBoxAspectRatio) {
    height = width / viewBoxAspectRatio;
  } else {
    width = height * viewBoxAspectRatio;
  }

  width = Math.min(Math.max(width, MIN_VIEWBOX_SIZE), MAX_VIEWBOX_SIZE);
  height = width / viewBoxAspectRatio;

  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  };
}

export function getGraphCoordinateFromClientPoint({
  clientX,
  clientY,
  element,
}: {
  clientX: number;
  clientY: number;
  element: SVGSVGElement | undefined;
}): GraphCoordinate | null {
  if (!element) return null;

  const screenMatrix = element.getScreenCTM();
  if (!screenMatrix) return null;

  const point = new DOMPoint(clientX, clientY).matrixTransform(
    screenMatrix.inverse(),
  );

  return {
    x: point.x,
    y: point.y,
  };
}

export function getViewBoxDeltaFromScreenDelta({
  deltaX,
  deltaY,
  element,
}: {
  deltaX: number;
  deltaY: number;
  element: SVGSVGElement | undefined;
}): GraphCoordinate | null {
  if (!element) return null;

  const screenMatrix = element.getScreenCTM();
  if (!screenMatrix) return null;

  const screenToGraph = screenMatrix.inverse();
  const start = new DOMPoint(0, 0).matrixTransform(screenToGraph);
  const end = new DOMPoint(deltaX, deltaY).matrixTransform(screenToGraph);
  return {
    x: end.x - start.x,
    y: end.y - start.y,
  };
}
