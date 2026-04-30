import { type JSX, Show } from 'solid-js';
import { XIcon } from 'lucide-solid';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

interface AppShellPanelProps {
  title: string;
  children: JSX.Element;
  class?: string | undefined;
  actions?: JSX.Element | undefined;
  isLeftInset?: boolean | undefined;
  onClose?: (() => void) | undefined;
}

export function AppShellPanel(props: AppShellPanelProps) {
  return (
    <section
      class={cn(
        'flex min-h-0 flex-col overflow-hidden border-r bg-background',
        props.class,
      )}
    >
      <div class='flex h-10 shrink-0 items-center gap-0 border-b pl-4 pr-1.5'>
        <div
          data-tauri-drag-region
          class={cn(
            'flex h-full min-w-0 flex-1 items-center text-xs font-medium capitalize',
            props.isLeftInset && 'pl-[72px]',
          )}
        >
          {props.title}
        </div>
        <Show when={props.actions}>{props.actions}</Show>
        <Show when={props.onClose}>
          <Button
            variant='ghost'
            size='icon'
            class='size-8 rounded-full text-muted-foreground hover:bg-accent/80 hover:text-foreground'
            onClick={() => props.onClose?.()}
            aria-label={`Close ${props.title} panel`}
          >
            <XIcon class='size-3.5' />
          </Button>
        </Show>
      </div>
      <div class='min-h-0 flex-1'>{props.children}</div>
    </section>
  );
}
