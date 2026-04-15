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
        'flex min-h-0 flex-col overflow-hidden rounded-[28px] border border-border/70 bg-background/90 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)] backdrop-blur-sm',
        props.class,
      )}
    >
      <div class='flex h-12 shrink-0 items-center gap-2 border-b border-border/70 px-4'>
        <div
          data-tauri-drag-region
          class='min-w-0 flex-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground'
        >
          {props.title}
        </div>
        <Show when={props.actions}>{props.actions}</Show>
        <Show when={props.onClose}>
          <Button
            variant='ghost'
            size='icon'
            class='size-7 rounded-full text-muted-foreground hover:bg-accent/80 hover:text-foreground'
            onClick={() => props.onClose?.()}
            aria-label={`Close ${props.title} panel`}
          >
            <XIcon class='size-3.5' />
          </Button>
        </Show>
      </div>
      <div class={cn('min-h-0 flex-1 overflow-hidden', props.bodyClass)}>
        {props.children}
      </div>
    </section>
  );
}
