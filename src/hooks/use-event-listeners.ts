import { onMount } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

interface UseEventListenersProps {
  setIsGenerating: (value: boolean) => void;
  setIsVectorizing: (value: boolean) => void;
  setIsCompressing: (value: boolean) => void;
  setIsClustering: (value: boolean) => void;
  setShowSessionSelector: (value: boolean) => void;
  setSampleText: (value: string) => void;
  setCheckedWeights: (weights: number[]) => void;
  setProgressLabelNumerator: (value: number | ((prev: number) => number)) => void;
  setProgressLabelDenominator: (value: number | ((prev: number) => number)) => void;
  refetchSessionId: () => void;
  refetchSessionDirectory: () => void;
  refetchCompressedVectors: () => void;
}

export function useEventListeners(props: UseEventListenersProps) {
  onMount(() => {
    // Load preview text from current session on startup
    const loadCurrentSession = async () => {
      try {
        const sessionInfoStr = await invoke<string>('get_current_session_info');
        if (sessionInfoStr) {
          const sessionInfo = JSON.parse(sessionInfoStr);
          props.setSampleText(sessionInfo.preview_text);
          props.setCheckedWeights(sessionInfo.weights || [400]);
        }
      } catch (error) {
        console.error('Failed to get current session preview text:', error);
      }
    };

    loadCurrentSession();

    listen('font_generation_complete', () => {
      console.log('Font generation completed, refreshing images');
      props.setIsGenerating(false);
      props.setIsVectorizing(true);
    });

    listen('vectorization_complete', () => {
      console.log('Vectorization completed');
      props.setIsVectorizing(false);
      props.setIsCompressing(true);
    });

    listen('compression_complete', () => {
      console.log('Compression completed');
      props.setIsCompressing(false);
      props.setIsClustering(true);
    });

    listen('clustering_complete', () => {
      console.log('Clustering completed');
      props.setIsClustering(false);

      props.refetchSessionDirectory();
      props.refetchCompressedVectors();
    });

    listen('all_jobs_complete', () => {
      console.log('All jobs completed successfully!');
      // All states are reset in the finally block of generateFontImages
    });

    listen('show_session_selection', () => {
      console.log('Show session selection dialog');
      props.setShowSessionSelector(true);
    });

    // Progress tracking event listeners
    listen('progress_numerator_reset', (event: any) => {
      props.setProgressLabelNumerator(event.payload);
    });

    listen('progress_denominator_reset', (event: any) => {
      props.setProgressLabelDenominator(event.payload);
    });

    listen('progress_numerator_increment', () => {
      props.setProgressLabelNumerator((prev: number) => prev + 1);
    });

    listen('progress_denominator_set', (event: any) => {
      props.setProgressLabelDenominator(event.payload);
    });

    listen('progress_denominator_decrement', () => {
      props.setProgressLabelDenominator((prev: number) => prev - 1);
    });
  });
}
