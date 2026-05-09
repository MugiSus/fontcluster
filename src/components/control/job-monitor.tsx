import { For, Show } from 'solid-js';
import { HistoryIcon } from 'lucide-solid';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { appState } from '@/store';

const formatTime = (iso: string) => new Date(iso).toLocaleTimeString();

export function JobMonitor() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        as={Button<'button'>}
        variant='ghost'
        size='icon'
        class='size-8 rounded-full text-muted-foreground hover:bg-accent/80 hover:text-foreground'
        aria-label='Open job history'
      >
        <HistoryIcon class='size-4' />
      </DropdownMenuTrigger>
      <DropdownMenuContent class='w-96'>
        <DropdownMenuLabel>Job monitor</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <Show
          when={appState.jobs.length > 0}
          fallback={
            <p class='p-2 text-xs text-muted-foreground'>No jobs yet.</p>
          }
        >
          <div class='max-h-80 space-y-2 overflow-y-auto px-1'>
            <For each={appState.jobs}>
              {(job) => (
                <article class='rounded-md border p-2 text-xs'>
                  <div class='flex items-center justify-between gap-2'>
                    <p class='font-semibold'>{job.title}</p>
                    <span class='rounded bg-muted px-1.5 py-0.5 uppercase'>
                      {job.state}
                    </span>
                  </div>
                  <p class='mt-1 text-muted-foreground'>
                    Session: {job.sessionId || 'pending'}
                  </p>
                  <p class='text-muted-foreground'>
                    Updated: {formatTime(job.updatedAt)}
                  </p>
                </article>
              )}
            </For>
          </div>
        </Show>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
