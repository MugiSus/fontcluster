import { createEffect, on, onCleanup } from 'solid-js';
import {
  clearDraggingFont,
  commitDraggingFont,
  setDraggingFont,
} from '@/commands/font-selection';
import { appState } from '@/store';
import { type DendrogramImageAnchor } from './dendrogram-edges';
import {
  type CopySelectedFont,
  type GraphCoordinate,
  type GraphPointData,
} from './types';

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
  copySelectedFont: CopySelectedFont;
}

/** What a pointer position resolves to: a font, optionally via the dendrogram
 *  merge node whose exemplar sample was hit. */
interface SelectionTarget {
  key: string;
  nodeIndex: number | null;
}

export function useGraphSelection(props: UseGraphSelectionProps) {
  // Pending input belongs to this adapter; commands remain the sole owner of
  // selection state. Hit-test every position so a fast pass over a node still
  // selects it, but publish only the latest hit once per animation frame.
  let pendingTarget: SelectionTarget | null = null;
  let selectionFrame: number | undefined;
  const cancelPendingSelection = () => {
    if (selectionFrame !== undefined) {
      window.cancelAnimationFrame(selectionFrame);
      selectionFrame = undefined;
    }
    pendingTarget = null;
  };
  const clearDraggingSelection = () => {
    cancelPendingSelection();
    clearDraggingFont('graph');
  };
  onCleanup(clearDraggingSelection);
  createEffect(
    on(
      () => [appState.session.session_id, appState.ui.isSessionLoading],
      clearDraggingSelection,
      { defer: true },
    ),
  );
  const selectedFontKey = () =>
    appState.ui.draggingFontKey ?? appState.ui.selectedFontKey;
  const selectedDendrogramNode = () =>
    appState.ui.isDragging
      ? appState.ui.draggingDendrogramNode
      : appState.ui.selectedDendrogramNode;

  const selectedFontFamily = () => {
    return appState.ui.isDragging
      ? appState.ui.draggingFontFamily
      : appState.ui.selectedFontFamily;
  };

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

  const beginDraggingSelection = (event: MouseEvent) => {
    cancelPendingSelection();
    const target = getTargetFromMouseEvent(event);
    if (target) setDraggingFont('graph', target.key, target.nodeIndex);
  };

  const trackDraggingSelection = (event: MouseEvent) => {
    const target = getTargetFromMouseEvent(event);
    if (!target) return;
    pendingTarget = target;
    if (selectionFrame !== undefined) return;
    selectionFrame = window.requestAnimationFrame(() => {
      selectionFrame = undefined;
      const latest = pendingTarget;
      pendingTarget = null;
      if (latest) setDraggingFont('graph', latest.key, latest.nodeIndex);
    });
  };

  const selectFromMouseEvent = (event: MouseEvent) => {
    // Mouseup can arrive before the next frame (or without a final move).
    // Resolve its position first; releasing over empty space preserves the
    // latest node touched, including a hit that has not been painted yet.
    const target = getTargetFromMouseEvent(event) ?? pendingTarget;
    cancelPendingSelection();
    if (target) setDraggingFont('graph', target.key, target.nodeIndex);
    const committedKey = commitDraggingFont('graph');
    if (!committedKey) return;

    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      props.copySelectedFont({
        isFontName: event.ctrlKey || event.metaKey,
        showToast: false,
      });
    }
  };

  return {
    selectedKey: selectedFontKey,
    selectedDendrogramNode,
    selectedFamilyName: selectedFontFamily,
    isDragging: () => appState.ui.isDragging,
    beginDraggingSelection,
    trackDraggingSelection,
    clearDraggingSelection,
    selectFromMouseEvent,
  };
}
