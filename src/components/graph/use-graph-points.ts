import {
  type Accessor,
  createEffect,
  createMemo,
  createSelector,
  createSignal,
} from 'solid-js';
import { quadtree } from 'd3-quadtree';
import { type FontWeight } from '../../types/font';
import { appState } from '../../store';
import { GRAPH_SIZE } from './constants';
import {
  collectVisibleImageKeys,
  getVisibleBounds,
  partitionVisiblePoints,
} from './lib';
import {
  type GraphPointData,
  type GraphViewBox,
  type GraphVisibleBounds,
} from './types';

interface UseGraphPointsProps {
  graphWeights: Accessor<FontWeight[]>;
  svgSize: Accessor<{ width: number; height: number }>;
  viewBox: Accessor<GraphViewBox>;
  zoomFactor: Accessor<number>;
  isMoving: Accessor<boolean>;
}

function getVectorBounds() {
  const metadata = Object.values(appState.fonts.data).filter(
    (font) => font.computed?.vector,
  );

  if (metadata.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const font of metadata) {
    const x = font.computed!.vector[0] ?? 0;
    const y = font.computed!.vector[1] ?? 0;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  return { minX, maxX, minY, maxY };
}

export function useGraphPoints(props: UseGraphPointsProps) {
  const [imageVisibleBounds, setImageVisibleBounds] =
    createSignal<GraphVisibleBounds | null>(null);
  const [imageZoomFactor, setImageZoomFactor] = createSignal(1);

  const bounds = createMemo(getVectorBounds);

  const allPoints = createMemo(() => {
    const metadata = Object.values(appState.fonts.data);
    const { minX, maxX, minY, maxY } = bounds();
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;

    return metadata
      .filter((font) => font.computed?.vector)
      .map((font) => {
        const vx = font.computed!.vector[0] ?? 0;
        const vy = font.computed!.vector[1] ?? 0;
        const x = ((vx - minX) / rangeX) * GRAPH_SIZE;
        const y = ((vy - minY) / rangeY) * GRAPH_SIZE;

        return {
          key: font.safe_name,
          metadata: font,
          x,
          y,
        } satisfies GraphPointData;
      });
  });

  const activeWeightSet = createMemo(() => new Set(props.graphWeights()));

  const selectablePointTree = createMemo(() => {
    const activeWeights = activeWeightSet();
    const filteredKeys = appState.fonts.filteredKeys;
    const points: GraphPointData[] = [];

    for (const point of allPoints()) {
      if (
        filteredKeys.has(point.key) &&
        activeWeights.has(point.metadata.weight as FontWeight)
      ) {
        points.push(point);
      }
    }

    return quadtree<GraphPointData>()
      .x((point) => point.x)
      .y((point) => point.y)
      .addAll(points);
  });

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
      allPoints(),
      appState.fonts.filteredKeys,
      activeWeightSet(),
      visibleBounds(),
    ),
  );

  const visibleImageKeys = createMemo(() => {
    const bounds = imageVisibleBounds();
    if (!bounds) return new Set<string>();

    return collectVisibleImageKeys(
      selectablePointTree(),
      bounds,
      imageZoomFactor(),
    );
  });

  const isImageVisible = createSelector(
    visibleImageKeys,
    (key: string, keys: Set<string>) => keys.has(key),
  );

  const findSelectablePoint = (x: number, y: number, radius: number) =>
    selectablePointTree().find(x, y, radius);

  return {
    allPoints,
    visiblePoints,
    isImageVisible,
    findSelectablePoint,
  };
}
