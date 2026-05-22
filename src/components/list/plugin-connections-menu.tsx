import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js';
import { CableIcon } from 'lucide-solid';

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

const CONNECTION_REFRESH_INTERVAL_MS = 5000;

function shortPluginId(pluginId: string) {
  return pluginId.length > 20 ? `${pluginId.slice(0, 20)}...` : pluginId;
}

function formatLastSeen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function PluginConnectionsMenu() {
  const [open, setOpen] = createSignal(false);
  const [plugins, setPlugins] = createSignal<PluginConnection[]>([]);
  const hasConnections = () => plugins().length > 0;

  async function loadConnections() {
    try {
      const response = await getConnectedPlugins();
      setPlugins(response.plugins);
    } catch (error) {
      console.error('Failed to load plugin connections:', error);
      setPlugins([]);
    }
  }

  createEffect(() => {
    void loadConnections();
    const intervalId = window.setInterval(() => {
      void loadConnections();
    }, CONNECTION_REFRESH_INTERVAL_MS);

    onCleanup(() => window.clearInterval(intervalId));
  });

  function handleOpenChange(isOpen: boolean) {
    setOpen(isOpen);
    if (isOpen) {
      void loadConnections();
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
              'relative size-8 rounded-full hover:bg-accent/80 hover:text-foreground',
              hasConnections()
                ? 'text-muted-foreground'
                : 'text-muted-foreground/45',
            )}
            aria-label='Plugin connections'
          >
            <CableIcon class='size-3.5' />
          </DropdownMenuTrigger>
          <DropdownMenuContent class='w-72 max-w-[calc(100vw-1rem)] p-1'>
            <DropdownMenuLabel>Plugin Connections</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <Show
              when={hasConnections()}
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
                <For each={plugins()}>
                  {(plugin) => (
                    <div class='rounded-sm p-2 text-xs'>
                      <div class='flex items-center justify-between gap-2'>
                        <span class='min-w-0 truncate font-medium'>
                          {plugin.plugin_name}
                        </span>
                        <span class='shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-xxs uppercase text-muted-foreground'>
                          {plugin.host}
                        </span>
                      </div>
                      <div class='mt-1 flex items-center justify-between gap-2 text-muted-foreground'>
                        <span class='min-w-0 truncate'>
                          {shortPluginId(plugin.plugin_id)}
                        </span>
                        <span class='shrink-0'>
                          {formatLastSeen(plugin.last_seen)}
                        </span>
                      </div>
                      <Show when={plugin.version}>
                        <div class='mt-1 truncate text-muted-foreground'>
                          v{plugin.version}
                        </div>
                      </Show>
                    </div>
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
