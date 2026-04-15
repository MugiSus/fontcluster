import { type JSX, Show } from 'solid-js';
import { XIcon } from 'lucide-solid';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

interface AppShellPanelProps {
  title: string;
  children: JSX.Element;
  class?: string;
  bodyClass?: string;
  actions?: JSX.Element;
  onClose?: () => void;
}

export function AppShellPanel(props: AppShellPanelProps) {
  return (
    <section
      class={cn(
        'flex min-h-0 flex-col overflow-hidden border-r border-border/70 bg-background',
        props.class,
      )}
    >
      <div class='flex h-10 shrink-0 items-stretch gap-2 border-b border-border/70 pl-4 pr-1.5'>
        <div
          data-tauri-drag-region
          class='flex h-full min-w-0 flex-1 items-center text-xs'
        >
          {props.title}
        </div>
        <Show when={props.actions}>{props.actions}</Show>
        <Show when={props.onClose}>
          <Button
            variant='ghost'
            size='icon'
            class='size-7 self-center rounded-full text-muted-foreground hover:bg-accent/80 hover:text-foreground'
            onClick={() => props.onClose?.()}
            aria-label={`Close ${props.title} panel`}
          >
            <XIcon class='size-3.5' />
          </Button>
        </Show>
      </div>
      <div class={cn('min-h-0 flex-1', props.bodyClass)}>{props.children}</div>
    </section>
  );
}
