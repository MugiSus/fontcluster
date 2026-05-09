import {
  createMemo,
  createResource,
  createSignal,
  For,
  onCleanup,
  Show,
} from 'solid-js';
import {
  HistoryIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SquareIcon,
  Trash2Icon,
} from 'lucide-solid';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { toast } from 'solid-sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getProcessStatusBadge } from '@/components/session-item';
import { cn } from '@/lib/utils';
import { appState } from '@/store';
import { setCurrentSessionId, stopJobs } from '@/actions';
import { type SessionConfig } from '@/types/font';

const formatTime = (iso: string) => new Date(iso).toLocaleTimeString();

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

interface JobHistoryProps {
  class?: string | undefined;
}

export function JobHistory(props: JobHistoryProps) {
  const [open, setOpen] = createSignal(false);
  const [isRestoring, setIsRestoring] = createSignal(false);
  const [hiddenSessionIds, setHiddenSessionIds] = createSignal<Set<string>>(
    new Set(),
  );
  const committedDeletes = new Set<string>();
  const cancelledDeletes = new Set<string>();

  const [availableSessions, { refetch }] = createResource(async () => {
    try {
      const result = await invoke<string>('get_available_sessions');
      return JSON.parse(result) as SessionConfig[];
    } catch (error) {
      console.error('Failed to get available sessions:', error);
      return [];
    }
  });

  const visibleSessions = createMemo(() =>
    (availableSessions() ?? []).filter(
      (session) => !hiddenSessionIds().has(session.session_id),
    ),
  );

  let unlisten: (() => void) | undefined;
  let disposed = false;

  listen('show_session_selection', () => {
    setOpen(true);
    void refetch();
  }).then((cleanup) => {
    if (disposed) {
      cleanup();
      return;
    }
    unlisten = cleanup;
  });

  onCleanup(() => {
    disposed = true;
    unlisten?.();
  });

  const sessionLabel = (sessionId: string | null) => {
    const session = availableSessions()?.find(
      (s) => s.session_id === sessionId,
    );
    return session?.preview_text || sessionId || 'pending';
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      void refetch();
    }
  };

  const selectSession = (sessionId: string) => {
    setIsRestoring(true);
    try {
      setCurrentSessionId(sessionId);
      setOpen(false);
    } catch (error) {
      console.error('Failed to select session:', error);
    } finally {
      setIsRestoring(false);
    }
  };

  const deleteSession = async (sessionId: string) => {
    if (cancelledDeletes.has(sessionId)) return;
    if (committedDeletes.has(sessionId)) return;
    committedDeletes.add(sessionId);

    try {
      const result = await invoke<boolean>('delete_session', {
        sessionUuid: sessionId,
      });
      if (result) {
        await refetch();
        return;
      }

      committedDeletes.delete(sessionId);
      setHiddenSessionIds((prev) => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
    } catch (error) {
      committedDeletes.delete(sessionId);
      setHiddenSessionIds((prev) => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
      console.error('Failed to delete session:', error);
    }
  };

  const handleDeleteClick = (session: SessionConfig) => {
    const sessionId = session.session_id;
    cancelledDeletes.delete(sessionId);
    setHiddenSessionIds((prev) => new Set(prev).add(sessionId));

    toast(`Session deleted: '${session.preview_text}'`, {
      description: 'The session data will be permanently lost.',
      action: {
        label: 'Undo',
        onClick: () => {
          cancelledDeletes.add(sessionId);
          setHiddenSessionIds((prev) => {
            const next = new Set(prev);
            next.delete(sessionId);
            return next;
          });
        },
      },
      duration: 5000,
      onDismiss: () => {
        void deleteSession(sessionId);
      },
      onAutoClose: () => {
        void deleteSession(sessionId);
      },
    });
  };

  return (
    <DropdownMenu open={open()} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger
        as={Button<'button'>}
        variant='ghost'
        size='icon'
        class={cn('size-8 rounded-full', props.class)}
        aria-label='Open job history'
      >
        <HistoryIcon class='size-4' />
      </DropdownMenuTrigger>
      <DropdownMenuContent class='w-[26rem] max-w-[calc(100vw-1rem)]'>
        <DropdownMenuLabel class='flex items-center justify-between gap-2'>
          <span>History</span>
          <Button
            size='icon'
            variant='ghost'
            class='size-7'
            onClick={() => {
              void refetch();
            }}
            title='Refresh history'
          >
            <RefreshCwIcon class='size-3.5' />
          </Button>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuLabel class='px-2 py-1 text-xs text-muted-foreground'>
          Recent sessions
        </DropdownMenuLabel>
        <Show
          when={!availableSessions.loading && visibleSessions().length > 0}
          fallback={
            <p class='px-2 py-3 text-xs text-muted-foreground'>
              {availableSessions.loading
                ? 'Loading sessions...'
                : 'No sessions yet.'}
            </p>
          }
        >
          <div class='max-h-80 space-y-1 overflow-y-auto px-1'>
            <For each={visibleSessions()}>
              {(session) => (
                <SessionHistoryRow
                  session={session}
                  isCurrentSession={session.session_id === appState.session.id}
                  isRestoring={isRestoring()}
                  onDeleteClick={() => handleDeleteClick(session)}
                  onSelectSession={() => selectSession(session.session_id)}
                />
              )}
            </For>
          </div>
        </Show>

        <DropdownMenuSeparator />
        <DropdownMenuLabel class='px-2 py-1 text-xs text-muted-foreground'>
          Jobs
        </DropdownMenuLabel>
        <Show
          when={appState.jobs.length > 0}
          fallback={
            <p class='px-2 py-3 text-xs text-muted-foreground'>No jobs yet.</p>
          }
        >
          <div class='max-h-72 space-y-2 overflow-y-auto px-1'>
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
                      onClick={() => {
                        if (!job.sessionId) return;
                        setCurrentSessionId(job.sessionId);
                        setOpen(false);
                      }}
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

interface SessionHistoryRowProps {
  session: SessionConfig;
  isCurrentSession: boolean;
  isRestoring: boolean;
  onDeleteClick: () => void;
  onSelectSession: () => void;
}

function SessionHistoryRow(props: SessionHistoryRowProps) {
  const badge = () => getProcessStatusBadge(props.session.process_status);

  return (
    <article class='rounded-md border p-2 text-xs transition-colors hover:bg-muted/60'>
      <div class='flex items-start justify-between gap-2'>
        <div class='min-w-0 space-y-1'>
          <div class='flex min-w-0 items-center gap-2'>
            <Badge variant={badge().variant} class='shrink-0 px-1.5 py-0' round>
              {badge().text}
            </Badge>
            <time class='truncate text-muted-foreground'>
              {formatDateTime(props.session.modified_at)}
            </time>
          </div>
          <p class='truncate text-sm font-medium leading-5'>
            {props.session.preview_text}
          </p>
          <p class='truncate text-muted-foreground'>
            {props.session.weights.join(', ')} weights ·{' '}
            {props.session.samples_amount} samples ·{' '}
            {props.session.clusters_amount} clusters
          </p>
        </div>
        <div class='flex shrink-0 items-center gap-1'>
          <Button
            size='icon'
            variant='ghost'
            class='size-7'
            disabled={props.isCurrentSession || props.isRestoring}
            onClick={props.onSelectSession}
            title={
              props.isCurrentSession ? 'Current session' : 'Restore session'
            }
          >
            <RotateCcwIcon class='size-3.5' />
          </Button>
          <Button
            size='icon'
            variant='ghost'
            class='size-7 text-destructive hover:bg-destructive/10 hover:text-destructive'
            onClick={props.onDeleteClick}
            title='Delete session'
          >
            <Trash2Icon class='size-3.5' />
          </Button>
        </div>
      </div>
    </article>
  );
}
