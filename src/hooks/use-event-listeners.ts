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
  refetchSessionId: () => void;
  refetchSessionDirectory: () => void;
  refetchCompressedVectors: () => void;
}

export function useEventListeners(props: UseEventListenersProps) {
  onMount(() => {
    // Load preview text from current session on startup
    const loadCurrentSessionText = async () => {
      try {
        const sessionInfoStr = await invoke<string>('get_current_session_info');
        if (sessionInfoStr) {
          const sessionInfo = JSON.parse(sessionInfoStr);
          props.setSampleText(sessionInfo.preview_text);
        }
      } catch (error) {
        console.error('Failed to get current session preview text:', error);
      }
    };

    loadCurrentSessionText();

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
  });
}
