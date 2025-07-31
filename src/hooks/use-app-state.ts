import { createSignal, createResource } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import {
  CompressedFontVectorMap,
  FontConfig,
  type FontWeight,
  type SessionInfo,
} from '../types/font';

export type ProcessingStatus =
  | 'idle'
  | 'generating'
  | 'vectorizing'
  | 'compressing'
  | 'clustering';

export function useAppState() {
  // Processing state
  const [processingStatus, setProcessingStatus] =
    createSignal<ProcessingStatus>('idle');

  // UI state
  const [sampleText, setSampleText] = createSignal('');
  const [selectedWeights, setSelectedWeights] = createSignal<FontWeight[]>([
    400,
  ]);
  const [nearestFontConfig, setNearestFontConfig] =
    createSignal<FontConfig | null>(null);
  const [showSessionSelector, setShowSessionSelector] = createSignal(false);
  const [currentSessionId, setCurrentSessionId] = createSignal<string>('');

  // Progress tracking
  const [progressLabelNumerator, setProgressLabelNumerator] = createSignal(0);
  const [progressLabelDenominator, setProgressLabelDenominator] =
    createSignal(0);

  // Resources
  const [sessionDirectory, { refetch: refetchSessionDirectory }] =
    createResource(
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

  const [compressedVectors, { refetch: refetchCompressedVectors }] =
    createResource(
      () => currentSessionId(),
      async (sessionId): Promise<CompressedFontVectorMap> => {
        if (!sessionId) return {};
        try {
          const response = await invoke<string>('get_compressed_vectors', {
            sessionId,
          });
          if (!response) {
            return {};
          }
          return JSON.parse(response) as CompressedFontVectorMap;
        } catch (error) {
          console.error('Failed to parse compressed vectors:', error);
          return {};
        }
      },
    );

  // Processing actions
  const generateFontImages = async (text: string, weights: FontWeight[]) => {
    setProcessingStatus('generating');
    try {
      // Single command to run all jobs sequentially
      const result = await invoke<string>('run_jobs', {
        text,
        weights,
      });
      console.log('Complete pipeline result:', result);
    } catch (error) {
      console.error('Failed to process fonts:', error);
    } finally {
      setProcessingStatus('idle');
    }
  };

  const handleSessionRestore = async () => {
    try {
      const sessionId = currentSessionId();
      if (!sessionId) {
        console.warn('No current session ID available for restore');
        return;
      }

      // Get session configuration by ID
      const sessionInfoResponse = await invoke<string | null>(
        'get_session_info',
        { sessionId },
      );

      if (sessionInfoResponse) {
        const sessionConfig: SessionInfo = JSON.parse(sessionInfoResponse);
        console.log('Restoring session config:', sessionConfig);

        // Restore sample text (preview_text in Rust)
        if (sessionConfig.preview_text) {
          setSampleText(sessionConfig.preview_text);
        }

        // Restore selected weights
        if (sessionConfig.weights && Array.isArray(sessionConfig.weights)) {
          setSelectedWeights(sessionConfig.weights as FontWeight[]);
        }
      }
    } catch (error) {
      console.error('Failed to restore session config:', error);
    }

    // Refresh data
    refetchSessionDirectory();
    refetchCompressedVectors();
  };

  return {
    // State
    processingStatus,
    sampleText,
    selectedWeights,
    nearestFontConfig,
    showSessionSelector,
    progressLabelNumerator,
    progressLabelDenominator,
    sessionDirectory,
    currentSessionId,
    compressedVectors,

    // Actions
    setProcessingStatus,
    setSampleText,
    setSelectedWeights,
    setNearestFontConfig,
    setShowSessionSelector,
    setCurrentSessionId,
    setProgressLabelNumerator,
    setProgressLabelDenominator,
    refetchSessionDirectory,
    refetchCompressedVectors,
    generateFontImages,
    handleSessionRestore,
  };
}
