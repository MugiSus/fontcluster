import { CopyIcon, HistoryIcon } from 'lucide-solid';
import { emit } from '@tauri-apps/api/event';
import { Button } from './ui/button';
import { ModeToggle } from './mode-toggle';

export function Titlebar() {
  const copyCurrentNearestFont = () => {
    emit('copy_family_name', { toast: true });
  };

  const showSessions = () => {
    emit('show_session_selection');
  };

  return (
    <header
      data-tauri-drag-region
      class='sticky top-0 z-50 flex h-8 min-h-8 w-full select-none items-center justify-center'
    >
      <h1 data-tauri-drag-region class='mt-[3px] text-sm tracking-widest'>
        FontCluster
      </h1>
      <div class='fixed right-1 top-1 mr-0.5 flex items-center gap-px'>
        <Button
          variant='ghost'
          size='icon'
          onClick={copyCurrentNearestFont}
          class='size-6 rounded-full'
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
