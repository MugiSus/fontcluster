import { createSignal, createResource, For, Show } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

interface SessionInfo {
  session_id: string;
  preview_text: string;
  date: string;
  has_images: boolean;
  has_vectors: boolean;
  has_compressed: boolean;
  has_clusters: boolean;
}

interface SessionSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSessionRestore?: () => void;
}

export function SessionSelector(props: SessionSelectorProps) {
  const [isRestoring, setIsRestoring] = createSignal(false);
  const [currentSessionId, setCurrentSessionId] = createSignal<string>('');

  const [availableSessions, { refetch }] = createResource(
    () => props.open,
    async (open: boolean) => {
      if (!open) return [];

      try {
        // Get current session ID
        const sessionId = await invoke<string>('get_session_id');
        setCurrentSessionId(sessionId);

        const result = await invoke<string>('get_available_sessions');
        return JSON.parse(result) as SessionInfo[];
      } catch (error) {
        console.error('Failed to get available sessions:', error);
        return [];
      }
    },
  );

  const restoreSession = async (sessionId: string) => {
    setIsRestoring(true);
    try {
      await invoke('restore_session', { sessionId });
      props.onSessionRestore?.();
      props.onOpenChange(false);
    } catch (error) {
      console.error('Failed to restore session:', error);
    } finally {
      setIsRestoring(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const getCompletionBadge = (session: SessionInfo) => {
    if (session.has_clusters)
      return { text: 'Complete', class: 'bg-green-100 text-green-800' };
    if (session.has_compressed)
      return { text: 'Compressed', class: 'bg-yellow-100 text-yellow-800' };
    if (session.has_vectors)
      return { text: 'Vectorized', class: 'bg-blue-100 text-blue-800' };
    if (session.has_images)
      return { text: 'Images Only', class: 'bg-gray-100 text-gray-800' };
    return { text: 'Empty', class: 'bg-red-100 text-red-800' };
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent class='max-h-[80vh] max-w-2xl'>
        <DialogHeader>
          <DialogTitle>Restore Recent Session</DialogTitle>
          <DialogDescription>
            Select a previous session to restore. You can continue processing
            from where you left off.
          </DialogDescription>
        </DialogHeader>

        <div class='flex max-h-[50vh] flex-col gap-4 overflow-y-auto'>
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
                    <div class='rounded-lg border p-4 pb-2 transition-colors hover:bg-muted/50'>
                      <div class='flex items-start justify-between gap-4'>
                        <div class='min-w-0 flex-1'>
                          <div class='mb-2 flex items-center gap-2'>
                            <span
                              class={`rounded-full px-2 py-1 text-xs font-medium ${badge.class}`}
                            >
                              {badge.text}
                            </span>
                            <span class='text-xs text-muted-foreground'>
                              {formatDate(session.date)}
                            </span>
                          </div>
                          <div class='mb-1 truncate text-sm font-medium'>
                            "{session.preview_text}"
                          </div>
                          <div class='font-mono text-xs text-muted-foreground'>
                            {session.session_id}
                          </div>
                          <div class='mt-2 flex gap-2'>
                            <Show when={session.has_images}>
                              <span class='rounded bg-blue-50 px-2 py-1 text-xs text-blue-700'>
                                Images
                              </span>
                            </Show>
                            <Show when={session.has_vectors}>
                              <span class='rounded bg-green-50 px-2 py-1 text-xs text-green-700'>
                                Vectors
                              </span>
                            </Show>
                            <Show when={session.has_compressed}>
                              <span class='rounded bg-yellow-50 px-2 py-1 text-xs text-yellow-700'>
                                Compressed
                              </span>
                            </Show>
                            <Show when={session.has_clusters}>
                              <span class='rounded bg-purple-50 px-2 py-1 text-xs text-purple-700'>
                                Clustered
                              </span>
                            </Show>
                          </div>
                        </div>
                        <Show
                          when={session.session_id === currentSessionId()}
                          fallback={
                            <Button
                              size='sm'
                              onClick={() => restoreSession(session.session_id)}
                              disabled={isRestoring()}
                            >
                              {isRestoring() ? 'Restoring...' : 'Restore'}
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
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
