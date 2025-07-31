import { onMount, untrack } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ProcessingStatus } from './use-app-signal';

interface UseEventListenersProps {
  setProcessingStatus: (value: ProcessingStatus) => void;
  setShowSessionSelector: (value: boolean) => void;
  setCurrentSessionId: (sessionId: string) => void;
  setProgressLabelNumerator: (
    value: number | ((prev: number) => number),
  ) => void;
  setProgressLabelDenominator: (
    value: number | ((prev: number) => number),
  ) => void;
}

export function useEventListeners(props: UseEventListenersProps) {
  onMount(() => {
    // Load latest session ID on startup
    const loadCurrentSession = async () => {
      try {
        const latestSessionId = await invoke<string | null>(
          'get_latest_session_id',
        );
        if (latestSessionId) {
          console.log('Setting latest session ID on startup:', latestSessionId);
          untrack(() => {
            props.setCurrentSessionId(latestSessionId);
          });
        } else {
          console.log('No existing sessions found');
        }
      } catch (error) {
        console.error('Failed to get latest session ID:', error);
      }
    };

    loadCurrentSession();

    listen('font_generation_complete', (event: { payload: string }) => {
      console.log('Font generation completed for session:', event.payload);
      untrack(() => {
        props.setProcessingStatus('vectorizing');
      });
    });

    listen('vectorization_complete', (event: { payload: string }) => {
      console.log('Vectorization completed for session:', event.payload);
      untrack(() => {
        props.setProcessingStatus('compressing');
      });
    });

    listen('compression_complete', (event: { payload: string }) => {
      console.log('Compression completed for session:', event.payload);
      untrack(() => {
        props.setProcessingStatus('clustering');
      });
    });

    listen('clustering_complete', (event: { payload: string }) => {
      console.log('Clustering completed for session:', event.payload);
      untrack(() => {
        props.setCurrentSessionId(event.payload);
        props.setProcessingStatus('idle');
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
