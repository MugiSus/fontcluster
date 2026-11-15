import * as Dialog from '@kobalte/core/dialog';
import { XIcon } from 'lucide-solid';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { ControlContent } from './content';

/** Kobalte owns open state, focus trapping/restoration and dismissal. */
export function ControlDrawer() {
  const { t } = useI18n();
  return (
    <Dialog.Root>
      <div class='rounded-full border border-border/50 bg-background/50 shadow-inner-background backdrop-blur-md'>
        <Dialog.Trigger
          as={Button<'button'>}
          variant='ghost'
          size='sm'
          class='h-8 rounded-full px-3 text-xs capitalize text-muted-foreground hover:bg-accent/80 hover:text-foreground'
          aria-label={t.panels.open({ title: t.panels.control() })}
        >
          {t.panels.control()}
        </Dialog.Trigger>
      </div>
      <Dialog.Portal>
        <Dialog.Overlay class='fixed inset-0 z-50 bg-black/20 duration-200 data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0 motion-reduce:animate-none' />
        <Dialog.Content class='fixed inset-y-0 left-0 z-50 flex w-80 max-w-full flex-col border-r bg-background text-foreground shadow-xl outline-none duration-200 data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:slide-out-to-left data-[expanded]:slide-in-from-left motion-reduce:animate-none'>
          <div class='flex h-10 shrink-0 items-center border-b pl-4 pr-1.5'>
            <Dialog.Title
              data-tauri-drag-region
              class='flex h-full min-w-0 flex-1 items-center justify-end pr-2 text-right text-xs font-medium capitalize'
            >
              {t.panels.control()}
            </Dialog.Title>
            <Dialog.CloseButton
              as={Button<'button'>}
              variant='ghost'
              size='icon'
              class='size-8 rounded-full text-muted-foreground'
              aria-label={t.panels.close({ title: t.panels.control() })}
            >
              <XIcon class='size-3.5' />
            </Dialog.CloseButton>
          </div>
          <ControlContent />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
