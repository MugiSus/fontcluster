import {
  clearDraggingFont,
  commitDraggingFont,
  sendListScrollRequest,
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

  const trackDraggingSelection = (event: MouseEvent) => {
    const target = getTargetFromMouseEvent(event);
    if (target) setDraggingFont('graph', target.key, target.nodeIndex);
  };

  const selectFromMouseEvent = (event: MouseEvent) => {
    if (appState.ui.draggingFontSource !== 'graph') {
      const target = getTargetFromMouseEvent(event);
      if (target) setDraggingFont('graph', target.key, target.nodeIndex);
    }
    const committedKey = commitDraggingFont('graph');
    if (!committedKey) return;

    sendListScrollRequest(committedKey);
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
    trackDraggingSelection,
    clearDraggingSelection: () => clearDraggingFont('graph'),
    selectFromMouseEvent,
  };
}
