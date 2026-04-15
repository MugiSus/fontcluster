import { emit } from '@tauri-apps/api/event';
import { For } from 'solid-js';
import { CopyIcon, HistoryIcon, SparklesIcon } from 'lucide-solid';
import { checkForAppUpdates } from '@/lib/updater';
import { appState } from '@/store';
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
    <div class='flex h-10 shrink-0 items-stretch gap-4 border-b border-border/70 px-1.5'>
      <div class='flex min-w-0 flex-1 items-center gap-1.5'>
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
        <div data-tauri-drag-region class='h-full flex-1' />
      </div>

      <div class='flex min-w-0 max-w-xl flex-1 items-center'>
        <div class='w-full max-w-xl'>
          <SearchForm />
        </div>
      </div>

      <div class='flex min-w-0 flex-1 items-center justify-end gap-0'>
        <div data-tauri-drag-region class='h-full flex-1' />
        <Tooltip>
          <TooltipTrigger as='div'>
            <Button
              variant='ghost'
              size='icon'
              onClick={handleManualUpdateCheck}
              class='size-8 rounded-full text-muted-foreground hover:bg-accent/80 hover:text-foreground'
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
              class='size-8 rounded-full text-muted-foreground hover:bg-accent/80 hover:text-foreground'
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
              class='size-8 rounded-full text-muted-foreground hover:bg-accent/80 hover:text-foreground'
            >
              <HistoryIcon class='size-4' />
            </Button>
          </TooltipTrigger>
          <TooltipContent>History</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger as='div'>
            <ModeToggle class='size-8 rounded-full text-muted-foreground hover:bg-accent/80 hover:text-foreground' />
          </TooltipTrigger>
          <TooltipContent>Theme</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
