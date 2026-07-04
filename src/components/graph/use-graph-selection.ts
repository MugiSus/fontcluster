import { createSelector, createSignal } from 'solid-js';
import { emit } from '@tauri-apps/api/event';
import {
  setSelectedDendrogramNodeSample,
  setSelectedFontKey as setCommittedSelectedFontKey,
} from '@/actions';
import { appState } from '@/store';
import { type DendrogramImageAnchor } from './dendrogram-edges';
import { type GraphCoordinate, type GraphPointData } from './types';

interface UseGraphSelectionProps {
  getGraphPointFromEvent: (event: MouseEvent) => GraphCoordinate | null;
  getSelectionRadius: () => number;
  findSelectablePoint: (
    x: number,
    y: number,
    radius: number,
  ) => GraphPointData | undefined;
  /** Visible dendrogram merge-node sample image under the pointer, if any. */
  findDendrogramAnchor: (x: number, y: number) => DendrogramImageAnchor | null;
  /** Selectable dendrogram merge-node alias under the pointer, if any. */
  findDendrogramPoint: (
    x: number,
    y: number,
    radius: number,
  ) => DendrogramImageAnchor | null;
}

/** What a pointer position resolves to: a font, optionally via the dendrogram
 *  merge node whose exemplar sample was hit. */
interface SelectionTarget {
  key: string;
  nodeIndex: number | null;
}

export function useGraphSelection(props: UseGraphSelectionProps) {
  const [draggingSelection, setDraggingSelection] =
    createSignal<SelectionTarget | null>(null);

  const selectedFontKey = () =>
    draggingSelection()?.key ?? appState.ui.selectedFontKey;
  const selectedDendrogramNode = () => {
    const dragging = draggingSelection();
    return dragging ? dragging.nodeIndex : appState.ui.selectedDendrogramNode;
  };

  // True while the pointer is actively resolving a selection (press/drag in
  // select mode), before it commits on mouse-up. The graph's selected-font
  // actions stay hidden during this window.
  const isSelecting = () => draggingSelection() !== null;

  const selectedFontFamily = () => {
    const key = selectedFontKey();
    return key
      ? appState.fonts.displayData[key]?.meta.family_name || null
      : null;
  };
  const isSelectedFontKey = createSelector(selectedFontKey);
  const isSelectedFamily = createSelector(selectedFontFamily);

  const getTargetFromMouseEvent = (
    event: MouseEvent,
  ): SelectionTarget | null => {
    const point = props.getGraphPointFromEvent(event);
    if (!point) return null;

    // The merge-node samples draw over the points, so a hit on one wins over
    // the nearest ring point.
    const anchor = props.findDendrogramAnchor(point.x, point.y);
    if (anchor && appState.fonts.displayData[anchor.safeName]) {
      return { key: anchor.safeName, nodeIndex: anchor.nodeIndex };
    }

    const radius = props.getSelectionRadius();
    const nearest = props.findSelectablePoint(point.x, point.y, radius);
    const dendrogramPoint = props.findDendrogramPoint(point.x, point.y, radius);

    if (
      dendrogramPoint &&
      appState.fonts.displayData[dendrogramPoint.safeName]
    ) {
      if (!nearest) {
        return {
          key: dendrogramPoint.safeName,
          nodeIndex: dendrogramPoint.nodeIndex,
        };
      }

      const dendrogramDistance =
        (point.x - dendrogramPoint.x) ** 2 + (point.y - dendrogramPoint.y) ** 2;
      const nearestDistance =
        (point.x - nearest.x) ** 2 + (point.y - nearest.y) ** 2;
      if (dendrogramDistance <= nearestDistance) {
        return {
          key: dendrogramPoint.safeName,
          nodeIndex: dendrogramPoint.nodeIndex,
        };
      }
    }

    if (!nearest) return null;

    const item = appState.fonts.displayData[nearest.key];
    if (!item) return null;

    return { key: nearest.key, nodeIndex: null };
  };

  const commitSelection = (target: SelectionTarget, event?: MouseEvent) => {
    if (target.nodeIndex === null) {
      setCommittedSelectedFontKey(target.key);
    } else {
      setSelectedDendrogramNodeSample(target.nodeIndex, target.key);
    }
    if (event && (event.shiftKey || event.ctrlKey || event.metaKey)) {
      emit('copy_family_name', {
        toast: false,
        isFontName: event.ctrlKey || event.metaKey,
      });
    }
  };

  const trackDraggingSelection = (event: MouseEvent) => {
    const target = getTargetFromMouseEvent(event);
    if (target) setDraggingSelection(target);
  };

  const clearDraggingSelection = () => {
    setDraggingSelection(null);
  };

  const selectFromMouseEvent = (event: MouseEvent) => {
    const target = draggingSelection() ?? getTargetFromMouseEvent(event);
    if (target) commitSelection(target, event);
    clearDraggingSelection();
  };

  return {
    selectedKey: selectedFontKey,
    selectedDendrogramNode,
    selectedFamilyName: selectedFontFamily,
    isSelecting,
    isSelectedFontKey,
    isSelectedFamily,
    trackDraggingSelection,
    clearDraggingSelection,
    selectFromMouseEvent,
  };
}
