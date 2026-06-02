import {
  batch,
  createEffect,
  createMemo,
  createResource,
  createRoot,
  createSignal,
  untrack,
} from 'solid-js';
import { createUndoHistory } from '@solid-primitives/history';
import { debounce } from '@solid-primitives/scheduled';
import { reconcile } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { checkForAppUpdates } from '@/lib/updater';
import { toast } from 'solid-sonner';
import { appState, setAppState } from './store';
import {
  type FontItemRecord,
  type FontWeight,
  type LassoProcessResult,
  type SessionConfig,
  type AlgorithmConfig,
  type ProcessStatus,
} from './types/font';

// Resources

export const {
  sessionDirectory,
  sessionConfig,
  fontItemRecord,
  refetchSessionConfig,
  refetchFontItemRecord,
} = createRoot(() => {
  const [sessionDirectory] = createResource(
    () => appState.session.id,
    async (sessionId): Promise<string> => {
      if (!sessionId) return '';
      try {
        return await invoke<string>('get_session_directory', {
          sessionId,
        });
      } catch (error) {
        console.error('Failed to get session directory:', error);
        return '';
      }
    },
  );

  const [sessionConfig, { refetch: refetchSessionConfig }] = createResource(
    () => appState.session.id,
    async (sessionId): Promise<SessionConfig | null> => {
      if (!sessionId) return null;
      try {
        const response = await invoke<string | null>('get_session_info', {
          sessionId,
        });
        if (!response) {
          return null;
        }
        return JSON.parse(response) as SessionConfig;
      } catch (error) {
        console.error('Failed to get session info:', error);
        return null;
      }
    },
  );

  const [fontItemRecord, { refetch: refetchFontItemRecord }] = createResource(
    () => appState.session.id,
    async (sessionId): Promise<FontItemRecord> => {
      if (!sessionId) return {};
      try {
        const response = await invoke<string>('get_font_items', {
          sessionId,
        });
        if (!response) {
          return {};
        }
        return JSON.parse(response) as FontItemRecord;
      } catch (error) {
        console.error('Failed to parse font configs:', error);
        return {};
      }
    },
  );

  // Sync session directory to store
  createEffect(() => {
    const dir = sessionDirectory();
    if (dir !== undefined) {
      setAppState('session', 'directory', dir);
    }
  });

  // Sync loaded session config to store
  createEffect(() => {
    const config = sessionConfig();
    if (config) {
      setAppState('session', 'config', config);
    }
  });

  // Sync font item map to store
  createEffect(() => {
    const data = fontItemRecord();
    if (data) {
      setAppState('session', 'config', (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status: {
            ...prev.status,
            samples_amount: Object.keys(data).length,
          },
        };
      });
      setAppState('fonts', 'data', reconcile(data));
    }
  });

  return {
    sessionDirectory,
    sessionConfig,
    fontItemRecord,
    refetchSessionConfig,
    refetchFontItemRecord,
  };
});

// Actions

const SELECTION_HISTORY_DEBOUNCE = 250;

type SelectionHistorySnapshot = {
  selectedFontKey: string | null;
  lassoResult: LassoProcessResult | null;
};

const getSelectionHistorySnapshot = (): SelectionHistorySnapshot => {
  return {
    selectedFontKey: appState.ui.selectedFontKey,
    lassoResult: appState.ui.lassoResult,
  };
};

const restoreSelectionHistorySnapshot = (
  snapshot: SelectionHistorySnapshot,
) => {
  batch(() => {
    setAppState('ui', 'selectedFontKey', snapshot.selectedFontKey);
    setAppState('ui', 'lassoResult', snapshot.lassoResult);
    setAppState('ui', 'lassoProcessing', false);
  });
};

