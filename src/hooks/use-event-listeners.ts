import { onMount, untrack } from 'solid-js';
import { listen } from '@tauri-apps/api/event';

interface UseEventListenersProps {
  setIsGenerating: (value: boolean) => void;
  setIsVectorizing: (value: boolean) => void;
  setIsCompressing: (value: boolean) => void;
  setIsClustering: (value: boolean) => void;
  setShowSessionSelector: (value: boolean) => void;
  setSampleText: (value: string) => void;
  setCheckedWeights: (weights: number[]) => void;
  setCurrentSessionId: (sessionId: string) => void;
  setProgressLabelNumerator: (
    value: number | ((prev: number) => number),
  ) => void;
  setProgressLabelDenominator: (
    value: number | ((prev: number) => number),
  ) => void;
  refetchSessionDirectory: () => void;
  refetchCompressedVectors: () => void;
}

export function useEventListeners(props: UseEventListenersProps) {
  onMount(() => {
    // Note: Session loading is now handled through event-driven updates
    // Current session info will be set when processing starts or completes
    const loadCurrentSession = async () => {
      console.log('Session loading now handled through event-driven updates');
    };

    loadCurrentSession();

    listen('font_generation_complete', (event: { payload: string }) => {
      console.log('Font generation completed for session:', event.payload);
      untrack(() => {
        props.setIsGenerating(false);
        props.setIsVectorizing(true);
      });
    });

    listen('vectorization_complete', (event: { payload: string }) => {
      console.log('Vectorization completed for session:', event.payload);
      untrack(() => {
        props.setIsVectorizing(false);
        props.setIsCompressing(true);
      });
    });

    listen('compression_complete', (event: { payload: string }) => {
      console.log('Compression completed for session:', event.payload);
      untrack(() => {
        props.setIsCompressing(false);
        props.setIsClustering(true);
      });
    });

    listen('clustering_complete', (event: { payload: string }) => {
      console.log('Clustering completed for session:', event.payload);
      untrack(() => {
        props.setCurrentSessionId(event.payload);
        props.setIsClustering(false);
        props.refetchSessionDirectory();
        props.refetchCompressedVectors();
      });
    });

    listen('all_jobs_complete', (event: { payload: string }) => {
      console.log(
        'All jobs completed successfully for session:',
        event.payload,
      );
      untrack(() => {
        props.setCurrentSessionId(event.payload);
      });
      // All states are reset in the finally block of generateFontImages
    });

    listen('show_session_selection', () => {
      untrack(() => {
        props.setShowSessionSelector(true);
      });
    });

    // Progress tracking event listeners
    listen('progress_numerator_reset', (event: { payload: number }) => {
      untrack(() => {
        props.setProgressLabelNumerator(event.payload);
      });
    });

    listen('progress_denominator_reset', (event: { payload: number }) => {
      untrack(() => {
        props.setProgressLabelDenominator(event.payload);
      });
    });

    listen('progress_numerator_increment', () => {
      untrack(() => {
        props.setProgressLabelNumerator((prev: number) => prev + 1);
      });
    });

    listen('progress_denominator_set', (event: { payload: number }) => {
      untrack(() => {
        props.setProgressLabelDenominator(event.payload);
      });
    });

    listen('progress_denominator_decrement', () => {
      untrack(() => {
        props.setProgressLabelDenominator((prev: number) => prev - 1);
      });
    });
  });
}
