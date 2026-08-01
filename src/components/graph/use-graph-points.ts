import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
} from 'solid-js';
import { quadtree } from 'd3-quadtree';
import { appState } from '@/store';
import { collectVisibleCartesianImageKeys } from './cartesian-image-visibility';
import {
  type DendrogramImageAnchor,
  dendrogramImageAnchors,
} from './dendrogram-edges';
import { collectVisibleRadialImageKeys } from './radial-image-visibility';
import {
  findSelectableFontPoint,
  fontPoints,
  getVisibleDetailKeys,
} from './font-point-index';
import { type GraphViewBox, type GraphVisibleBounds } from './types';

const VISIBLE_BOUNDS_PADDING = 24;

interface UseGraphPointsProps {
  svgSize: Accessor<{ width: number; height: number }>;
  viewBox: Accessor<GraphViewBox>;
  zoomFactor: Accessor<number>;
  isMoving: Accessor<boolean>;
  showImages: Accessor<boolean>;
  showFontNames: Accessor<boolean>;
}

export function useGraphPoints(props: UseGraphPointsProps) {
  const [detailVisibleBounds, setDetailVisibleBounds] =
    createSignal<GraphVisibleBounds | null>(null);
  const [detailZoomFactor, setDetailZoomFactor] = createSignal(1);

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

    setDetailVisibleBounds(visibleBounds());
    setDetailZoomFactor(props.zoomFactor());
  });

  const visibleDetailKeys = createMemo(() => {
    const bounds = detailVisibleBounds();
    if (!bounds) return new Set<string>();

    return getVisibleDetailKeys(
      bounds,
      detailZoomFactor(),
      props.showImages(),
      props.showFontNames(),
    );
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
    const bounds = detailVisibleBounds();
    if (!bounds) return new Set<string>();

    return appState.ui.graphMode === 'radial-tree'
      ? collectVisibleRadialImageKeys(
          selectableDendrogramAnchors(),
          bounds,
          detailZoomFactor(),
          24,
        )
      : collectVisibleCartesianImageKeys(
          selectableDendrogramAnchorTree(),
          bounds,
          detailZoomFactor(),
          24,
        );
  });

  const findSelectablePoint = (x: number, y: number, radius: number) =>
    findSelectableFontPoint(x, y, radius);

  const findSelectableDendrogramPoint = (
    x: number,
    y: number,
    radius: number,
  ) => selectableDendrogramAnchorTree().find(x, y, radius) ?? null;

  return {
    allPoints: fontPoints,
    visibleDetailKeys,
    visibleDendrogramImageKeys,
    findSelectablePoint,
    findSelectableDendrogramPoint,
  };
}
