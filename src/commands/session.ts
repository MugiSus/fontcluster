import { batch } from 'solid-js';
import { reconcile } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import { selectionHistory } from '@/selection-history';
import { appState, setAppState } from '@/store';
import { type FontItemRecord } from '@/types/font';
import {
  type AlgorithmConfig,
  type DendrogramData,
  type ProcessStatus,
  type SessionConfig,
} from '@/types/session';

export type ProcessingRunMode =
  | 'duplicate_changed'
  | 'in_place_changed'
  | 'fresh';

export interface RunProcessingOptions {
  sessionId?: string;
  sourceSessionId?: string;
  overrideStatus?: ProcessStatus;
  runMode?: ProcessingRunMode;
}

interface SessionPayload {
  config: SessionConfig;
  directory: string;
  fonts: FontItemRecord;
  dendrogram: DendrogramData | null;
}

/**
 * Publishes one complete session payload to the application store. The caller
 * owns how the payload was obtained, while this command remains the only writer
 * of the session's graph display data.
 */
const setSessionPayload = (payload: SessionPayload) => {
  batch(() => {
    setAppState('session', {
      ...payload.config,
      status: {
        ...payload.config.status,
        samples_amount: Object.keys(payload.fonts).length,
      },
    });
    setAppState('sessionDirectory', payload.directory);
    setAppState('dendrogram', payload.dendrogram);
    setAppState('fonts', 'data', reconcile(payload.fonts));
  });
};

/**
 * Loads a session by id: clears the current display payload, then pulls its
 * config, sample directory and font items from the backend. The active session
 * is identified by `appState.session.session_id`, so there is no separate
 * "requested id" to keep in sync.
 */
export const loadSession = async (id: string) => {
  if (!id) return;
  setAppState('ui', 'isSessionLoading', true);
  batch(() => {
    setAppState('ui', 'selectedDendrogramNode', null);
    setAppState('ui', 'draggingFontKey', null);
    setAppState('ui', 'draggingDendrogramNode', null);
    setAppState('ui', 'draggingFontSource', null);
    setAppState('sessionDirectory', '');
    setAppState('dendrogram', null);
    setAppState('fonts', 'data', reconcile({}));
  });
  try {
    const payload = await invoke<SessionPayload>('load_session', {
      sessionId: id,
    });
    setSessionPayload({
      ...payload,
      directory: payload.directory || '',
      dendrogram: payload.dendrogram ?? null,
    });
  } catch (error) {
    console.error('Failed to load session:', error);
  } finally {
    setAppState('ui', 'isSessionLoading', false);
  }
};

/** Reloads the currently active session (e.g. after a job mutates it). */
export const refreshSession = () => loadSession(appState.session.session_id);

export const setCurrentSessionId = async (id: string) => {
  const isSessionSwitch = appState.session.session_id !== id;
  if (isSessionSwitch) {
    batch(() => {
      setAppState('ui', 'selectedFontKey', null);
      setAppState('ui', 'selectedDendrogramNode', null);
      setAppState('ui', 'sentFontItemKey', null);
    });
  }
  selectionHistory.reset();
  await loadSession(id);
};

export const loadLatestSession = async () => {
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

/**
 * Persists a session's user-given title (empty clears it back to the
 * sample-text fallback) and mirrors it into the active session's store slice
 * when the renamed session is the one currently loaded. Rejects on failure so
 * the calling surface can show its own localized feedback.
 */
export const updateSessionTitle = async (
  sessionId: string,
  newTitle: string,
) => {
  await invoke('update_session_title', { sessionId, newTitle });
  if (appState.session.session_id === sessionId) {
    setAppState('session', 'title', newTitle);
  }
};

/**
 * Submits an algorithm draft and explicit session-ownership mode to the
 * backend pipeline.
 *
 * The backend owns config invalidation and any required model installation;
 * this command only forwards the request and refreshes the active session after
 * a successful in-place run. Errors stay rejected so the submitting control
 * remains the single owner of the terminal failure toast.
 */
export const runProcessingJobs = async (
  algorithm: Partial<AlgorithmConfig>,
  options: RunProcessingOptions = {},
) => {
  const {
    sessionId,
    sourceSessionId,
    overrideStatus,
    runMode = 'in_place_changed',
  } = options;
  selectionHistory.reset();

  const result = await invoke<string>('run_jobs', {
    algorithm,
    sessionId,
    sourceSessionId,
    overrideStatus,
    runMode,
  });
  console.log('Complete pipeline result:', result);
  if (
    runMode === 'in_place_changed' &&
    sessionId &&
    sessionId === appState.session.session_id
  ) {
    await refreshSession();
  }
};

export const stopJobs = async (sessionId?: string) => {
  try {
    await invoke('stop_jobs', { sessionId });
  } catch (error) {
    console.error('Failed to stop jobs:', error);
  }
};
