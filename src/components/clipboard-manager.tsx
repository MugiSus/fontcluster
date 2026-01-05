import { onCleanup, untrack, Show } from 'solid-js';
import { listen } from '@tauri-apps/api/event';
import { showToast } from './ui/toast';
import { ArrowBigUpIcon, CommandIcon, CopyCheckIcon } from 'lucide-solid';
import { state } from '../store';

export function ClipboardManager() {
  const promise = listen<{ toast?: boolean; isFontName?: boolean }>(
    'copy_family_name',
    (event) => {
      const nearest = untrack(() => state.ui.selectedFont);
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
                  <div>
                    <CopyCheckIcon class='mb-0.5 mr-1 inline size-4' />
                    {"'"}
                    {event.payload?.isFontName
                      ? nearest.font_name
                      : nearest.family_name}
                    {"'"}
                    {/* " */}
                  </div>
                ),
                description: (
                  <div>
                    Tips: Hold the Shift
                    <ArrowBigUpIcon class='mx-0.5 mb-0.5 inline size-4' />
                    while selecting a font to copy the family name directly from
                    the graph.{' '}
                    <Show when={!event.payload?.isFontName}>
                      Hold the Command
                      <CommandIcon class='mx-0.5 mb-0.5 inline size-4' />
                      to copy the weight as well.
                    </Show>
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
