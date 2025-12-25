import { createSignal, createResource, createEffect } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import {
  FontConfigRecord,
  FontConfig,
  type FontWeight,
  type SessionConfig,
  type AlgorithmConfig,
  type ProcessStatus,
} from '../types/font';

export function useAppSignal() {
  // Signals
  const [selectedWeights, setSelectedWeights] = createSignal<FontWeight[]>([
    400,
  ]);
  const [nearestFontConfig, setNearestFontConfig] =
    createSignal<FontConfig | null>(null);
  const [currentSessionId, setCurrentSessionId] = createSignal<string>('');

  // Resources
  const [sessionDirectory] = createResource(
    () => currentSessionId(),
    async (sessionId): Promise<string> => {
      if (!sessionId) return '';
      try {
        return await invoke<string>('get_session_directory', { sessionId });
      } catch (error) {
        console.error('Failed to get session directory:', error);
        return '';
      }
    },
  );

  const [sessionConfig, { refetch: refetchSessionConfig }] = createResource(
    () => currentSessionId(),
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

  const [fontConfigs, { refetch: refetchFontConfigs }] = createResource(
    () => currentSessionId(),
    async (sessionId): Promise<FontConfigRecord> => {
      if (!sessionId) return {};
      try {
        const response = await invoke<string>('get_compressed_vectors', {
          sessionId,
        });
        if (!response) {
          return {};
        }
        return JSON.parse(response) as FontConfigRecord;
      } catch (error) {
        console.error('Failed to parse font configs:', error);
        return {};
      }
    },
  );

  // Auto-sync weights when sessionConfig changes
  createEffect(() => {
    const config = sessionConfig();
    if (config) {
      if (config.weights) {
        const weights = config.weights as FontWeight[];
        setSelectedWeights(weights);
      }
    }
  });

  // Processing actions
  const generateFontImages = async (
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
      await refetchFontConfigs();
    } catch (error) {
      console.error('Failed to process fonts:', error);
    } finally {
      // isProcessing is now handled by the caller (form)
    }
  };

  return {
    // Signals
    selectedWeights,
    nearestFontConfig,
    currentSessionId,

    // Resources
    sessionConfig,
    sessionDirectory,
    fontConfigs,

    // Actions
    setSelectedWeights,
    setNearestFontConfig,
    setCurrentSessionId,
    generateFontImages,
  };
}
