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
  const [checkedWeights, setCheckedWeights] = createSignal<number[]>([]);
  const [nearestFont, setNearestFont] = createSignal('');
  const [showSessionSelector, setShowSessionSelector] = createSignal(false);

  // Progress tracking
  const [progressLabelNumerator, setProgressLabelNumerator] = createSignal(0);
  const [progressLabelDenominator, setProgressLabelDenominator] =
    createSignal(0);

  // Resources
  const [sessionDirectory, { refetch: refetchSessionDirectory }] =
    createResource(() =>
      invoke<string>('get_session_directory').catch((error) => {
        console.error('Failed to get session directory:', error);
        return '';
      }),
    );

  const [sessionId, { refetch: refetchSessionId }] = createResource(() =>
    invoke<string>('get_current_session_id').catch((error) => {
      console.error('Failed to get session ID:', error);
      return '';
    }),
  );

  const [compressedVectors, { refetch: refetchCompressedVectors }] =
    createResource(
      () => sessionId(),
      () =>
        invoke<string>('get_compressed_vectors').then((response) => {
          if (!response) {
            return {};
          }
          try {
            return JSON.parse(response) as CompressedFontVectorMap;
          } catch (error) {
            console.error('Failed to parse compressed vectors:', error);
            return {};
          }
        }),
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
    refetchSessionDirectory();
    refetchCompressedVectors();

    // Load preview text from the restored session
    try {
      const sessionInfoStr = await invoke<string>('get_current_session_info');
      if (sessionInfoStr) {
        const sessionInfo = JSON.parse(sessionInfoStr);
        setSampleText(sessionInfo.preview_text);
        setCheckedWeights(sessionInfo.weights || [400]);
      }
    } catch (error) {
      console.error('Failed to get session preview text:', error);
    }
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
    sessionId,
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
    setProgressLabelNumerator,
    setProgressLabelDenominator,
    refetchSessionDirectory,
    refetchSessionId,
    refetchCompressedVectors,
    generateFontImages,
    handleSessionRestore,
  };
}
