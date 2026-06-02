import {
  batch,
  createEffect,
  createMemo,
  createRoot,
  createSignal,
} from 'solid-js';
import { unwrap } from 'solid-js/store';
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
  lassoResult: appState.ui.lassoResult
    ? structuredClone(unwrap(appState.ui.lassoResult))
    : null,
});

const restoreSnapshot = (snapshot: SelectionHistorySnapshot) => {
  batch(() => {
    setAppState('ui', 'selectedFontKey', snapshot.selectedFontKey);
    setAppState('ui', 'lassoResult', snapshot.lassoResult);
    setAppState('ui', 'lassoProcessing', false);
  });
};

const snapshotsEqual = (
  left: SelectionHistorySnapshot,
  right: SelectionHistorySnapshot,
) => {
  if (left.selectedFontKey !== right.selectedFontKey) return false;
  if (left.lassoResult === right.lassoResult) return true;
  if (!left.lassoResult || !right.lassoResult) return false;
  if (
    left.lassoResult.safeNames.length !== right.lassoResult.safeNames.length
  ) {
    return false;
  }
  return left.lassoResult.safeNames.every(
    (safeName, index) => safeName === right.lassoResult?.safeNames[index],
  );
};

export const selectionHistory = createRoot(() => {
  const [snapshot, setSnapshot] = createSignal(getSnapshot(), {
    equals: snapshotsEqual,
  });
  const [resetVersion, setResetVersion] = createSignal(0);
  const commit = () => {
    setSnapshot(getSnapshot());
  };
  const commitDebounced = debounce(commit, SELECTION_HISTORY_DEBOUNCE);

  const history = createMemo(() => {
    resetVersion();

    return createUndoHistory(() => {
      const currentSnapshot = snapshot();

      return () => {
        commitDebounced.clear();
        setSnapshot(currentSnapshot);
        restoreSnapshot(currentSnapshot);
      };
    });
  });

  createEffect(() => {
    const currentHistory = history();
    currentHistory.canUndo();
    currentHistory.canRedo();
  });

  return {
    canUndo: () => history().canUndo(),
    canRedo: () => history().canRedo(),
    commit,
    commitDebounced,
    reset: () => {
      commitDebounced.clear();
      setSnapshot(getSnapshot());
      setResetVersion((version) => version + 1);
    },
    undo: () => {
      commitDebounced.clear();
      commit();
      history().canUndo();
      history().undo();
    },
    redo: () => {
      commitDebounced.clear();
      history().redo();
    },
  };
});
