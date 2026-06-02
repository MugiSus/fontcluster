import { createSelector, createSignal } from 'solid-js';
import { emit } from '@tauri-apps/api/event';
import { setSelectedFontKey as setCommittedSelectedFontKey } from '../../actions';
import { appState } from '../../store';
import { type GraphCoordinate, type GraphPointData } from './types';

interface UseGraphSelectionProps {
  getGraphPointFromEvent: (event: MouseEvent) => GraphCoordinate | null;
  getSelectionRadius: () => number;
  findSelectablePoint: (
    x: number,
    y: number,
    radius: number,
  ) => GraphPointData | undefined;
}

export function useGraphSelection(props: UseGraphSelectionProps) {
  const [draggingSelectedFontKey, setDraggingSelectedFontKey] = createSignal<
    string | null
  >(null);

  const selectedFontKey = () =>
    draggingSelectedFontKey() ?? appState.ui.selectedFontKey;

  const selectedFontFamily = () => {
    const key = selectedFontKey();
    return key
      ? appState.fonts.displayData[key]?.meta.family_name || null
      : null;
  };
  const isSelectedFontKey = createSelector(selectedFontKey);
  const isSelectedFamily = createSelector(selectedFontFamily);

  const getFontKeyFromMouseEvent = (event: MouseEvent) => {
    const point = props.getGraphPointFromEvent(event);
    if (!point) return null;

    const nearest = props.findSelectablePoint(
      point.x,
      point.y,
      props.getSelectionRadius(),
    );

    if (!nearest) {
      return null;
    }

    const item = appState.fonts.displayData[nearest.key];
    if (!item) return null;

    return nearest.key;
  };

  const setSelectedFontKey = (key: string | null, event?: MouseEvent) => {
    setCommittedSelectedFontKey(key);
    if (event && (event.shiftKey || event.ctrlKey || event.metaKey)) {
      emit('copy_family_name', {
        toast: false,
        isFontName: event.ctrlKey || event.metaKey,
      });
    }
  };

  const trackDraggingSelection = (event: MouseEvent) => {
    const key = getFontKeyFromMouseEvent(event);
    if (key) setDraggingSelectedFontKey(key);
  };

  const clearDraggingSelection = () => {
    setDraggingSelectedFontKey(null);
  };

  const selectFromMouseEvent = (event: MouseEvent) => {
    const key = draggingSelectedFontKey() ?? getFontKeyFromMouseEvent(event);
    if (key) setSelectedFontKey(key, event);
    clearDraggingSelection();
  };

  return {
    isSelectedFontKey,
    isSelectedFamily,
    trackDraggingSelection,
    clearDraggingSelection,
    selectFromMouseEvent,
  };
}
