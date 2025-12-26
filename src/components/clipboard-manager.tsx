import { onCleanup, untrack } from 'solid-js';
import { listen } from '@tauri-apps/api/event';
import { type FontConfig } from '../types/font';
import { showToast } from './ui/toast';
import { ArrowBigUpIcon, CopyCheckIcon } from 'lucide-solid';

interface ClipboardManagerProps {
  nearestFont: FontConfig | null;
}

export function ClipboardManager(props: ClipboardManagerProps) {
  const promise = listen<{ toast?: boolean; isFontName?: boolean }>(
    'copy_family_name',
    (event) => {
      const nearest = untrack(() => props.nearestFont);
      if (nearest) {
        navigator.clipboard
          .writeText(
            event.payload?.isFontName ? nearest.font_name : nearest.family_name,
          )
          .then(
            () =>
              event.payload?.toast &&
              showToast({
                title: (
                  <div class='flex items-center gap-2'>
                    <CopyCheckIcon class='mb-0.5 size-4' />'
                    {nearest.family_name}'
                  </div>
                ),
                description: (
                  <div class=''>
                    Tips: Hold the Shift
                    <ArrowBigUpIcon class='mx-0.5 mb-0.5 inline size-4' />
                    key while selecting a font to copy the family name directly.
                  </div>
                ),
                duration: 5000,
              }),
          )
          .catch((err) => {
            console.error('Failed to copy font name:', err);
          });
      }
    },
  );

  onCleanup(async () => {
    const unlisten = await promise;
    unlisten();
  });

  return null;
}
