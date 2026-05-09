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
import { appState, DEFAULT_SESSION_CONFIG } from '@/store';
import { runProcessingJobs, setCurrentSessionId, stopJobs } from '@/actions';
import { type FontWeight, type SessionConfig } from '@/types/font';
import { SessionHistoryItem } from './session-history-item';

interface SessionHistoryProps {
  class?: string;
}

export function SessionHistory(props: SessionHistoryProps) {
  const [open, setOpen] = createSignal(false);
  const [isRestoring, setIsRestoring] = createSignal(false);
  const [hiddenSessionIds, setHiddenSessionIds] = createSignal<Set<string>>(
    new Set(),
  );
  const [runningSessionIds, setRunningSessionIds] = createSignal<Set<string>>(
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

  const sortedSessions = createMemo<SessionConfig[]>(() => {
    const activeSessionIds = runningSessionIds();

    return visibleSessions().sort(
      (a, b) =>
        Number(activeSessionIds.has(b.session_id)) -
          Number(activeSessionIds.has(a.session_id)) ||
        new Date(b.modified_at).getTime() - new Date(a.modified_at).getTime(),
    );
  });
  const isRunningSession = (sessionId: string) =>
    runningSessionIds().has(sessionId);
  const runningProgress = (sessionId: string) => {
    const progress = appState.progress.bySession[sessionId];
    const denominator = progress?.denominator ?? 0;
    if (denominator <= 0) return 0;

    return Math.min(1, Math.max(0, (progress?.numerator ?? 0) / denominator));
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
    void refetch();
  });
  registerListener<string>('session_started', (event) => {
    setRunningSessionIds((prev) => new Set(prev).add(event.payload));
    void refetch();
  });
  registerListener<string>('all_jobs_complete', (event) => {
    setRunningSessionIds((prev) => {
      const next = new Set(prev);
      next.delete(event.payload);
      return next;
    });
    void refetch();
  });
  registerListener<string | null>('jobs_cancelled', (event) => {
    setRunningSessionIds((prev) => {
      if (!event.payload) return new Set<string>();

      const next = new Set(prev);
      next.delete(event.payload);
      return next;
    });
    void refetch();
  });

  onCleanup(() => {
    disposed = true;
    for (const unlisten of unlisteners) unlisten();
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
      session.preview_text || 'A',
      session.weights as FontWeight[],
      algorithm,
      session.session_id,
    );
    setOpen(false);
  };

  const stopCurrentRun = (sessionId: string) => {
    void stopJobs(sessionId);
    void refetch();
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
        class={props.class}
        aria-label='Open session history'
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
          when={!availableSessions.loading && sortedSessions().length > 0}
          fallback={
            <p class='px-2 py-3 text-xs text-muted-foreground'>
              {availableSessions.loading
                ? 'Loading history...'
                : 'No sessions yet.'}
            </p>
          }
        >
          <div class='max-h-[30rem] overflow-y-auto'>
            <For each={sortedSessions()}>
              {(session) => (
                <SessionHistoryItem
                  session={session}
                  isCurrentSession={session.session_id === appState.session.id}
                  isRunning={() => isRunningSession(session.session_id)}
                  isRestoring={isRestoring()}
                  progress={() => runningProgress(session.session_id)}
                  onDeleteClick={() => handleDeleteClick(session)}
                  onContinueProcessing={() =>
                    continueSessionProcessing(session)
                  }
                  onSelectSession={() => {
                    selectSession(session.session_id);
                  }}
                  onStopRun={() => stopCurrentRun(session.session_id)}
                />
              )}
            </For>
          </div>
        </Show>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
