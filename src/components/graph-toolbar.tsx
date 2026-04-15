import { emit } from '@tauri-apps/api/event';
import { For, Show } from 'solid-js';
import { CopyIcon, HistoryIcon, SparklesIcon } from 'lucide-solid';
import { checkForAppUpdates } from '@/lib/updater';
import { appState } from '@/store';
import { cn } from '@/lib/utils';
import { ModeToggle } from './mode-toggle';
import { SearchForm } from './search-form';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

export type CollapsiblePanelKey = 'control' | 'list' | 'chat';

interface CollapsedPanel {
  key: CollapsiblePanelKey;
  label: string;
}

interface GraphToolbarProps {
  collapsedPanels: CollapsedPanel[];
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

  const showSessions = () => {
    emit('show_session_selection');
  };

  const handleManualUpdateCheck = () => {
    checkForAppUpdates(true);
  };

  return (
    <div
      class={cn(
        'absolute inset-x-0 top-0 z-10 flex h-10 shrink-0 items-stretch gap-1 border-b border-border/70 bg-background/60 px-1.5 backdrop-blur-[2px]',
        props.isLeftInset && 'ml-1.5 pl-20',
      )}
    >
      <Show when={props.collapsedPanels.length > 0}>
        <div class='flex items-center gap-0.5'>
          <For each={props.collapsedPanels}>
            {(panel) => (
              <Button
                variant='ghost'
                size='sm'
                class='h-7 gap-0.5 rounded-full bg-background px-2.5 text-xs font-normal text-muted-foreground hover:bg-accent/80 hover:text-foreground'
                onClick={() => props.onReopenPanel(panel.key)}
              >
                {panel.label}
              </Button>
            )}
          </For>
        </div>
      </Show>

      <div class='flex grow items-center justify-center'>
        <div class='h-full flex-1' data-tauri-drag-region />
        <div class='w-full max-w-lg'>
          <SearchForm />
        </div>
        <div class='h-full flex-1' data-tauri-drag-region />
      </div>

      <div class='flex items-center justify-end gap-0'>
        <Tooltip>
          <TooltipTrigger as='div'>
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
          <TooltipTrigger as='div'>
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
          <TooltipTrigger as='div'>
            <Button
              variant='ghost'
              size='icon'
              onClick={showSessions}
              class='size-8 rounded-full bg-background text-muted-foreground hover:bg-accent/80 hover:text-foreground'
            >
              <HistoryIcon class='size-4' />
            </Button>
          </TooltipTrigger>
          <TooltipContent>History</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger as='div'>
            <ModeToggle class='size-8 rounded-full bg-background text-muted-foreground hover:bg-accent/80 hover:text-foreground' />
          </TooltipTrigger>
          <TooltipContent>Theme</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
