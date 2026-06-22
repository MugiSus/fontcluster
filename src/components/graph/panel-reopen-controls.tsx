import { Show } from 'solid-js';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import { CollapsiblePanelKey, PanelState } from '../../types/panels';

interface GraphPanelReopenControlsProps {
  panelState: PanelState;
  onReopenPanel: (panel: CollapsiblePanelKey) => void;
  isLeftInset?: boolean | undefined;
}

export function GraphPanelReopenControls(props: GraphPanelReopenControlsProps) {
  return (
    <Show
      when={
        !props.panelState.control ||
        !props.panelState.list ||
        !props.panelState.chat
      }
    >
      <div
        class={cn(
          'shadow-inner-background pointer-events-auto absolute left-[3px] top-[3px] z-10 flex items-center gap-0 rounded-full border border-border/25 bg-background/50 backdrop-blur-md',
          props.isLeftInset && 'pl-[72px]',
        )}
        data-tauri-drag-region
      >
        <Show when={!props.panelState.control}>
          <Button
            variant='ghost'
            size='sm'
            class='h-8 rounded-full px-3 text-xs text-muted-foreground hover:bg-accent/80 hover:text-foreground'
            onClick={() => props.onReopenPanel('control')}
          >
            Control
          </Button>
        </Show>
        <Show when={!props.panelState.list}>
          <Button
            variant='ghost'
            size='sm'
            class='h-8 rounded-full px-3 text-xs text-muted-foreground hover:bg-accent/80 hover:text-foreground'
            onClick={() => props.onReopenPanel('list')}
          >
            List
          </Button>
        </Show>
        <Show when={!props.panelState.chat}>
          <Button
            variant='ghost'
            size='sm'
            class='h-8 rounded-full px-3 text-xs text-muted-foreground hover:bg-accent/80 hover:text-foreground'
            onClick={() => props.onReopenPanel('chat')}
          >
            Chat
          </Button>
        </Show>
      </div>
    </Show>
  );
}
