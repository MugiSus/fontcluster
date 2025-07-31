import { onMount, untrack } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

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

    listen('clustering_complete', (event: { payload: string }) => {
      console.log('Clustering completed for session:', event.payload);
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
  });
}
