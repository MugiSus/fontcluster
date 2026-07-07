import {
  type Accessor,
  createEffect,
  createMemo,
  createSelector,
  createSignal,
} from 'solid-js';
import { quadtree } from 'd3-quadtree';
import { appState } from '@/store';
import {
  type DendrogramImageAnchor,
  dendrogramImageAnchors,
} from './dendrogram-edges';
import { collectVisibleRadialImageKeys } from './radial-image-visibility';
import {
  findSelectableFontPoint,
  fontPoints,
  getVisibleImageKeys,
} from './font-point-index';
import { type GraphViewBox, type GraphVisibleBounds } from './types';

const VISIBLE_BOUNDS_PADDING = 24;

interface UseGraphPointsProps {
  svgSize: Accessor<{ width: number; height: number }>;
  viewBox: Accessor<GraphViewBox>;
  zoomFactor: Accessor<number>;
  isMoving: Accessor<boolean>;
}

export function useGraphPoints(props: UseGraphPointsProps) {
  const [imageVisibleBounds, setImageVisibleBounds] =
    createSignal<GraphVisibleBounds | null>(null);
  const [imageZoomFactor, setImageZoomFactor] = createSignal(1);

  const visibleBounds = createMemo<GraphVisibleBounds>(() => {
    const viewBox = props.viewBox();
    const size = props.svgSize();
    const scale = props.zoomFactor();

    return {
      minX:
        viewBox.x +
        viewBox.width / 2 -
        (size.width * scale) / 2 -
        VISIBLE_BOUNDS_PADDING * scale,
      maxX:
        viewBox.x +
        viewBox.width / 2 +
        (size.width * scale) / 2 +
        VISIBLE_BOUNDS_PADDING * scale,
      minY:
        viewBox.y +
        viewBox.height / 2 -
        (size.height * scale) / 2 -
        VISIBLE_BOUNDS_PADDING * scale,
      maxY:
        viewBox.y +
        viewBox.height / 2 +
        (size.height * scale) / 2 +
        VISIBLE_BOUNDS_PADDING * scale,
    };
  });

  createEffect(() => {
    if (props.isMoving()) return;

    const size = props.svgSize();
    if (size.width === 0 || size.height === 0) return;

    setImageVisibleBounds(visibleBounds());
    setImageZoomFactor(props.zoomFactor());
  });

  const visibleImageKeys = createMemo(() => {
    const bounds = imageVisibleBounds();
    if (!bounds) return new Set<string>();

    return getVisibleImageKeys(bounds, imageZoomFactor());
  });

  const selectableDendrogramAnchors = createMemo(() =>
    dendrogramImageAnchors().filter((point) =>
      appState.fonts.filteredKeys.has(point.safeName),
    ),
  );

  const selectableDendrogramAnchorTree = createMemo(() =>
    quadtree<DendrogramImageAnchor>()
      .x((point) => point.x)
      .y((point) => point.y)
      .addAll(selectableDendrogramAnchors()),
  );

  const visibleDendrogramImageKeys = createMemo(() => {
    const bounds = imageVisibleBounds();
    if (!bounds) return new Set<string>();

    return collectVisibleRadialImageKeys(
      selectableDendrogramAnchors(),
      bounds,
      imageZoomFactor(),
    );
  });

  const isImageVisible = createSelector(
    visibleImageKeys,
    (key: string, keys: Set<string>) => keys.has(key),
  );

  const findSelectablePoint = (x: number, y: number, radius: number) =>
    findSelectableFontPoint(x, y, radius);

  const findSelectableDendrogramPoint = (
    x: number,
    y: number,
    radius: number,
  ) => selectableDendrogramAnchorTree().find(x, y, radius) ?? null;

  return {
    allPoints: fontPoints,
    visibleImageKeys,
    visibleDendrogramImageKeys,
    isImageVisible,
    findSelectablePoint,
    findSelectableDendrogramPoint,
  };
}
