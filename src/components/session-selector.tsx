import { createSignal, createResource, For, onMount } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { toast } from 'solid-sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { SessionItem } from './session-item';
import { type SessionConfig } from '../types/font';
import { appState } from '../store';
import { setCurrentSessionId } from '../actions';

// Constants

export function SessionSelector() {
  const [open, setOpen] = createSignal(false);
  const [isRestoring, setIsRestoring] = createSignal(false);
  const [deletingSession, setDeletingSession] = createSignal<string | null>(
    null,
  );
  const [hiddenSessionIds, setHiddenSessionIds] = createSignal<Set<string>>(
    new Set(),
  );

  const pendingDeletions = new Map<string, number>();

  // Listen for show_session_selection event
  onMount(() => {
    listen('show_session_selection', () => {
      setOpen(true);
    });
  });

  const [availableSessions, { refetch }] = createResource(
    () => open(),
    async (isOpen: boolean) => {
      if (!isOpen) return [];

      try {
        const result = await invoke<string>('get_available_sessions');
        return JSON.parse(result) as SessionConfig[];
      } catch (error) {
        console.error('Failed to get available sessions:', error);
        return [];
      }
    },
  );

  // Event handlers
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
    setDeletingSession(sessionId);
    try {
      const result = await invoke<boolean>('delete_session', {
        sessionUuid: sessionId,
      });
      if (result) {
        await refetch();
        setHiddenSessionIds((prev) => {
          const next = new Set(prev);
          next.delete(sessionId);
          return next;
        });
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
    } finally {
      setDeletingSession(null);
      pendingDeletions.delete(sessionId);
    }
  };

  const handleDeleteClick = (sessionId: string) => {
    // Optimistically hide
    setHiddenSessionIds((prev) => new Set(prev).add(sessionId));

    const timeoutId = window.setTimeout(() => {
      deleteSession(sessionId);
    }, 5000);

    pendingDeletions.set(sessionId, timeoutId);

    toast('Session deleted', {
      action: {
        label: 'Undo',
        onClick: () => {
          window.clearTimeout(timeoutId);
          pendingDeletions.delete(sessionId);
          setHiddenSessionIds((prev) => {
            const next = new Set(prev);
            next.delete(sessionId);
            return next;
          });
        },
      },
      onAutoClose: () => {
        // Deletion is already scheduled by setTimeout
      },
      onDismiss: () => {
        // Deletion is already scheduled by setTimeout
      },
    });
  };

  return (
    <Dialog open={open()} onOpenChange={setOpen}>
      <DialogContent class='flex max-h-[80vh] max-w-screen-md flex-col rounded-xl bg-gradient-to-b from-slate-20 to-slate-50 p-6 dark:from-zinc-900 dark:to-zinc-920'>
        <DialogHeader>
          <DialogTitle>Restore Recent Session</DialogTitle>
          <DialogDescription>
            Select a previous session to restore. You can continue processing
            from where you left off.
          </DialogDescription>
        </DialogHeader>

        <div class='flex min-h-0 grow flex-col overflow-y-scroll rounded border bg-background'>
          <For
            each={availableSessions()?.filter(
              (s) => !hiddenSessionIds().has(s.session_id),
            )}
          >
            {(session) => {
              return (
                <SessionItem
                  session={session}
                  clusterCount={session.clusters_amount}
                  isCurrentSession={session.session_id === appState.session.id}
                  isDeletingSession={deletingSession() === session.session_id}
                  isRestoring={isRestoring()}
                  onDeleteClick={() => handleDeleteClick(session.session_id)}
                  onSelectSession={() => selectSession(session.session_id)}
                />
              );
            }}
          </For>
        </div>
      </DialogContent>
    </Dialog>
  );
}
