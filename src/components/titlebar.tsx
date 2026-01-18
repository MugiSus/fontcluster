import { CopyIcon, HistoryIcon } from 'lucide-solid';
import { emit } from '@tauri-apps/api/event';
import { Button } from './ui/button';
import { ModeToggle } from './mode-toggle';
import { appState } from '@/store';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { SearchForm } from './search-form';

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
      class='sticky top-0 z-50 flex h-12 min-h-10 w-full select-none items-center justify-center'
    >
      <h1 class='absolute left-20 ml-2 text-xs font-medium tracking-widest text-muted-foreground'>
        FontCluster
      </h1>

      <div class='flex w-[480px] justify-center'>
        <SearchForm />
      </div>

      <div class='absolute right-3 justify-end'>
        <div class='flex items-center'>
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
      </div>
    </header>
  );
}
