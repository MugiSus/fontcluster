import {
  createMemo,
  createEffect,
  createSignal,
  For,
  onCleanup,
  Show,
} from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import { HistoryIcon, UndoIcon } from 'lucide-solid';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { toast } from 'solid-sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { appState } from '@/store';
import { runProcessingJobs, setCurrentSessionId, stopJobs } from '@/actions';
import { type SessionConfig } from '@/types/font';
import { SessionHistoryItem } from './session-history-item';

interface SessionHistoryProps {
  class?: string;
}

const SEEN_COMPLETED_SESSIONS_KEY = 'fontcluster:seen-completed-sessions';

type SeenCompletedSessions = Record<string, string>;

const loadSeenCompletedSessions = (): SeenCompletedSessions => {
  return JSON.parse(
    localStorage.getItem(SEEN_COMPLETED_SESSIONS_KEY) ?? '{}',
  ) as SeenCompletedSessions;
};

const saveSeenCompletedSessions = (sessions: SeenCompletedSessions) => {
  localStorage.setItem(SEEN_COMPLETED_SESSIONS_KEY, JSON.stringify(sessions));
};

export function SessionHistory(props: SessionHistoryProps) {
  const { t } = useI18n();
  const [open, setOpen] = createSignal(false);
  const [isRestoring, setIsRestoring] = createSignal(false);
  const [pendingDeletedSessionIds, setPendingDeletedSessionIds] = createSignal<
    Set<string>
  >(new Set());
  const [isLoadingSessions, setIsLoadingSessions] = createSignal(false);
  const [runningSessionIds, setRunningSessionIds] = createSignal<Set<string>>(
    new Set(),
  );
  const [seenCompletedSessions, setSeenCompletedSessions] =
    createSignal<SeenCompletedSessions>(loadSeenCompletedSessions());
  const [sessionHistory, setSessionHistory] = createStore<SessionConfig[]>([]);
  const committedDeletes = new Set<string>();

  const refetchSessionHistory = async () => {
    setIsLoadingSessions(true);
    try {
      const result = await invoke<SessionConfig[]>('get_session_history');
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

  const refetchRunningSessionIds = async () => {
    try {
      const result = await invoke<string[]>('get_running_session_ids');
      setRunningSessionIds(new Set(result));
    } catch (error) {
      console.error('Failed to get running sessions:', error);
    }
  };

  const refetchSessions = async () => {
    await Promise.all([refetchSessionHistory(), refetchRunningSessionIds()]);
  };

  const sortedSessions = createMemo<SessionConfig[]>(() => {
    const runningIds = runningSessionIds();
    return [...sessionHistory].sort(
      (a, b) =>
        Number(runningIds.has(b.session_id)) -
          Number(runningIds.has(a.session_id)) ||
        new Date(b.modified_at).getTime() - new Date(a.modified_at).getTime(),
    );
  });

  const isUnseenCompletedSession = (session: SessionConfig) =>
    session.status.process_status === 'clustered' &&
    !runningSessionIds().has(session.session_id) &&
    seenCompletedSessions()[session.session_id] !== session.modified_at;

  const hasRunningSession = () =>
    sessionHistory.some((session) =>
      runningSessionIds().has(session.session_id),
    );

  const markSessionSeen = (sessionId: string, modifiedAt: string) => {
    if (!sessionId) return;
    if (seenCompletedSessions()[sessionId] === modifiedAt) {
      return;
    }

    const next = {
      ...seenCompletedSessions(),
      [sessionId]: modifiedAt,
    };
    setSeenCompletedSessions(next);
    saveSeenCompletedSessions(next);
  };

  const unlisteners: Array<() => void> = [];
  let isDisposed = false;

  const registerListener = <T,>(
    event: string,
    handler: (event: { payload: T }) => void,
  ) => {
    listen(event, handler).then((cleanup) => {
      if (isDisposed) {
        cleanup();
        return;
      }
      unlisteners.push(cleanup);
    });
  };

  registerListener('show_session_selection', () => {
    setOpen(true);
    refetchSessions();
  });

  registerListener<string>('session_started', () => {
    refetchSessions();
  });

  registerListener<string>('all_jobs_complete', () => {
    refetchSessions();
  });

  registerListener<string | null>('jobs_cancelled', () => {
    refetchSessions();
  });

  createEffect(() => {
    if (!open() || runningSessionIds().size === 0) {
      return;
    }

    const intervalId = window.setInterval(() => {
      refetchSessions();
    }, 1000);

    onCleanup(() => window.clearInterval(intervalId));
  });

  createEffect(() => {
    const session = appState.session;
    if (
      session.status.process_status !== 'clustered' ||
      runningSessionIds().has(session.session_id)
    ) {
      return;
    }
    markSessionSeen(session.session_id, session.modified_at);
  });

  onCleanup(() => {
    isDisposed = true;
    for (const unlisten of unlisteners) unlisten();
  });

  refetchSessions();

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      const pendingDeletes = pendingDeletedSessionIds();
      setPendingDeletedSessionIds(new Set<string>());
      commitPendingDeletes(pendingDeletes);
    }

    setOpen(nextOpen);
    if (nextOpen) {
      refetchSessions();
    }
  };

  const selectSession = (sessionId: string) => {
    setIsRestoring(true);
    try {
      const session = sessionHistory.find(
        (session) => session.session_id === sessionId,
      );
      if (
        session &&
        session.status.process_status === 'clustered' &&
        !runningSessionIds().has(session.session_id)
      ) {
        markSessionSeen(session.session_id, session.modified_at);
      }
      setCurrentSessionId(sessionId);
      handleOpenChange(false);
    } catch (error) {
      console.error('Failed to select session:', error);
    } finally {
      setIsRestoring(false);
    }
  };

  const continueSessionProcessing = (session: SessionConfig) => {
    toast.info(t.jobs.started({ text: session.algorithm.rendering.text }));
    runProcessingJobs(session.algorithm, session.session_id).catch((error) => {
      console.error('Failed to process fonts:', error);
      toast.error(t.jobs.failed({ error: String(error) }));
    });
  };

  const stopCurrentRun = async (sessionId: string) => {
    await stopJobs(sessionId);
    await refetchSessions();
  };

  const deleteSession = async (sessionId: string) => {
    if (committedDeletes.has(sessionId)) return;
    committedDeletes.add(sessionId);

    try {
      const isDeleted = await invoke<boolean>('delete_session', {
        sessionId,
      });
      if (isDeleted) {
        const next = { ...seenCompletedSessions() };
        delete next[sessionId];
        setSeenCompletedSessions(next);
        saveSeenCompletedSessions(next);
        await refetchSessions();
        return;
      }

      committedDeletes.delete(sessionId);
      setPendingDeletedSessionIds((prev) => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
    } catch (error) {
      committedDeletes.delete(sessionId);
      setPendingDeletedSessionIds((prev) => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
      console.error('Failed to delete session:', error);
    }
  };

  const handleDeleteClick = (session: SessionConfig) => {
    const sessionId = session.session_id;
    setPendingDeletedSessionIds((prev) => new Set(prev).add(sessionId));
  };

  const undoDeleteSession = (sessionId: string) => {
    setPendingDeletedSessionIds((prev) => {
      const next = new Set(prev);
      next.delete(sessionId);
      return next;
    });
  };

  const commitPendingDeletes = async (sessionIds: Set<string>) => {
    if (sessionIds.size === 0) return;

    await Promise.all(
      [...sessionIds].map((sessionId) => deleteSession(sessionId)),
    );
  };

  const PendingDeleteItem = (itemProps: {
    sessionId: string;
    sampleText: string;
  }) => (
    <div class='flex items-center justify-between rounded-sm px-3 py-4 text-xs text-muted-foreground'>
      <span>{t.sessionHistory.deleted({ text: itemProps.sampleText })}</span>
      <Button
        type='button'
        variant='ghost'
        size='sm'
        class='h-6 gap-1 px-2 text-xs text-muted-foreground'
        onClick={() => undoDeleteSession(itemProps.sessionId)}
      >
        <UndoIcon class='size-3' />
        {t.sessionHistory.undoDelete()}
      </Button>
    </div>
  );

  return (
    <DropdownMenu open={open()} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger
        as={Button<'button'>}
        variant='ghost'
        size='icon'
        class={cn('relative', props.class)}
        aria-label={t.sessionHistory.open()}
      >
        <HistoryIcon class='size-4' />
        <Show when={hasRunningSession()}>
          <span class='pointer-events-none absolute right-1.5 top-1.5 size-1.5 rounded-full bg-amber-500 after:absolute after:inset-0 after:animate-ping after:rounded-full after:bg-amber-500 after:content-[""]' />
        </Show>
        <Show
          when={
            !hasRunningSession() &&
            sessionHistory.some(isUnseenCompletedSession)
          }
        >
          <span class='pointer-events-none absolute right-1.5 top-1.5 size-1.5 rounded-full bg-blue-500' />
        </Show>
      </DropdownMenuTrigger>
      <DropdownMenuContent class='w-[26rem] max-w-[calc(100vw-1rem)] p-1'>
        <DropdownMenuLabel class='text-xs font-medium'>
          {t.sessionHistory.title()}
        </DropdownMenuLabel>

        <Show
          when={sortedSessions().length > 0}
          fallback={
            <p class='px-2 py-3 text-xs text-muted-foreground'>
              {isLoadingSessions()
                ? t.sessionHistory.loading()
                : t.sessionHistory.empty()}
            </p>
          }
        >
          <div class='max-h-[30rem] overflow-y-auto'>
            <For each={sortedSessions()}>
              {(session) => (
                <Show
                  when={!pendingDeletedSessionIds().has(session.session_id)}
                  fallback={
                    <PendingDeleteItem
                      sessionId={session.session_id}
                      sampleText={session.algorithm.rendering.text || 'A'}
                    />
                  }
                >
                  <SessionHistoryItem
                    session={session}
                    isCurrentSession={
                      session.session_id === appState.session.session_id
                    }
                    isRunning={runningSessionIds().has(session.session_id)}
                    isUnread={isUnseenCompletedSession(session)}
                    isRestoring={isRestoring()}
                    onDeleteClick={() => handleDeleteClick(session)}
                    onContinueProcessing={() =>
                      continueSessionProcessing(session)
                    }
                    onSelectSession={() => {
                      selectSession(session.session_id);
                    }}
                    onStopRun={() => stopCurrentRun(session.session_id)}
                  />
                </Show>
              )}
            </For>
          </div>
        </Show>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
