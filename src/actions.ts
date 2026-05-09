import { createResource, untrack, createRoot, createEffect } from 'solid-js';
import { reconcile } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { checkForAppUpdates } from '@/lib/updater';
import { toast } from 'solid-sonner';
import { appState, setAppState, type JobRun } from './store';
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
      setAppState('session', 'status', config.process_status);
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

const markJobState = (
  id: string,
  state: 'running' | 'completed' | 'cancelled' | 'failed',
  sessionId?: string,
) => {
  const index = appState.jobs.findIndex((job) => job.id === id);
  if (index < 0) return;
  const job = appState.jobs[index];
  if (!job) return;

  setAppState('jobs', index, {
    ...job,
    state,
    canStop: state === 'running' ? job.canStop : false,
    sessionId: sessionId ?? job.sessionId,
    updatedAt: new Date().toISOString(),
  });
};

const markLatestRunningJobState = (
  state: 'completed' | 'cancelled' | 'failed',
  sessionId?: string,
) => {
  const job = appState.jobs.find((item) => item.state === 'running');
  if (!job) return;
  markJobState(job.id, state, sessionId);
};

const STATUS_PROGRESS: Record<ProcessStatus, number> = {
  empty: 0,
  downloaded: 20,
  discovered: 30,
  generated: 50,
  vectorized: 80,
  clustered: 90,
  positioned: 100,
};

export const syncLatestJobProgress = (
  status: ProcessStatus,
  sessionId?: string,
) => {
  const index = appState.jobs.findIndex((job) => job.state === 'running');
  if (index < 0) return;
  const job = appState.jobs[index];
  if (!job) return;

  setAppState('jobs', index, {
    ...job,
    progress: STATUS_PROGRESS[status],
    sessionId: sessionId ?? job.sessionId,
    updatedAt: new Date().toISOString(),
  });
};

const syncSessionStatusIfCurrent = (
  sessionId: string,
  status: ProcessStatus,
) => {
  if (sessionId !== appState.session.id) return;
  setAppState('session', 'status', status);
};

const notifyJobComplete = (sessionId: string) => {
  toast.success('Processing completed successfully!', {
    action: {
      label: 'View',
      onClick: () => setCurrentSessionId(sessionId),
    },
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
  const jobId = crypto.randomUUID();
  const job: JobRun = {
    id: jobId,
    sessionId: sessionId ?? null,
    title: `${overrideStatus ? `Re-run from ${overrideStatus}` : 'Full run'} · ${text || 'font'}`,
    state: 'running',
    progress: STATUS_PROGRESS[overrideStatus ?? 'empty'],
    canStop: true,
    updatedAt: new Date().toISOString(),
  };

  setAppState('jobs', (prev) => [job, ...prev].slice(0, 20));
  toast('Processing started', {
    description: job.title,
  });

  try {
    const result = await invoke<string>('run_jobs', {
      text,
      weights,
      algorithm,
      sessionId,
      overrideStatus,
    });
    console.log('Complete pipeline result:', result);
    if (result === 'Success') {
      markJobState(jobId, 'completed');
    } else if (result === 'Cancelled') {
      markJobState(jobId, 'cancelled');
    }
    await refetchSessionConfig();
    await refetchFontItemRecord();
  } catch (error) {
    markJobState(jobId, 'failed');
    console.error('Failed to process fonts:', error);
    toast.error(`Font processing failed: ${error}`);
  }
};

export const stopJobs = async () => {
  try {
    await invoke('stop_jobs');
  } catch (error) {
    console.error('Failed to stop jobs:', error);
  }
};

// --- Initialization ---

export function initAppEvents() {
  // Load latest session ID on startup
  const loadCurrentSession = async () => {
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
  };

  loadCurrentSession();

  // Progress tracking and status update event listeners
  listen('progress_numerator_reset', (event: { payload: number }) => {
    setAppState('progress', 'numerator', event.payload);
  });

  listen('progress_denominator_reset', (event: { payload: number }) => {
    setAppState('progress', 'denominator', event.payload);
  });

  listen('progress_numerator_increase', (event: { payload: number }) => {
    setAppState('progress', 'numerator', (prev) => prev + event.payload);
  });

  listen('progress_denominator_set', (event: { payload: number }) => {
    setAppState('progress', 'denominator', event.payload);
  });

  listen('progress_denominator_decrease', (event: { payload: number }) => {
    setAppState('progress', 'denominator', (prev) => prev - event.payload);
  });

  listen('discovery_complete', (event: { payload: string }) => {
    syncSessionStatusIfCurrent(event.payload, 'discovered');
    syncLatestJobProgress('discovered', event.payload);
  });

  listen('download_complete', (event: { payload: string }) => {
    syncSessionStatusIfCurrent(event.payload, 'downloaded');
    syncLatestJobProgress('downloaded', event.payload);
  });

  listen('font_generation_complete', (event: { payload: string }) => {
    syncSessionStatusIfCurrent(event.payload, 'generated');
    syncLatestJobProgress('generated', event.payload);
  });

  listen('vectorization_complete', (event: { payload: string }) => {
    syncSessionStatusIfCurrent(event.payload, 'vectorized');
    syncLatestJobProgress('vectorized', event.payload);
  });

  listen('clustering_complete', (event: { payload: string }) => {
    console.log('Clustering completed for session:', event.payload);
    syncSessionStatusIfCurrent(event.payload, 'clustered');
    syncLatestJobProgress('clustered', event.payload);
  });

  listen('positioning_complete', (event: { payload: string }) => {
    console.log('Positioning completed for session:', event.payload);
    syncSessionStatusIfCurrent(event.payload, 'positioned');
    syncLatestJobProgress('positioned', event.payload);
  });

  listen('all_jobs_complete', (event: { payload: string }) => {
    console.log('All jobs completed successfully for session:', event.payload);
    markLatestRunningJobState('completed', event.payload);
    notifyJobComplete(event.payload);
  });

  listen('refresh-requested', () => {
    window.location.reload();
  });

  listen('check-update-requested', () => {
    checkForAppUpdates(true);
  });

  // Check for updates automatically on startup
  checkForAppUpdates();
}
