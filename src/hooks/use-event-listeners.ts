import { onMount, untrack } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { setState } from '../store';

interface UseEventListenersProps {
  setCurrentSessionId: (sessionId: string) => void;
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

    // Progress tracking and status update event listeners
    listen('progress_numerator_reset', (event: { payload: number }) => {
      setState('progress', 'numerator', event.payload);
    });

    listen('progress_denominator_reset', (event: { payload: number }) => {
      setState('progress', 'denominator', event.payload);
    });

    listen('progress_numerator_increase', (event: { payload: number }) => {
      setState('progress', 'numerator', (prev) => prev + event.payload);
    });

    listen('progress_denominator_set', (event: { payload: number }) => {
      setState('progress', 'denominator', event.payload);
    });

    listen('progress_denominator_decrease', (event: { payload: number }) => {
      setState('progress', 'denominator', (prev) => prev - event.payload);
    });

    listen('font_generation_complete', () => {
      setState('session', 'status', 'generated');
    });

    listen('vectorization_complete', () => {
      setState('session', 'status', 'vectorized');
    });

    listen('compression_complete', () => {
      setState('session', 'status', 'compressed');
    });

    listen('clustering_complete', (event: { payload: string }) => {
      console.log('Clustering completed for session:', event.payload);
      setState('session', 'status', 'clustered');
      untrack(() => {
        props.setCurrentSessionId(event.payload);
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
    });

    listen('refresh-requested', () => {
      window.location.reload();
    });
  });
}
