import {
  createMemo,
  createEffect,
  createSignal,
  For,
  onCleanup,
  Show,
} from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import { HistoryIcon, RefreshCwIcon } from 'lucide-solid';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { toast } from 'solid-sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
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
import { appState, DEFAULT_SESSION_CONFIG } from '@/store';
import { runProcessingJobs, setCurrentSessionId, stopJobs } from '@/actions';
import { type FontWeight, type SessionHistoryEntry } from '@/types/font';
import { SessionHistoryItem } from './session-history-item';

interface SessionHistoryProps {
  class?: string;
}

const SEEN_COMPLETED_SESSIONS_KEY = 'fontcluster:seen-completed-sessions';

type SeenCompletedSessions = Record<string, string>;

const loadSeenCompletedSessions = (): SeenCompletedSessions => {
  try {
    if (typeof localStorage === 'undefined') return {};
    return JSON.parse(
      localStorage.getItem(SEEN_COMPLETED_SESSIONS_KEY) ?? '{}',
    ) as SeenCompletedSessions;
  } catch {
    return {};
  }
};

const saveSeenCompletedSessions = (sessions: SeenCompletedSessions) => {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(SEEN_COMPLETED_SESSIONS_KEY, JSON.stringify(sessions));
  } catch {
    // Notification state is best-effort UI metadata.
  }
};

export function SessionHistory(props: SessionHistoryProps) {
  const [open, setOpen] = createSignal(false);
  const [isRestoring, setIsRestoring] = createSignal(false);
  const [hiddenSessionIds, setHiddenSessionIds] = createSignal<Set<string>>(
    new Set(),
  );
  const [isLoadingSessions, setIsLoadingSessions] = createSignal(false);
  const [seenCompletedSessions, setSeenCompletedSessions] =
    createSignal<SeenCompletedSessions>(loadSeenCompletedSessions());
  const [sessionHistory, setSessionHistory] = createStore<
    SessionHistoryEntry[]
  >([]);
  const committedDeletes = new Set<string>();
  const cancelledDeletes = new Set<string>();

  const refetchSessionHistory = async () => {
    setIsLoadingSessions(true);
    try {
      const result = await invoke<SessionHistoryEntry[]>('get_session_history');
      setSessionHistory(
        reconcile(result, {
          key: 'session_id',
        }),
      );
    } catch (error) {
      console.error('Failed to get session history:', error);
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const visibleSessions = createMemo(() =>
    sessionHistory.filter(
      (session) => !hiddenSessionIds().has(session.session_id),
    ),
  );

  const sortedSessions = createMemo<SessionHistoryEntry[]>(() =>
    visibleSessions().sort(
      (a, b) =>
        Number(b.is_running) - Number(a.is_running) ||
        new Date(b.modified_at).getTime() - new Date(a.modified_at).getTime(),
    ),
  );

  const isCompleteSession = (session: SessionHistoryEntry) =>
    session.status.process_status === 'positioned' && !session.is_running;

  const isUnseenCompletedSession = (session: SessionHistoryEntry) =>
    isCompleteSession(session) &&
    seenCompletedSessions()[session.session_id] !== session.modified_at;

  const hasRunningSession = () =>
    visibleSessions().some((session) => session.is_running);

  const markSessionSeen = (session: SessionHistoryEntry) => {
    if (!isCompleteSession(session)) return;
    if (seenCompletedSessions()[session.session_id] === session.modified_at) {
      return;
    }

    const next = {
      ...seenCompletedSessions(),
      [session.session_id]: session.modified_at,
    };
    setSeenCompletedSessions(next);
    saveSeenCompletedSessions(next);
  };

  const unlisteners: Array<() => void> = [];
  let disposed = false;

  const registerListener = <T,>(
    event: string,
    handler: (event: { payload: T }) => void,
  ) => {
    listen(event, handler).then((cleanup) => {
      if (disposed) {
        cleanup();
        return;
      }
      unlisteners.push(cleanup);
    });
  };

  registerListener('show_session_selection', () => {
    setOpen(true);
    void refetchSessionHistory();
  });

  registerListener<string>('session_started', () => {
    void refetchSessionHistory();
  });

  registerListener<string>('all_jobs_complete', () => {
    void refetchSessionHistory();
  });

  registerListener<string | null>('jobs_cancelled', () => {
    void refetchSessionHistory();
  });

  createEffect(() => {
    if (!open() || !sessionHistory.some((session) => session.is_running)) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refetchSessionHistory();
    }, 1000);

    onCleanup(() => window.clearInterval(intervalId));
  });

  onCleanup(() => {
    disposed = true;
    for (const unlisten of unlisteners) unlisten();
  });

  void refetchSessionHistory();

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      void refetchSessionHistory();
    }
  };

  const selectSession = (sessionId: string) => {
    setIsRestoring(true);
    try {
      const session = sessionHistory.find(
        (session) => session.session_id === sessionId,
      );
      if (session) markSessionSeen(session);
      setCurrentSessionId(sessionId);
      setOpen(false);
    } catch (error) {
      console.error('Failed to select session:', error);
    } finally {
      setIsRestoring(false);
    }
  };

  const continueSessionProcessing = (session: SessionHistoryEntry) => {
    const algorithm = session.algorithm ?? DEFAULT_SESSION_CONFIG.algorithm;
    if (!algorithm) return;

    void runProcessingJobs(
      session.preview_text || 'A',
      session.weights as FontWeight[],
      algorithm,
      session.session_id,
    );
  };

  const stopCurrentRun = async (sessionId: string) => {
    await stopJobs(sessionId);
    await refetchSessionHistory();
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
        const next = { ...seenCompletedSessions() };
        delete next[sessionId];
        setSeenCompletedSessions(next);
        saveSeenCompletedSessions(next);
        await refetchSessionHistory();
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

  const handleDeleteClick = (session: SessionHistoryEntry) => {
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
        class={cn('relative', props.class)}
        aria-label='Open session history'
      >
        <HistoryIcon class='size-4' />
        <span
          class={cn(
            'pointer-events-none absolute right-1.5 top-1.5 size-1.5 rounded-full',
            !hasRunningSession() &&
              !visibleSessions().some(isUnseenCompletedSession) &&
              'hidden',
            hasRunningSession()
              ? 'bg-amber-500 after:absolute after:inset-0 after:animate-ping after:rounded-full after:bg-amber-500 after:content-[""]'
              : 'bg-blue-500',
          )}
        />
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
                void refetchSessionHistory();
              }}
            >
              <RefreshCwIcon class='size-3.5' />
            </TooltipTrigger>
            <TooltipContent>Refresh history</TooltipContent>
          </Tooltip>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <Show
          when={sortedSessions().length > 0}
          fallback={
            <p class='px-2 py-3 text-xs text-muted-foreground'>
              {isLoadingSessions() ? 'Loading history...' : 'No sessions yet.'}
            </p>
          }
        >
          <div class='max-h-[30rem] overflow-y-auto'>
            <For each={sortedSessions()}>
              {(session) => (
                <SessionHistoryItem
                  session={session}
                  isCurrentSession={session.session_id === appState.session.id}
                  isUnread={isUnseenCompletedSession(session)}
                  isRestoring={isRestoring()}
                  onDeleteClick={() => handleDeleteClick(session)}
                  onContinueProcessing={() =>
                    continueSessionProcessing(session)
                  }
                  onSelectSession={() => {
                    selectSession(session.session_id);
                  }}
                  onStopRun={() => void stopCurrentRun(session.session_id)}
                />
              )}
            </For>
          </div>
        </Show>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
