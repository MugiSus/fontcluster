import { emit } from '@tauri-apps/api/event';
import { Show } from 'solid-js';
import { CopyIcon, SparklesIcon } from 'lucide-solid';
import { checkForAppUpdates } from '@/lib/updater';
import { appState } from '@/store';
import { cn } from '@/lib/utils';
import { ThemeModeToggle } from '../theme-mode-toggle';
import { SessionHistory } from './session-history';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { CollapsiblePanelKey, PanelState } from '../../types/panels';

interface GraphToolbarProps {
  panelState: PanelState;
  onReopenPanel: (panel: CollapsiblePanelKey) => void;
  isLeftInset?: boolean | undefined;
}

export function GraphToolbar(props: GraphToolbarProps) {
  const copyCurrentSelectedFont = (event: MouseEvent) => {
    emit('copy_family_name', {
      toast: true,
      isFontName: event.ctrlKey || event.metaKey,
    });
  };

  const handleManualUpdateCheck = () => {
    checkForAppUpdates(true);
  };

  return (
    <div class='pointer-events-none absolute inset-x-0 top-0 z-10 flex h-10 shrink-0 items-center gap-1 px-1'>
      <Show
        when={
          !props.panelState.control ||
          !props.panelState.list ||
          !props.panelState.chat
        }
      >
        <div
          class={cn(
            'pointer-events-auto z-10 flex items-center gap-0 rounded-full border',
            props.isLeftInset && 'pl-[72px]',
          )}
          data-tauri-drag-region
        >
          <Show when={!props.panelState.control}>
            <Button
              variant='ghost'
              size='sm'
              class='h-8 rounded-full bg-background px-3 text-xs text-muted-foreground hover:bg-accent/80 hover:text-foreground'
              onClick={() => props.onReopenPanel('control')}
            >
              Control
            </Button>
          </Show>
          <Show when={!props.panelState.list}>
            <Button
              variant='ghost'
              size='sm'
              class='h-8 rounded-full bg-background px-3 text-xs text-muted-foreground hover:bg-accent/80 hover:text-foreground'
              onClick={() => props.onReopenPanel('list')}
            >
              List
            </Button>
          </Show>
          <Show when={!props.panelState.chat}>
            <Button
              variant='ghost'
              size='sm'
              class='h-8 rounded-full bg-background px-3 text-xs text-muted-foreground hover:bg-accent/80 hover:text-foreground'
              onClick={() => props.onReopenPanel('chat')}
            >
              Chat
            </Button>
          </Show>
        </div>
      </Show>

      <div class='grow' />

      <div
        class='pointer-events-auto flex items-center justify-end gap-0 rounded-full border'
        data-tauri-drag-region
      >
        <Tooltip>
          <TooltipTrigger as='div' class='rounded-full'>
            <Button
              variant='ghost'
              size='icon'
              onClick={handleManualUpdateCheck}
              class='size-8 rounded-full bg-background text-muted-foreground hover:bg-accent/80 hover:text-foreground'
            >
              <SparklesIcon class='size-4' />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Check for updates</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger as='div' class='rounded-full'>
            <Button
              variant='ghost'
              size='icon'
              onClick={copyCurrentSelectedFont}
              class='size-8 rounded-full bg-background text-muted-foreground hover:bg-accent/80 hover:text-foreground'
              disabled={!appState.ui.selectedFontKey}
            >
              <CopyIcon class='size-4' />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Copy family name</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger as='div' class='rounded-full'>
            <SessionHistory class='size-8 rounded-full bg-background text-muted-foreground hover:bg-accent/80 hover:text-foreground' />
          </TooltipTrigger>
          <TooltipContent>Session history</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger as='div' class='rounded-full'>
            <ThemeModeToggle class='size-8 rounded-full bg-background text-muted-foreground hover:bg-accent/80 hover:text-foreground' />
          </TooltipTrigger>
          <TooltipContent>Theme</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
