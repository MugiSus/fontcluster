import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import { CableIcon, PenToolIcon } from 'lucide-solid';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { Button } from '../ui/button';
import {
  getConnectedPlugins,
  type PluginConnection,
} from '@/lib/plugin-bridge';
import { cn } from '@/lib/utils';

export function PluginConnectionsMenu() {
  const [open, setOpen] = createSignal(false);
  const [plugins, setPlugins] = createStore<PluginConnection[]>([]);

  async function loadConnections() {
    try {
      const response = await getConnectedPlugins();
      setPlugins(reconcile(response.plugins, { key: 'plugin_id' }));
    } catch (error) {
      console.error('Failed to load plugin connections:', error);
      setPlugins([]);
    }
  }

  createEffect(() => {
    loadConnections();
    const intervalId = window.setInterval(() => {
      loadConnections();
    }, 1000);

    onCleanup(() => window.clearInterval(intervalId));
  });

  function handleOpenChange(isOpen: boolean) {
    setOpen(isOpen);
    if (isOpen) {
      loadConnections();
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger as='div'>
        <DropdownMenu open={open()} onOpenChange={handleOpenChange}>
          <DropdownMenuTrigger
            as={Button<'button'>}
            type='button'
            variant='ghost'
            size='icon'
            class={cn(
              'relative size-8 rounded-full hover:bg-accent/80 hover:text-muted-foreground',
              plugins.length > 0
                ? 'text-muted-foreground'
                : 'text-muted-foreground/30',
            )}
            aria-label='Plugin connections'
          >
            <CableIcon class='size-3.5' />
          </DropdownMenuTrigger>
          <DropdownMenuContent class='w-72 max-w-[calc(100vw-1rem)] p-1'>
            <DropdownMenuLabel class='font-medium'>
              Plugin connections
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <Show
              when={plugins.length > 0}
              fallback={
                <div class='space-y-2 px-2 py-3 text-xs text-muted-foreground'>
                  <p>No plugins connected.</p>
                  <p>
                    Fontcluster plugins apply the selected List item in Figma or
                    Illustrator.
                  </p>
                  <p>
                    Install a plugin, open it in the design app, then keep it
                    running while Fontcluster is open.
                  </p>
                </div>
              }
            >
              <div class='max-h-72 overflow-y-auto'>
                <For each={plugins}>
                  {(plugin) => (
                    <article class='relative flex items-center justify-between gap-2 rounded-sm p-2 text-xs transition-colors hover:bg-muted/60'>
                      <span class='shrink-0 text-muted-foreground'>
                        <Show
                          when={plugin.host === 'figma'}
                          fallback={<PenToolIcon class='size-3' />}
                        >
                          <div class='size-4 text-muted-foreground'>
                            <svg
                              viewBox='0 0 24 24'
                              fill='none'
                              xmlns='http://www.w3.org/2000/svg'
                            >
                              <path
                                d='M12.5 3H9.5C7.84315 3 6.5 4.34315 6.5 6C6.5 7.65685 7.84315 9 9.5 9M12.5 3V9M12.5 3H15.5C17.1569 3 18.5 4.34315 18.5 6C18.5 7.65685 17.1569 9 15.5 9M12.5 9H9.5M12.5 9H15.5M12.5 9V15M9.5 9C7.84315 9 6.5 10.3431 6.5 12C6.5 13.6569 7.84315 15 9.5 15M15.5 9C17.1569 9 18.5 10.3431 18.5 12C18.5 13.6569 17.1569 15 15.5 15C13.8431 15 12.5 13.6569 12.5 12C12.5 10.3431 13.8431 9 15.5 9ZM12.5 15H9.5M12.5 15V18C12.5 19.6569 11.1569 21 9.5 21C7.84315 21 6.5 19.6569 6.5 18C6.5 16.3431 7.84315 15 9.5 15'
                                stroke-width='2'
                                stroke='currentColor'
                              />
                            </svg>
                          </div>
                        </Show>
                      </span>
                      <p class='min-w-0 truncate'>
                        {plugin.document_name || 'Untitled'}
                      </p>
                      <time class='ml-auto shrink-0 tabular-nums text-muted-foreground'>
                        {new Date(plugin.last_seen).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                          hour12: false,
                        })}
                      </time>
                    </article>
                  )}
                </For>
              </div>
            </Show>
          </DropdownMenuContent>
        </DropdownMenu>
      </TooltipTrigger>
      <TooltipContent>Plugin connections</TooltipContent>
    </Tooltip>
  );
}
