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

/** A cached client rect for the SVG; avoids per-event `getScreenCTM` reflows. */
interface ViewportRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// Pixels-per-graph-unit for the SVG default `preserveAspectRatio="xMidYMid meet"`
// (fit the whole viewBox, centered, uniform scale).
function getMeetScale(rect: ViewportRect, viewBox: GraphViewBox): number {
  return Math.min(rect.width / viewBox.width, rect.height / viewBox.height);
}

/**
 * Maps a client (screen) point to graph coordinates with pure math from a
 * cached rect + viewBox — no `getScreenCTM`/`getBoundingClientRect`, so it never
 * forces a layout reflow (the old approach thrashed layout during pan).
 */
export function getGraphCoordinateFromClientPoint({
  clientX,
  clientY,
  rect,
  viewBox,
}: {
  clientX: number;
  clientY: number;
  rect: ViewportRect | null;
  viewBox: GraphViewBox;
}): GraphCoordinate | null {
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  if (viewBox.width <= 0 || viewBox.height <= 0) return null;

  const scale = getMeetScale(rect, viewBox);
  const offsetX = rect.left + (rect.width - viewBox.width * scale) / 2;
  const offsetY = rect.top + (rect.height - viewBox.height * scale) / 2;

  return {
    x: viewBox.x + (clientX - offsetX) / scale,
    y: viewBox.y + (clientY - offsetY) / scale,
  };
}

/** Converts a screen-pixel delta to a graph-space delta (pure math, no reflow). */
export function getViewBoxDeltaFromScreenDelta({
  deltaX,
  deltaY,
  rect,
  viewBox,
}: {
  deltaX: number;
  deltaY: number;
  rect: ViewportRect | null;
  viewBox: GraphViewBox;
}): GraphCoordinate | null {
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  if (viewBox.width <= 0 || viewBox.height <= 0) return null;

  const scale = getMeetScale(rect, viewBox);
  return { x: deltaX / scale, y: deltaY / scale };
}
