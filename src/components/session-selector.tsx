import { createSignal, createResource, For, onMount } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { SessionItem } from './session-item';
import { type SessionConfig } from '../types/font';
import { state } from '../store';

// Constants
const CONFIRMATION_TIMEOUT = 3000;

interface SessionSelectorProps {
  onSessionSelect: (sessionId: string) => void;
}

export function SessionSelector(props: SessionSelectorProps) {
  const [open, setOpen] = createSignal(false);
  const [isRestoring, setIsRestoring] = createSignal(false);
  const [deletingSession, setDeletingSession] = createSignal<string | null>(
    null,
  );
  const [confirmDeleteSession, setConfirmDeleteSession] = createSignal<
    string | null
  >(null);

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
      props.onSessionSelect(sessionId);
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
        refetch();
        setConfirmDeleteSession(null);
        console.log('Session deleted successfully:', sessionId);
      } else {
        console.error('Session deletion failed - session not found');
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
    } finally {
      setDeletingSession(null);
    }
  };

  const handleDeleteClick = (sessionId: string) => {
    if (confirmDeleteSession() === sessionId) {
      deleteSession(sessionId);
    } else {
      setConfirmDeleteSession(sessionId);
      setTimeout(() => {
        if (confirmDeleteSession() === sessionId) {
          setConfirmDeleteSession(null);
        }
      }, CONFIRMATION_TIMEOUT);
    }
  };

  return (
    <Dialog open={open()} onOpenChange={setOpen}>
      <DialogContent class='max-h-[80vh] max-w-screen-lg py-5'>
        <DialogHeader>
          <DialogTitle>Restore Recent Session</DialogTitle>
          <DialogDescription>
            Select a previous session to restore. You can continue processing
            from where you left off.
          </DialogDescription>
        </DialogHeader>

        <div class='flex flex-col overflow-y-auto rounded border'>
          <For each={availableSessions()}>
            {(session) => {
              return (
                <SessionItem
                  session={session}
                  clusterCount={session.clusters_amount}
                  isCurrentSession={session.session_id === state.session.id}
                  isConfirmingDelete={
                    confirmDeleteSession() === session.session_id
                  }
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