const selectionHistory = createRoot(() => {
  const [isTracking, setIsTracking] = createSignal(true);
  const [resetVersion, setResetVersion] = createSignal(0);

  const resumeTrackingDebounced = debounce(
    () => setIsTracking(true),
    SELECTION_HISTORY_DEBOUNCE,
  );

  const history = createMemo(() => {
    resetVersion();

    return createUndoHistory(() => {
      if (!isTracking()) return;
      const currentSnapshot = getSelectionHistorySnapshot();

      return () => {
        resumeTrackingDebounced.clear();
        restoreSelectionHistorySnapshot(currentSnapshot);
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
      resumeTrackingDebounced.clear();
      setIsTracking(false);
    },
    resumeDebounced: resumeTrackingDebounced,
    reset: () => {
      resumeTrackingDebounced.clear();
      setIsTracking(true);
      setResetVersion((version) => version + 1);
    },
    undo: () => {
      resumeTrackingDebounced.clear();
      setIsTracking(true);
      history().canUndo();
      history().undo();
    },
    redo: () => {
      resumeTrackingDebounced.clear();
      history().redo();
    },
  };
});

const notifyJobComplete = (sessionId: string) => {
  toast.success('Job completed successfully!', {
    id: `job-complete-${sessionId}`,
    action: {
      label: 'View',
      onClick: () => setCurrentSessionId(sessionId),
    },
    duration: 20000,
  });
};

export const setSelectedFontKey = (key: string | null) => {
  selectionHistory.pause();
  setAppState('ui', 'selectedFontKey', key);
  selectionHistory.resumeDebounced();
};

export const setHoveredFontKey = (key: string | null) =>
  setAppState('ui', 'hoveredFontKey', key);

export const setSentFontItemKey = (key: string | null) =>
  setAppState('ui', 'sentFontItemKey', key);

export const setListPreviewText = (text: string) =>
  setAppState('ui', 'listPreviewText', text);

export const setActiveGraphWeights = (weights: FontWeight[]) =>
  setAppState('ui', 'activeGraphWeights', weights);

export const clearLassoResult = () => {
  batch(() => {
    setAppState('ui', 'lassoResult', null);
    setAppState('ui', 'lassoProcessing', false);
  });
};

export const setCurrentSessionId = (id: string) => {
  selectionHistory.pause();
  batch(() => {
    setAppState('ui', 'lassoResult', null);
    setAppState('ui', 'lassoProcessing', false);
    setAppState('session', 'id', id);
  });
  selectionHistory.reset();
};

export const processLassoSelection = async (safeNames: string[]) => {
  if (safeNames.length === 0 || appState.ui.lassoProcessing) return;

  const sessionId = appState.session.id;
  setAppState('ui', 'lassoProcessing', true);
  try {
    const result = await invoke<LassoProcessResult>('lasso_selected_process', {
      safeNames,
    });
    if (appState.session.id !== sessionId) return;

    batch(() => {
      setAppState('ui', 'lassoResult', result);

      const selectedFontKey = appState.ui.selectedFontKey;
      setAppState(
        'ui',
        'selectedFontKey',
        selectedFontKey && result.safeNames.includes(selectedFontKey)
          ? selectedFontKey
          : (result.safeNames[0] ?? null),
      );
    });
  } catch (error) {
    console.error('Failed to process lasso selection:', error);
    toast.error(`Lasso failed: ${error}`);
  } finally {
    setAppState('ui', 'lassoProcessing', false);
  }
};

export const runProcessingJobs = async (
  algorithm: Partial<AlgorithmConfig>,
  sessionId?: string,
  overrideStatus?: ProcessStatus,
) => {
  selectionHistory.pause();
  batch(() => {
    setAppState('ui', 'lassoResult', null);
    setAppState('ui', 'lassoProcessing', false);
  });
  selectionHistory.reset();
  toast.info(
    `Job started: '${
      algorithm.rendering?.text ??
      appState.session.config.algorithm.rendering.text
    }'`,
  );

  try {
    const result = await invoke<string>('run_jobs', {
      algorithm,
      sessionId,
      overrideStatus,
    });
    console.log('Complete pipeline result:', result);
    if (sessionId && sessionId === appState.session.id) {
      await refetchSessionConfig();
      await refetchFontItemRecord();
    }
  } catch (error) {
    console.error('Failed to process fonts:', error);
    toast.error(`Job failed: ${error}`);
  }
};

export const stopJobs = async (sessionId?: string) => {
  try {
    await invoke('stop_jobs', { sessionId });
  } catch (error) {
    console.error('Failed to stop jobs:', error);
  }
};

// --- Initialization ---

let appEventsCleanup: (() => void) | null = null;

export function initAppEvents() {
  if (appEventsCleanup) return appEventsCleanup;

  let disposed = false;
  const unlisteners: Array<() => void> = [];
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return;

    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.matches('input, textarea') || target.isContentEditable)
    ) {
      return;
    }

    const key = event.key.toLowerCase();
    const isModified = event.metaKey || event.ctrlKey;
    const isUndo = isModified && key === 'z' && !event.shiftKey;
    const isRedo =
      (isModified && key === 'z' && event.shiftKey) ||
      (event.ctrlKey && !event.metaKey && key === 'y' && !event.shiftKey);

    if (isUndo) {
      event.preventDefault();
      selectionHistory.undo();
    } else if (isRedo) {
      event.preventDefault();
      selectionHistory.redo();
    }
  };

  const registerListener = <T>(
    event: string,
    handler: (event: { payload: T }) => void,
  ) => {
    void listen(event, handler).then((cleanup) => {
      if (disposed) {
        cleanup();
        return;
      }
      unlisteners.push(cleanup);
    });
  };

  document.addEventListener('keydown', handleKeyDown, true);

  appEventsCleanup = () => {
    disposed = true;
    document.removeEventListener('keydown', handleKeyDown, true);
    for (const unlisten of unlisteners) unlisten();
    unlisteners.length = 0;
    appEventsCleanup = null;
  };

  // Load latest session ID on startup
  void (async () => {
    try {
      const latestSessionId = await invoke<string | null>(
        'get_latest_session_id',
      );
      if (latestSessionId) {
        console.log('Setting latest session ID on startup:', latestSessionId);
        untrack(() => {
          setCurrentSessionId(latestSessionId);
        });
      }
    } catch (error) {
      console.error('Failed to get latest session ID:', error);
    }
  })();

  registerListener<string>('clustering_complete', (event) => {
    console.log('Clustering completed for session:', event.payload);
  });

  registerListener<string>('positioning_complete', (event) => {
    console.log('Positioning completed for session:', event.payload);
  });

  registerListener<string>('all_jobs_complete', (event) => {
    console.log('All jobs completed successfully for session:', event.payload);
    notifyJobComplete(event.payload);
  });

  registerListener('refresh-requested', () => {
    window.location.reload();
  });

  registerListener('check-update-requested', () => {
    checkForAppUpdates({ isManual: true });
  });

  // Check for updates automatically on startup
  checkForAppUpdates();

  return appEventsCleanup;
}
