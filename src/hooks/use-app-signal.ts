import { createResource } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { state, setState } from '../store';
import {
  FontMetadata,
  type FontWeight,
  type SessionConfig,
  type AlgorithmConfig,
  type ProcessStatus,
} from '../types/font';

export function useAppSignal() {
  // Resources
  const [sessionDirectory] = createResource(
    () => state.session.id,
    async (sessionId): Promise<string> => {
      if (!sessionId) return '';
      try {
        const dir = await invoke<string>('get_session_directory', {
          sessionId,
        });
        setState('session', 'directory', dir);
        return dir;
      } catch (error) {
        console.error('Failed to get session directory:', error);
        return '';
      }
    },
  );

  const [sessionConfig, { refetch: refetchSessionConfig }] = createResource(
    () => state.session.id,
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
        setState('session', 'config', config);
        setState('session', 'status', config.process_status);
        if (config.weights) {
          setState('ui', 'selectedWeights', config.weights as FontWeight[]);
        }
        return config;
      } catch (error) {
        console.error('Failed to get session info:', error);
        return null;
      }
    },
  );

  const [fontMetadataMap, { refetch: refetchFontMetadataMap }] = createResource(
    () => state.session.id,
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
        setState('fonts', 'map', map);
        return map;
      } catch (error) {
        console.error('Failed to parse font configs:', error);
        return new Map();
      }
    },
  );

  // Processing actions
  const runProcessingJobs = async (
    text: string,
    weights: FontWeight[],
    algorithm: AlgorithmConfig,
    sessionId?: string,
    overrideStatus?: ProcessStatus,
  ) => {
    try {
      // Single command to run all jobs sequentially
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

  const stopJobs = async () => {
    try {
      await invoke('stop_jobs');
    } catch (error) {
      console.error('Failed to stop jobs:', error);
    }
  };

  return {
    // Actions (now updating global store)
    setSelectedWeights: (weights: FontWeight[]) =>
      setState('ui', 'selectedWeights', weights),
    setSelectedFontMetadata: (font: FontMetadata | null) =>
      setState('ui', 'selectedFont', font),
    setCurrentSessionId: (id: string) => setState('session', 'id', id),
    runProcessingJobs,
    stopJobs,

    // Expose resources if needed (though store is preferred source)
    sessionConfig,
    sessionDirectory,
    fontMetadataMap,
  };
}
