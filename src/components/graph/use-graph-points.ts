import { type Accessor, createMemo } from 'solid-js';
import { quadtree } from 'd3-quadtree';
import { appState } from '@/store';
import { collectVisibleCartesianImageKeys } from './cartesian-image-visibility';
import {
  type DendrogramImageAnchor,
  dendrogramImageAnchors,
} from './dendrogram-edges';
import { collectVisibleRadialImageKeys } from './radial-image-visibility';
import {
  findNearestSelectableFontPoint,
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
  showImages: Accessor<boolean>;
  showFontNames: Accessor<boolean>;
}

export function useGraphPoints(props: UseGraphPointsProps) {
  // The viewport publishes once per animation frame; derive detail visibility
  // from that same frame instead of retaining a snapshot until movement stops.
  const visibleBounds = createMemo<GraphVisibleBounds | null>(() => {
    const viewBox = props.viewBox();
    const size = props.svgSize();
    if (size.width <= 0 || size.height <= 0) return null;
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

  const visibleDetailKeys = createMemo(() => {
    const bounds = visibleBounds();
    if (!bounds) return new Set<string>();

    return getVisibleDetailKeys(
      bounds,
      props.zoomFactor(),
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
    const bounds = visibleBounds();
    if (!bounds) return new Set<string>();

    return appState.ui.graphMode === 'radial-tree'
      ? collectVisibleRadialImageKeys(
          selectableDendrogramAnchors(),
          bounds,
          props.zoomFactor(),
          24,
        )
      : collectVisibleCartesianImageKeys(
          selectableDendrogramAnchorTree(),
          bounds,
          props.zoomFactor(),
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
    findNearestSelectablePoint: findNearestSelectableFontPoint,
    findSelectableDendrogramPoint,
  };
}
