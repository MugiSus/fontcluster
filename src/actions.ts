import { createResource, untrack, createRoot, createEffect } from 'solid-js';
import { reconcile } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { checkForAppUpdates } from '@/lib/updater';
import { toast } from 'solid-sonner';
import { appState, setAppState } from './store';
import {
  type FontItemRecord,
  type FontWeight,
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

  // Sync session config and weights to store
  createEffect(() => {
    const config = sessionConfig();
    if (config) {
      setAppState('session', 'config', config);
      setAppState('ui', 'sampleText', config.preview_text);
      if (config.weights) {
        setAppState('ui', 'selectedWeights', config.weights as FontWeight[]);
      }
    }
  });

  // Sync font item map to store
  createEffect(() => {
    const data = fontItemRecord();
    if (data) {
      setAppState('session', 'config', (prev) => {
        if (!prev) return prev;
        return { ...prev, samples_amount: Object.keys(data).length };
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

export const setSelectedWeights = (weights: FontWeight[]) =>
  setAppState('ui', 'selectedWeights', weights);

export const setSelectedFontKey = (key: string | null) =>
  setAppState('ui', 'selectedFontKey', key);

export const setCurrentSessionId = (id: string) =>
  setAppState('session', 'id', id);

export const runProcessingJobs = async (
  text: string,
  weights: FontWeight[],
  algorithm: AlgorithmConfig,
  sessionId?: string,
  overrideStatus?: ProcessStatus,
) => {
  toast.info(`Job started: '${text}'`);

  try {
    const result = await invoke<string>('run_jobs', {
      text,
      weights,
      algorithm,
      sessionId,
      overrideStatus,
    });
    console.log('Complete pipeline result:', result);
    await refetchSessionConfig();
    await refetchFontItemRecord();
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

type ProgressEventPayload =
  | number
  | {
      sessionId?: string;
      value: number;
    };

const getProgressEventParts = (payload: ProgressEventPayload) => {
  if (typeof payload === 'number') {
    return { sessionId: appState.session.id, value: payload };
  }

  return {
    sessionId: payload.sessionId ?? appState.session.id,
    value: payload.value,
  };
};

const updateSessionProgress = (
  payload: ProgressEventPayload,
  update: (
    previous: { numerator: number; denominator: number },
    value: number,
  ) => { numerator: number; denominator: number },
) => {
  const { sessionId, value } = getProgressEventParts(payload);
  if (!sessionId) return;

  setAppState('progress', 'bySession', sessionId, (previous) =>
    update(previous ?? { numerator: 0, denominator: 0 }, value),
  );
};

// --- Initialization ---

let appEventsCleanup: (() => void) | null = null;

export function initAppEvents() {
  if (appEventsCleanup) return appEventsCleanup;

  let disposed = false;
  const unlisteners: Array<() => void> = [];

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

  appEventsCleanup = () => {
    disposed = true;
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

  // Progress tracking and status update event listeners
  registerListener<ProgressEventPayload>(
    'progress_numerator_reset',
    (event) => {
      updateSessionProgress(event.payload, (previous, value) => ({
        ...previous,
        numerator: value,
      }));
    },
  );

  registerListener<ProgressEventPayload>(
    'progress_denominator_reset',
    (event) => {
      updateSessionProgress(event.payload, (previous, value) => ({
        ...previous,
        denominator: value,
      }));
    },
  );

  registerListener<ProgressEventPayload>(
    'progress_numerator_increase',
    (event) => {
      updateSessionProgress(event.payload, (previous, value) => ({
        ...previous,
        numerator: previous.numerator + value,
      }));
    },
  );

  registerListener<ProgressEventPayload>(
    'progress_denominator_set',
    (event) => {
      updateSessionProgress(event.payload, (previous, value) => ({
        ...previous,
        denominator: value,
      }));
    },
  );

  registerListener<ProgressEventPayload>(
    'progress_denominator_decrease',
    (event) => {
      updateSessionProgress(event.payload, (previous, value) => ({
        ...previous,
        denominator: previous.denominator - value,
      }));
    },
  );

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
    checkForAppUpdates(true);
  });

  // Check for updates automatically on startup
  checkForAppUpdates();

  return appEventsCleanup;
}
