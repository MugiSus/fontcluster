import { CopyIcon, HistoryIcon } from 'lucide-solid';
import { emit } from '@tauri-apps/api/event';
import { Button } from './ui/button';
import { ModeToggle } from './mode-toggle';
import { appState } from '@/store';

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
      <div class='flex items-center gap-2'>
        <div class='size-1 rotate-45 bg-slate-400 dark:bg-zinc-600' />
        <div class='size-1 rotate-45 bg-slate-400 dark:bg-zinc-600' />
        <div class='size-1 rotate-45 bg-slate-400 dark:bg-zinc-600' />
      </div>
      <h1 data-tauri-drag-region class='mt-[2px] text-sm tracking-widest'>
        FontCluster
      </h1>
      <div class='flex items-center gap-2'>
        <div class='size-1 rotate-45 bg-slate-400 dark:bg-zinc-600' />
        <div class='size-1 rotate-45 bg-slate-400 dark:bg-zinc-600' />
        <div class='size-1 rotate-45 bg-slate-400 dark:bg-zinc-600' />
      </div>
      <div class='fixed right-1 top-1 mr-0.5 flex items-center'>
        <Button
          variant='ghost'
          size='icon'
          onClick={copyCurrentSelectedFont}
          class='size-6 rounded-full'
          disabled={!appState.ui.selectedFontKey}
        >
          <CopyIcon class='size-6' />
        </Button>
        <Button
          variant='ghost'
          size='icon'
          onClick={showSessions}
          class='size-6 rounded-full'
        >
          <HistoryIcon class='size-6' />
        </Button>
        <ModeToggle class='size-6 rounded-full' />
      </div>
    </header>
  );
}
