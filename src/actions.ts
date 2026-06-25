import { batch, onCleanup, onMount } from 'solid-js';
import { reconcile } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { checkForAppUpdates } from '@/lib/updater';
import { toast } from 'solid-sonner';
import { appState, setAppState } from './store';
import { selectionHistory } from './selection-history';
import {
  type FontItemRecord,
  type FontWeight,
  type LassoProcessResult,
  type SessionConfig,
  type AlgorithmConfig,
  type ProcessStatus,
} from './types/font';

// --- Session loading ---

/**
 * Loads a session by id: pulls its config, sample directory and font items
 * from the backend and atomically swaps them into the store. The active
 * session is identified by `appState.session.session_id`, so there is no
 * separate "requested id" to keep in sync.
 */
export const loadSession = async (id: string) => {
  if (!id) return;
  try {
    const { config, directory, fonts } = await invoke<{
      config: SessionConfig;
      directory: string;
      fonts: FontItemRecord;
    }>('load_session', { sessionId: id });

    batch(() => {
      setAppState('session', {
        ...config,
        status: {
          ...config.status,
          samples_amount: Object.keys(fonts).length,
        },
      });
      setAppState('sessionDirectory', directory || '');
      setAppState('fonts', 'data', reconcile(fonts));
    });
  } catch (error) {
    console.error('Failed to load session:', error);
  }
};

/** Reloads the currently active session (e.g. after a job mutates it). */
export const refreshSession = () => loadSession(appState.session.session_id);

// Actions

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
  setAppState('ui', 'selectedFontKey', key);
  selectionHistory.commitDebounced();
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
  selectionHistory.commit();
};

export const setCurrentSessionId = async (id: string) => {
  const isSessionSwitch = appState.session.session_id !== id;
  batch(() => {
    setAppState('ui', 'lassoResult', null);
    setAppState('ui', 'lassoProcessing', false);
    if (isSessionSwitch) {
      setAppState('ui', 'selectedFontKey', null);
      setAppState('ui', 'hoveredFontKey', null);
      setAppState('ui', 'sentFontItemKey', null);
      setAppState('sessionDirectory', '');
      setAppState('fonts', 'data', reconcile({}));
    }
  });
  selectionHistory.reset();
  await loadSession(id);
};

export const processLassoSelection = async (safeNames: string[]) => {
  if (safeNames.length === 0 || appState.ui.lassoProcessing) return;

  const sessionId = appState.session.session_id;
  setAppState('ui', 'lassoProcessing', true);
  try {
    const result = await invoke<LassoProcessResult>('lasso_selected_process', {
      safeNames,
    });
    if (appState.session.session_id !== sessionId) return;

    batch(() => {
      setAppState('ui', 'lassoResult', result);

      const selectedFontKey = appState.ui.selectedFontKey;
      setAppState(
        'ui',
        'selectedFontKey',
        selectedFontKey && result.safeNames.includes(selectedFontKey)
          ? selectedFontKey
          : null,
      );
    });
    selectionHistory.commit();
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
  batch(() => {
    setAppState('ui', 'lassoResult', null);
    setAppState('ui', 'lassoProcessing', false);
  });
  selectionHistory.reset();
  toast.info(
    `Job started: '${
      algorithm.rendering?.text ?? appState.session.algorithm.rendering.text
    }'`,
  );

  try {
    const result = await invoke<string>('run_jobs', {
      algorithm,
      sessionId,
      overrideStatus,
    });
    console.log('Complete pipeline result:', result);
    if (sessionId && sessionId === appState.session.session_id) {
      await refreshSession();
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

const loadLatestSessionId = async () => {
  try {
    const latestSessionId = await invoke<string | null>(
      'get_latest_session_id',
    );
    if (latestSessionId) {
      console.log('Setting latest session ID on startup:', latestSessionId);
      await setCurrentSessionId(latestSessionId);
    }
  } catch (error) {
    console.error('Failed to get latest session ID:', error);
  }
};

export function useAppEvents() {
  onMount(() => {
    const listenWithCleanup = <T>(
      event: string,
      handler: (event: { payload: T }) => void,
    ) => {
      const unlistenPromise = listen(event, handler);

      onCleanup(async () => {
        const cleanup = await unlistenPromise;
        cleanup();
      });
    };

    // Load latest session ID on startup
    loadLatestSessionId();

    listenWithCleanup<string>('clustering_complete', (event) => {
      console.log('Clustering completed for session:', event.payload);
    });

    listenWithCleanup<string>('positioning_complete', (event) => {
      console.log('Positioning completed for session:', event.payload);
    });

    listenWithCleanup<string>('all_jobs_complete', (event) => {
      console.log(
        'All jobs completed successfully for session:',
        event.payload,
      );
      notifyJobComplete(event.payload);
    });

    listenWithCleanup('refresh-requested', () => {
      window.location.reload();
    });

    listenWithCleanup('check-update-requested', () => {
      checkForAppUpdates({ isManual: true });
    });

    listenWithCleanup('undo-history-requested', () => {
      selectionHistory.undo();
    });

    listenWithCleanup('redo-history-requested', () => {
      selectionHistory.redo();
    });

    // Check for updates automatically on startup
    checkForAppUpdates();
  });
}
