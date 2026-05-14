import {
  type Accessor,
  createEffect,
  createMemo,
  createSelector,
  createSignal,
} from 'solid-js';
import { appState } from '../../store';
import { fontPoints, selectableFontPointTree } from './font-point-index';
import {
  collectVisibleImageKeys,
  getVisibleBounds,
  partitionVisiblePoints,
} from './lib';
import { type GraphViewBox, type GraphVisibleBounds } from './types';

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

  const visibleBounds = createMemo(() =>
    getVisibleBounds(props.viewBox(), props.svgSize(), props.zoomFactor()),
  );

  createEffect(() => {
    if (props.isMoving()) return;

    const size = props.svgSize();
    if (size.width === 0 || size.height === 0) return;

    setImageVisibleBounds(visibleBounds());
    setImageZoomFactor(props.zoomFactor());
  });

  const visiblePoints = createMemo(() =>
    partitionVisiblePoints(
      fontPoints(),
      appState.fonts.filteredKeys,
      appState.ui.activeGraphWeights,
      visibleBounds(),
    ),
  );

  const visibleImageKeys = createMemo(() => {
    const bounds = imageVisibleBounds();
    if (!bounds) return new Set<string>();

    return collectVisibleImageKeys(
      selectableFontPointTree(),
      bounds,
      imageZoomFactor(),
    );
  });

  const isImageVisible = createSelector(
    visibleImageKeys,
    (key: string, keys: Set<string>) => keys.has(key),
  );

  const findSelectablePoint = (x: number, y: number, radius: number) =>
    selectableFontPointTree().find(x, y, radius);

  return {
    allPoints: fontPoints,
    visiblePoints,
    isImageVisible,
    findSelectablePoint,
  };
}
