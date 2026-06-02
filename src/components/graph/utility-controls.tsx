import { emit } from '@tauri-apps/api/event';
import { CopyIcon, Redo2Icon, SparklesIcon, Undo2Icon } from 'lucide-solid';
import { checkForAppUpdates } from '@/lib/updater';
import { appState } from '@/store';
import { ThemeModeToggle } from '../theme-mode-toggle';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { SessionHistory } from './session-history';

export function GraphUtilityControls() {
  const copyCurrentSelectedFont = (event: MouseEvent) => {
    emit('copy_family_name', {
      toast: true,
      isFontName: event.ctrlKey || event.metaKey,
    });
  };

  const handleManualUpdateCheck = () => {
    checkForAppUpdates({ isManual: true });
  };

  return (
    <div
      class='pointer-events-auto absolute right-1 top-1 z-10 flex items-center justify-end gap-0 rounded-full border'
      data-tauri-drag-region
    >
      <Tooltip>
        <TooltipTrigger as='div' class='rounded-full'>
          <Button
            variant='ghost'
            size='icon'
            onClick={() => {}}
            class='size-8 rounded-full bg-background text-muted-foreground hover:bg-accent/80 hover:text-foreground'
          >
            <Undo2Icon class='size-4' />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Undo</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger as='div' class='rounded-full'>
          <Button
            variant='ghost'
            size='icon'
            onClick={() => {}}
            class='size-8 rounded-full bg-background text-muted-foreground hover:bg-accent/80 hover:text-foreground'
          >
            <Redo2Icon class='size-4' />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Redo</TooltipContent>
      </Tooltip>

      <div class='pointer-events-none mx-1 h-4 border-l' />

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
  );
}
