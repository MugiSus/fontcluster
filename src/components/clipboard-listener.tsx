import { onCleanup, untrack, Show } from 'solid-js';
import { listen } from '@tauri-apps/api/event';
import { toast } from 'solid-sonner';
import { ArrowBigUpIcon, CommandIcon, CopyCheckIcon } from 'lucide-solid';
import { t } from '@/i18n';
import { appState } from '../store';

export function ClipboardListener() {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- payload field names are fixed by the backend event contract
  const promise = listen<{ toast?: boolean; isFontName?: boolean }>(
    'copy_family_name',
    (event) => {
      const nearest = untrack(() => appState.ui.selectedFont);
      if (nearest) {
        navigator.clipboard
          .writeText(
            event.payload?.isFontName
              ? nearest.meta.font_name
              : nearest.meta.family_name,
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
                      ? nearest.meta.font_name
                      : nearest.meta.family_name}
                    {"'"}
                  </div>
                  <div class='text-xs leading-5 text-muted-foreground'>
                    {t('clipboard.tips')} {t('clipboard.shiftBefore')}
                    <ArrowBigUpIcon class='mx-0.5 mb-0.5 inline size-4' />
                    {t('clipboard.shiftAfter')}{' '}
                    <Show when={!event.payload?.isFontName}>
                      {t('clipboard.commandBefore')}
                      <CommandIcon class='mx-0.5 mb-0.5 inline size-4' />
                      {t('clipboard.commandAfter')}
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
