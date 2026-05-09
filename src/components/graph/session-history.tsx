import {
  createMemo,
  createResource,
  createSignal,
  For,
  onCleanup,
  Show,
} from 'solid-js';
import { HistoryIcon, RefreshCwIcon } from 'lucide-solid';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { toast } from 'solid-sonner';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { appState, DEFAULT_SESSION_CONFIG, type JobRun } from '@/store';
import { runProcessingJobs, setCurrentSessionId } from '@/actions';
import { type FontWeight, type SessionConfig } from '@/types/font';
import {
  SessionHistoryItem,
  type SessionHistoryEntry,
} from './session-history-item';

const isUnfinishedJob = (job: JobRun) => job.state !== 'completed';

interface SessionHistoryProps {
  class?: string | undefined;
}

export function SessionHistory(props: SessionHistoryProps) {
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

  const historyEntries = createMemo<SessionHistoryEntry[]>(() => {
    const unfinishedJobs = appState.jobs.filter(isUnfinishedJob);
    const entries = visibleSessions().map((session) => {
      const job =
        unfinishedJobs.find((item) => item.sessionId === session.session_id) ??
        null;

      return {
        key: session.session_id,
        session,
        job,
        updatedAt: job?.updatedAt ?? session.modified_at,
      };
    });

    const sessionIds = new Set(
      entries.map((entry) => entry.session.session_id),
    );
    const looseJobEntries = unfinishedJobs
      .filter((job) => !job.sessionId || !sessionIds.has(job.sessionId))
      .map((job) => ({
        key: `job:${job.id}`,
        session: null,
        job,
        updatedAt: job.updatedAt,
      }));

    return [...looseJobEntries, ...entries].sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  });

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

  const continueSessionProcessing = (session: SessionConfig) => {
    const algorithm = session.algorithm ?? DEFAULT_SESSION_CONFIG.algorithm;
    if (!algorithm) return;

    void runProcessingJobs(
      session.preview_text || 'font',
      session.weights as FontWeight[],
      algorithm,
      session.session_id,
    );
    setOpen(false);
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
      <DropdownMenuContent class='w-[26rem] max-w-[calc(100vw-1rem)] p-1'>
        <DropdownMenuLabel class='flex items-center justify-between gap-2'>
          <span>History</span>
          <Tooltip>
            <TooltipTrigger
              as={Button<'button'>}
              size='icon'
              variant='ghost'
              class='size-7'
              onClick={() => {
                void refetch();
              }}
            >
              <RefreshCwIcon class='size-3.5' />
            </TooltipTrigger>
            <TooltipContent>Refresh history</TooltipContent>
          </Tooltip>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <Show
          when={!availableSessions.loading && historyEntries().length > 0}
          fallback={
            <p class='px-2 py-3 text-xs text-muted-foreground'>
              {availableSessions.loading
                ? 'Loading history...'
                : 'No sessions or jobs yet.'}
            </p>
          }
        >
          <div class='max-h-[30rem] overflow-y-auto'>
            <For each={historyEntries()}>
              {(entry) => (
                <SessionHistoryItem
                  entry={entry}
                  isCurrentSession={
                    entry.session?.session_id === appState.session.id
                  }
                  isRestoring={isRestoring()}
                  onDeleteClick={() =>
                    entry.session && handleDeleteClick(entry.session)
                  }
                  onContinueProcessing={() =>
                    entry.session && continueSessionProcessing(entry.session)
                  }
                  onSelectSession={() => {
                    const sessionId =
                      entry.session?.session_id ?? entry.job?.sessionId;
                    if (sessionId) selectSession(sessionId);
                  }}
                />
              )}
            </For>
          </div>
        </Show>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
