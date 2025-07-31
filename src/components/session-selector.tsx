import { createSignal, createResource, For, Show } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { ArchiveRestoreIcon, RefreshCwIcon } from 'lucide-solid';
import { type SessionConfig } from '../types/font';

interface SessionSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSessionRestore: () => void;
  currentSessionId: string;
  onSessionSelect: (sessionId: string) => void;
}

export function SessionSelector(props: SessionSelectorProps) {
  const [isRestoring, setIsRestoring] = createSignal(false);

  const [availableSessions, { refetch }] = createResource(
    () => props.open,
    async (open: boolean) => {
      if (!open) return [];

      try {
        const result = await invoke<string>('get_available_sessions');
        return JSON.parse(result) as SessionConfig[];
      } catch (error) {
        console.error('Failed to get available sessions:', error);
        return [];
      }
    },
  );

  const selectSession = (sessionId: string) => {
    setIsRestoring(true);
    try {
      // Simply update the current session ID in the frontend
      props.onSessionSelect(sessionId);
      props.onSessionRestore();
      props.onOpenChange(false);
    } catch (error) {
      console.error('Failed to select session:', error);
    } finally {
      setIsRestoring(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const getCompletionBadge = (session: SessionConfig) => {
    if (session.has_clusters)
      return { text: 'Complete', variant: 'default' as const };
    if (session.has_compressed)
      return { text: 'Compressed', variant: 'outline' as const };
    if (session.has_vectors)
      return { text: 'Vectorized', variant: 'outline' as const };
    if (session.has_images)
      return { text: 'Rasterized', variant: 'outline' as const };
    return { text: 'Empty', variant: 'error' as const };
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent class='h-[75vh] max-w-2xl'>
        <DialogHeader>
          <DialogTitle>Restore Recent Session</DialogTitle>
          <DialogDescription>
            Select a previous session to restore.
          </DialogDescription>
        </DialogHeader>

        <div class='flex max-h-[50vh] flex-col gap-2 overflow-y-auto'>
          <Show
            when={!availableSessions.loading && availableSessions()}
            fallback={
              <div class='flex justify-center py-8'>
                <div class='text-sm text-muted-foreground'>
                  Loading sessions...
                </div>
              </div>
            }
          >
            <Show
              when={availableSessions()}
              fallback={
                <div class='py-8 text-center'>
                  <div class='text-sm text-muted-foreground'>
                    No previous sessions found
                  </div>
                </div>
              }
            >
              <For each={availableSessions()}>
                {(session) => {
                  const badge = getCompletionBadge(session);
                  return (
                    <div class='rounded-lg border p-4 transition-colors hover:bg-muted/50'>
                      <div class='flex items-start justify-between gap-2'>
                        <div class='min-w-0 flex-1'>
                          <div class='mb-2 flex items-center gap-2'>
                            <Badge
                              variant={badge.variant}
                              round
                              class='px-2 py-0'
                            >
                              {badge.text}
                            </Badge>
                            <time class='text-xs tabular-nums text-muted-foreground'>
                              {formatDate(session.date)}
                            </time>
                            <div class='flex gap-1.5'>
                              <For
                                each={new Array(
                                  Math.min(session.clusters_amount, 10),
                                )
                                  .fill(0)
                                  .map((_, i) => i)}
                              >
                                {(i) => (
                                  <div
                                    class={`size-2 rounded-full ${
                                      [
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
                                      ][i]
                                    }`}
                                  />
                                )}
                              </For>
                            </div>
                            <div class='text-xs text-muted-foreground'>
                              {session.samples_amount}
                            </div>
                          </div>
                          <div class='mb-1 truncate text-sm font-medium'>
                            "{session.preview_text}"
                          </div>
                          <div class='font-mono text-xs text-muted-foreground'>
                            {session.session_id}
                          </div>
                        </div>
                        <Show
                          when={session.session_id === props.currentSessionId}
                          fallback={
                            <Button
                              size='sm'
                              onClick={() => selectSession(session.session_id)}
                              disabled={isRestoring()}
                            >
                              Restore
                              <ArchiveRestoreIcon class='size-4' />
                            </Button>
                          }
                        >
                          <Button size='sm' disabled variant='outline'>
                            Current
                          </Button>
                        </Show>
                      </div>
                    </div>
                  );
                }}
              </For>
            </Show>
          </Show>
        </div>

        <div class='flex justify-end gap-2'>
          <Button variant='outline' onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant='outline'
            onClick={() => refetch()}
            disabled={availableSessions.loading}
          >
            Refresh
            <RefreshCwIcon class='size-4' />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
