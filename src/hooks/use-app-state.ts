import { createSignal, createResource } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { CompressedFontVectorMap } from '../types/font';

export function useAppState() {
  // Processing state
  const [isGenerating, setIsGenerating] = createSignal(false);
  const [isVectorizing, setIsVectorizing] = createSignal(false);
  const [isCompressing, setIsCompressing] = createSignal(false);
  const [isClustering, setIsClustering] = createSignal(false);

  // UI state
  const [sampleText, setSampleText] = createSignal('');
  const [checkedWeights, setCheckedWeights] = createSignal<number[]>([400]);
  const [nearestFont, setNearestFont] = createSignal('');
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
  const generateFontImages = async (text: string, weights: number[]) => {
    setIsGenerating(true);
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
      setIsGenerating(false);
      setIsVectorizing(false);
      setIsCompressing(false);
      setIsClustering(false);
    }
  };

  const handleSessionRestore = async () => {
    // Note: Session restoration now handled through SessionSelector component
    // Data will automatically refresh through reactive dependencies when currentSessionId changes
    refetchSessionDirectory();
    refetchCompressedVectors();
  };

  return {
    // State
    isGenerating,
    isVectorizing,
    isCompressing,
    isClustering,
    sampleText,
    checkedWeights,
    nearestFont,
    showSessionSelector,
    progressLabelNumerator,
    progressLabelDenominator,
    sessionDirectory,
    currentSessionId,
    compressedVectors,

    // Actions
    setIsGenerating,
    setIsVectorizing,
    setIsCompressing,
    setIsClustering,
    setSampleText,
    setCheckedWeights,
    setNearestFont,
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
