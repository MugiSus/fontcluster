import { CopyIcon, HistoryIcon } from 'lucide-solid';
import { emit } from '@tauri-apps/api/event';
import { Button } from './ui/button';
import { ModeToggle } from './mode-toggle';
import { appState } from '@/store';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

export function Titlebar() {
  const copyCurrentSelectedFont = (event: MouseEvent) => {
    emit('copy_family_name', {
      toast: true,
      isFontName: event.ctrlKey || event.metaKey,
    });
  };

  const showSessions = () => {
    emit('show_session_selection');
  };

  return (
    <header
      data-tauri-drag-region
      class='sticky top-0 z-50 flex h-8 min-h-8 w-full select-none items-center justify-center gap-3'
    >
      <div class='pointer-events-none flex items-center gap-2'>
        <div class='size-1 rotate-45 bg-border' />
        <div class='size-1 rotate-45 bg-border' />
        <div class='size-1 rotate-45 bg-border' />
      </div>
      <h1
        data-tauri-drag-region
        class='pointer-events-none mt-[2px] text-sm tracking-widest'
      >
        FontCluster
      </h1>
      <div class='pointer-events-none flex items-center gap-2'>
        <div class='size-1 rotate-45 bg-border' />
        <div class='size-1 rotate-45 bg-border' />
        <div class='size-1 rotate-45 bg-border' />
      </div>
      <div class='fixed right-1 top-1 mr-0.5 flex items-center'>
        <Tooltip>
          <TooltipTrigger as='div'>
            <Button
              variant='ghost'
              size='icon'
              onClick={copyCurrentSelectedFont}
              class='size-6 rounded-full'
              disabled={!appState.ui.selectedFontKey}
            >
              <CopyIcon class='size-6' />
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
              class='size-6 rounded-full'
            >
              <HistoryIcon class='size-6' />
            </Button>
          </TooltipTrigger>
          <TooltipContent>History</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger as='div'>
            <ModeToggle class='size-6 rounded-full' />
          </TooltipTrigger>
          <TooltipContent>Theme</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
