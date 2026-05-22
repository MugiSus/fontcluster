import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js';
import { CableIcon, FigmaIcon, PenToolIcon } from 'lucide-solid';

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

const CONNECTION_REFRESH_INTERVAL_MS = 1000;

function formatLastSeen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function hostLabel(host: string) {
  if (host === 'figma') return 'Figma';
  if (host === 'illustrator') return 'Illustrator';
  return host;
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
                    <div class='relative rounded-sm p-3 text-xs transition-colors hover:bg-muted/60'>
                      <div class='flex min-w-0 items-center gap-2'>
                        <span class='shrink-0 text-muted-foreground'>
                          <Show
                            when={plugin.host === 'figma'}
                            fallback={<PenToolIcon class='size-4' />}
                          >
                            <FigmaIcon class='size-4' />
                          </Show>
                        </span>
                        <span class='shrink-0 text-sm font-medium leading-5'>
                          {hostLabel(plugin.host)}
                        </span>
                        <span class='min-w-0 truncate text-muted-foreground'>
                          {plugin.document_name || 'Untitled'}
                        </span>
                        <span class='shrink-0'>
                          {formatLastSeen(plugin.last_seen)}
                        </span>
                      </div>
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
