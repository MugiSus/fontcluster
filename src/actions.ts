import { createResource, untrack, createRoot, createEffect } from 'solid-js';
import { reconcile } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { appState, setAppState } from './store';
import {
  FontMetadata,
  type FontWeight,
  type SessionConfig,
  type AlgorithmConfig,
  type ProcessStatus,
} from './types/font';

// Resources

export const {
  sessionDirectory,
  sessionConfig,
  fontMetadataRecord,
  refetchSessionConfig,
  refetchFontMetadataRecord,
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

  const [fontMetadataRecord, { refetch: refetchFontMetadataRecord }] =
    createResource(
      () => appState.session.id,
      async (sessionId): Promise<Record<string, FontMetadata>> => {
        if (!sessionId) return {};
        try {
          const response = await invoke<string>('get_compressed_vectors', {
            sessionId,
          });
          if (!response) {
            return {};
          }
          return JSON.parse(response) as Record<string, FontMetadata>;
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

  // Sync font metadata map to store
  createEffect(() => {
    const data = fontMetadataRecord();
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
    fontMetadataRecord,
    refetchSessionConfig,
    refetchFontMetadataRecord,
  };
});

// Actions

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
    await refetchFontMetadataRecord();
  } catch (error) {
    console.error('Failed to process fonts:', error);
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

  listen('discovery_complete', () => {
    setAppState('session', 'status', 'discovered');
  });

  listen('font_generation_complete', () => {
    setAppState('session', 'status', 'generated');
  });

  listen('compression_complete', () => {
    setAppState('session', 'status', 'compressed');
  });

  listen('mapping_complete', () => {
    setAppState('session', 'status', 'mapped');
  });

  listen('clustering_complete', (event: { payload: string }) => {
    console.log('Clustering completed for session:', event.payload);
    setAppState('session', 'status', 'clustered');
    untrack(() => {
      setCurrentSessionId(event.payload);
    });
  });

  listen('all_jobs_complete', (event: { payload: string }) => {
    console.log('All jobs completed successfully for session:', event.payload);
    untrack(() => {
      setCurrentSessionId(event.payload);
    });
  });

  listen('refresh-requested', () => {
    window.location.reload();
  });
}
