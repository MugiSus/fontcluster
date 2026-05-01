import { emit } from '@tauri-apps/api/event';
import { setSelectedFontKey } from '../../actions';
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

export interface GraphSelectionController {
  selectFromMouseEvent: (event: MouseEvent) => void;
}

export function useGraphSelection(
  props: UseGraphSelectionProps,
): GraphSelectionController {
  const selectFromMouseEvent = (event: MouseEvent) => {
    const point = props.getGraphPointFromEvent(event);
    if (!point) return;

    const nearest = props.findSelectablePoint(
      point.x,
      point.y,
      props.getSelectionRadius(),
    );

    if (!nearest) {
      setSelectedFontKey(null);
      return;
    }

    const metadata = appState.fonts.data[nearest.key];
    if (!metadata) return;

    setSelectedFontKey(nearest.key);
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      emit('copy_family_name', {
        toast: false,
        isFontName: event.ctrlKey || event.metaKey,
      });
    }
  };

  return { selectFromMouseEvent };
}
