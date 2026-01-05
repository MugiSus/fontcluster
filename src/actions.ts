import { createResource, untrack, createRoot } from 'solid-js';
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
  fontMetadataMap,
  refetchSessionConfig,
  refetchFontMetadataMap,
} = createRoot(() => {
  const [sessionDirectory] = createResource(
    () => appState.session.id,
    async (sessionId): Promise<string> => {
      if (!sessionId) return '';
      try {
        const dir = await invoke<string>('get_session_directory', {
          sessionId,
        });
        setAppState('session', 'directory', dir);
        return dir;
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
        const config = JSON.parse(response) as SessionConfig;
        setAppState('session', 'config', config);
        setAppState('session', 'status', config.process_status);
        if (config.weights) {
          setAppState('ui', 'selectedWeights', config.weights as FontWeight[]);
        }
        return config;
      } catch (error) {
        console.error('Failed to get session info:', error);
        return null;
      }
    },
  );

  const [fontMetadataMap, { refetch: refetchFontMetadataMap }] = createResource(
    () => appState.session.id,
    async (sessionId): Promise<Map<string, FontMetadata>> => {
      if (!sessionId) return new Map();
      try {
        const response = await invoke<string>('get_compressed_vectors', {
          sessionId,
        });
        if (!response) {
          return new Map();
        }
        const data = JSON.parse(response) as Record<string, FontMetadata>;
        const map = new Map(Object.entries(data));
        setAppState('fonts', 'map', map);
        return map;
      } catch (error) {
        console.error('Failed to parse font configs:', error);
        return new Map();
      }
    },
  );

  return {
    sessionDirectory,
    sessionConfig,
    fontMetadataMap,
    refetchSessionConfig,
    refetchFontMetadataMap,
  };
});

// Actions

export const setSelectedWeights = (weights: FontWeight[]) =>
  setAppState('ui', 'selectedWeights', weights);

export const setSelectedFontMetadata = (font: FontMetadata | null) =>
  setAppState('ui', 'selectedFont', font);

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
    await refetchFontMetadataMap();
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

  listen('font_generation_complete', () => {
    setAppState('session', 'status', 'generated');
  });

  listen('vectorization_complete', () => {
    setAppState('session', 'status', 'vectorized');
  });

  listen('compression_complete', () => {
    setAppState('session', 'status', 'compressed');
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
