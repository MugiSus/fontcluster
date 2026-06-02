import {
  batch,
  createEffect,
  createMemo,
  createRoot,
  createSignal,
} from 'solid-js';
import { createUndoHistory } from '@solid-primitives/history';
import { debounce } from '@solid-primitives/scheduled';
import { appState, setAppState } from './store';
import { type LassoProcessResult } from './types/font';

const SELECTION_HISTORY_DEBOUNCE = 250;

type SelectionHistorySnapshot = {
  selectedFontKey: string | null;
  lassoResult: LassoProcessResult | null;
};

const getSnapshot = (): SelectionHistorySnapshot => ({
  selectedFontKey: appState.ui.selectedFontKey,
  lassoResult: appState.ui.lassoResult,
});

const restoreSnapshot = (snapshot: SelectionHistorySnapshot) => {
  batch(() => {
    setAppState('ui', 'selectedFontKey', snapshot.selectedFontKey);
    setAppState('ui', 'lassoResult', snapshot.lassoResult);
    setAppState('ui', 'lassoProcessing', false);
  });
};

export const selectionHistory = createRoot(() => {
  const [isTracking, setIsTracking] = createSignal(true);
  const [resetVersion, setResetVersion] = createSignal(0);
  const resumeDebounced = debounce(
    () => setIsTracking(true),
    SELECTION_HISTORY_DEBOUNCE,
  );

  const history = createMemo(() => {
    resetVersion();

    return createUndoHistory(() => {
      if (!isTracking()) return;
      const snapshot = getSnapshot();

      return () => {
        resumeDebounced.clear();
        restoreSnapshot(snapshot);
      };
    });
  });

  createEffect(() => {
    const currentHistory = history();
    currentHistory.canUndo();
    currentHistory.canRedo();
  });

  return {
    pause: () => {
      resumeDebounced.clear();
      setIsTracking(false);
    },
    resumeDebounced,
    reset: () => {
      resumeDebounced.clear();
      setIsTracking(true);
      setResetVersion((version) => version + 1);
    },
    undo: () => {
      resumeDebounced.clear();
      setIsTracking(true);
      history().canUndo();
      history().undo();
    },
    redo: () => {
      resumeDebounced.clear();
      history().redo();
    },
  };
});
