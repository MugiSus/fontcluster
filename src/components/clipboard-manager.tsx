import { onCleanup, untrack, Show } from 'solid-js';
import { listen } from '@tauri-apps/api/event';
import { toast } from 'solid-sonner';
import { ArrowBigUpIcon, CommandIcon, CopyCheckIcon } from 'lucide-solid';
import { appState } from '../store';

export function ClipboardManager() {
  const promise = listen<{ toast?: boolean; isFontName?: boolean }>(
    'copy_family_name',
    (event) => {
      const nearest = untrack(() => appState.ui.selectedFont);
      if (nearest) {
        navigator.clipboard
          .writeText(
            event.payload?.isFontName ? nearest.font_name : nearest.family_name,
          )
          .then(
            () =>
              event.payload?.toast &&
              toast(
                <div class='flex flex-col gap-1'>
                  <div class='flex items-center gap-1 font-semibold'>
                    <CopyCheckIcon class='mx-0.5 size-4' />
                    {"'"}
                    {event.payload?.isFontName
                      ? nearest.font_name
                      : nearest.family_name}
                    {"'"}
                  </div>
                  <div class='text-xs leading-5 text-muted-foreground'>
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
                </div>,
                {
                  duration: 5000,
                },
              ),
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
