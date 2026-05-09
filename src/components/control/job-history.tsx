import { createResource, For, Show } from 'solid-js';
import { HistoryIcon, SquareIcon } from 'lucide-solid';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { appState } from '@/store';
import { setCurrentSessionId, stopJobs } from '@/actions';
import { type SessionConfig } from '@/types/font';

const formatTime = (iso: string) => new Date(iso).toLocaleTimeString();

export function JobHistory() {
  const [availableSessions] = createResource(async () => {
    const result = await invoke<string>('get_available_sessions');
    return JSON.parse(result) as SessionConfig[];
  });

  const sessionLabel = (sessionId: string | null) => {
    const session = availableSessions()?.find(
      (s) => s.session_id === sessionId,
    );
    return session?.preview_text || sessionId || 'pending';
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        as={Button<'button'>}
        variant='ghost'
        size='icon'
        class='size-8 rounded-full'
        aria-label='Open job history'
      >
        <HistoryIcon class='size-4' />
      </DropdownMenuTrigger>
      <DropdownMenuContent class='w-[28rem]'>
        <DropdownMenuLabel>Job history</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <Show
          when={appState.jobs.length > 0}
          fallback={
            <p class='p-2 text-xs text-muted-foreground'>No jobs yet.</p>
          }
        >
          <div class='max-h-96 space-y-2 overflow-y-auto px-1'>
            <For each={appState.jobs}>
              {(job) => (
                <article class='space-y-2 rounded-md border p-2 text-xs'>
                  <div class='flex items-center justify-between gap-2'>
                    <p class='font-semibold'>{job.title}</p>
                    <span class='rounded bg-muted px-1.5 py-0.5 uppercase'>
                      {job.state}
                    </span>
                  </div>
                  <div class='h-1 w-full overflow-hidden rounded-full bg-muted'>
                    <div
                      class='h-full bg-primary transition-all'
                      style={{ width: `${job.progress}%` }}
                    />
                  </div>
                  <div class='flex items-center justify-between gap-2 text-muted-foreground'>
                    <p>
                      {job.progress}% · {sessionLabel(job.sessionId)}
                    </p>
                    <p>{formatTime(job.updatedAt)}</p>
                  </div>
                  <div class='flex items-center gap-2'>
                    <Button
                      size='sm'
                      variant='secondary'
                      class='h-7 text-xs'
                      disabled={!job.sessionId}
                      onClick={() =>
                        job.sessionId && setCurrentSessionId(job.sessionId)
                      }
                    >
                      Restore session
                    </Button>
                    <Show when={job.canStop}>
                      <Button
                        size='icon'
                        variant='ghost'
                        class='size-7 text-destructive'
                        onClick={() => stopJobs()}
                        title='Stop run'
                      >
                        <SquareIcon class='size-3' />
                      </Button>
                    </Show>
                  </div>
                </article>
              )}
            </For>
          </div>
        </Show>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
