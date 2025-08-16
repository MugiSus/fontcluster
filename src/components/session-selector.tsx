import { createSignal, createResource, For, onMount } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { ArchiveRestoreIcon, Trash2Icon } from 'lucide-solid';
import { type SessionConfig } from '../types/font';

// Constants
const CLUSTER_COLORS = [
  'bg-blue-500',
  'bg-red-500',
  'bg-yellow-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-orange-500',
  'bg-teal-500',
  'bg-indigo-500',
  'bg-cyan-500',
  'bg-fuchsia-500',
] as const;

const CONFIRMATION_TIMEOUT = 3000;
const MAX_DISPLAYED_CLUSTERS = 10;

interface SessionSelectorProps {
  currentSessionId: string;
  onSessionSelect: (sessionId: string) => void;
}

type CompletionBadge = {
  text: 'Complete' | 'Compressed' | 'Vectorized' | 'Rasterized' | 'Empty';
  variant: 'default' | 'outline' | 'error';
};

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

  // Helper functions
  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleString();

  const getCompletionBadge = (session: SessionConfig): CompletionBadge => {
    if (session.has_clusters) return { text: 'Complete', variant: 'default' };
    if (session.has_compressed)
      return { text: 'Compressed', variant: 'outline' };
    if (session.has_vectors) return { text: 'Vectorized', variant: 'outline' };
    if (session.has_images) return { text: 'Rasterized', variant: 'outline' };
    return { text: 'Empty', variant: 'error' };
  };

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
      <DialogContent class='h-[80vh] max-w-3xl py-5'>
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
              const badge = getCompletionBadge(session);
              const clusterCount = Math.min(
                session.clusters_amount,
                MAX_DISPLAYED_CLUSTERS,
              );

              return (
                <SessionItem
                  session={session}
                  badge={badge}
                  clusterCount={clusterCount}
                  formatDate={formatDate}
                  isCurrentSession={
                    session.session_id === props.currentSessionId
                  }
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

// Extracted SessionItem component
interface SessionItemProps {
  session: SessionConfig;
  badge: CompletionBadge;
  clusterCount: number;
  formatDate: (dateStr: string) => string;
  isCurrentSession: boolean;
  isConfirmingDelete: boolean;
  isDeletingSession: boolean;
  isRestoring: boolean;
  onDeleteClick: () => void;
  onSelectSession: () => void;
}

function SessionItem(props: SessionItemProps) {
  return (
    <div class='p-4 transition-colors hover:bg-muted/50'>
      <div class='flex items-center justify-between gap-2'>
        <div class='flex flex-col'>
          <div class='mb-2 flex items-center gap-2'>
            <Badge variant={props.badge.variant} round>
              {props.badge.text}
            </Badge>
            <time class='text-xs tabular-nums text-muted-foreground'>
              {props.formatDate(props.session.date)}
            </time>
            <ClusterIndicators count={props.clusterCount} />
            <div class='text-xs text-muted-foreground'>
              {props.session.samples_amount}
            </div>
          </div>
          <div class='mb-1 truncate text-sm font-medium'>
            "{props.session.preview_text}"
          </div>
          <div class='font-mono text-xs text-muted-foreground'>
            {props.session.session_id}
          </div>
        </div>
        <SessionActions
          isCurrentSession={props.isCurrentSession}
          isConfirmingDelete={props.isConfirmingDelete}
          isDeletingSession={props.isDeletingSession}
          isRestoring={props.isRestoring}
          onDeleteClick={props.onDeleteClick}
          onSelectSession={props.onSelectSession}
        />
      </div>
    </div>
  );
}

// Cluster color indicators component
interface ClusterIndicatorsProps {
  count: number;
}

function ClusterIndicators(props: ClusterIndicatorsProps) {
  return (
    <div class='flex gap-1.5'>
      <For each={Array.from({ length: props.count }, (_, i) => i)}>
        {(i) => <div class={`size-2 rounded-full ${CLUSTER_COLORS[i]}`} />}
      </For>
    </div>
  );
}

// Session action buttons component
interface SessionActionsProps {
  isCurrentSession: boolean;
  isConfirmingDelete: boolean;
  isDeletingSession: boolean;
  isRestoring: boolean;
  onDeleteClick: () => void;
  onSelectSession: () => void;
}

function SessionActions(props: SessionActionsProps) {
  return (
    <div class='flex gap-2'>
      <Button
        class='text-destructive hover:bg-destructive/10 hover:text-destructive'
        size={props.isConfirmingDelete ? 'default' : 'icon'}
        variant='ghost'
        onClick={props.onDeleteClick}
        disabled={props.isDeletingSession}
      >
        {props.isConfirmingDelete ? 'Delete?' : <Trash2Icon class='size-4' />}
      </Button>
      <Button
        size='icon'
        onClick={props.onSelectSession}
        disabled={props.isCurrentSession || props.isRestoring}
        variant='outline'
      >
        <ArchiveRestoreIcon class='size-4' />
      </Button>
    </div>
  );
}
