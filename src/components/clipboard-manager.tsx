import { onCleanup, untrack } from 'solid-js';
import { listen } from '@tauri-apps/api/event';
import { type FontConfig } from '../types/font';

interface ClipboardManagerProps {
  nearestFont: FontConfig | null;
}

export function ClipboardManager(props: ClipboardManagerProps) {
  const promise = listen<void>('copy_current_font_name', () => {
    const nearest = untrack(() => props.nearestFont);
    if (nearest) {
      navigator.clipboard.writeText(nearest.family_name).catch((err) => {
        console.error('Failed to copy font name:', err);
      });
    }
  });

  onCleanup(async () => {
    const unlisten = await promise;
    unlisten();
  });

  return null;
}
