import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
} from 'solid-js';
import { type GraphPointData } from '../types';
import { getClusterColor } from './cluster-colors-gl';
import { type SelectionPathSpec } from './selection-path-layer';

const MAX_SELECTION_PATH_SEGMENTS = 40;
const SELECTION_PATH_ENDPOINT_INSET_PX = 6;

interface SelectionPathEntry {
  fromKey: string;
  toKey: string;
  startedAt: number;
}

interface UseSelectionPathSpecsProps {
  selectedKey: Accessor<string | null>;
  points: Accessor<GraphPointData[]>;
  zoomFactor: Accessor<number>;
  isDark: Accessor<boolean>;
}

export function useSelectionPathSpecs(
  props: UseSelectionPathSpecsProps,
): Accessor<SelectionPathSpec[]> {
  const [entries, setEntries] = createSignal<SelectionPathEntry[]>([]);
  let previousSelectedKey: string | null = null;
  const pointByKey = createMemo(() => {
    const byKey = new Map<string, GraphPointData>();
    for (const point of props.points()) {
      byKey.set(point.key, point);
    }
    return byKey;
  });

  createEffect(() => {
    const selected = props.selectedKey();
    if (!selected) {
      previousSelectedKey = null;
      setEntries([]);
      return;
    }

    if (!previousSelectedKey) {
      previousSelectedKey = selected;
      return;
    }

    if (selected === previousSelectedKey) return;

    const fromKey = previousSelectedKey;
    previousSelectedKey = selected;
    setEntries((current) =>
      [
        { fromKey, toKey: selected, startedAt: performance.now() },
        ...current,
      ].slice(0, MAX_SELECTION_PATH_SEGMENTS),
    );
  });

  const selectionPathSpecs = createMemo(() => {
    const points = pointByKey();
    const isDark = props.isDark();
    const specs: SelectionPathSpec[] = [];

    for (const entry of entries()) {
      const from = points.get(entry.fromKey);
      const to = points.get(entry.toKey);
      if (!from || !to) continue;

      const fromY = -from.y;
      const toY = -to.y;
      const dx = to.x - from.x;
      const dy = toY - fromY;
      const distance = Math.hypot(dx, dy);
      if (distance === 0) continue;

      const endpointInset = Math.min(
        SELECTION_PATH_ENDPOINT_INSET_PX * props.zoomFactor(),
        distance / 2,
      );
      const offsetX = (dx / distance) * endpointInset;
      const offsetY = (dy / distance) * endpointInset;
      specs.push({
        fromX: from.x + offsetX,
        fromY: fromY + offsetY,
        toX: to.x - offsetX,
        toY: toY - offsetY,
        color: getClusterColor({
          k: to.item.computed?.clustering?.k,
          isDark,
        }),
        startedAt: entry.startedAt,
      });
    }

    return specs;
  });

  return selectionPathSpecs;
}
