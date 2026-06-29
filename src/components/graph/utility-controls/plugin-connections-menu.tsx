import { createSignal, For, Show } from 'solid-js';
import { ExternalLinkIcon, PenToolIcon, Plug2Icon } from 'lucide-solid';
import { openUrl } from '@tauri-apps/plugin-opener';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { appState } from '@/store';
import { refreshPluginConnections } from '@/actions';
import { useI18n } from '@/i18n';

const FIGMA_PLUGIN_URL =
  'https://www.figma.com/community/plugin/1637936965422808307/fontcluster-apply';

export function PluginConnectionsMenu() {
  const { t } = useI18n();
  const [open, setOpen] = createSignal(false);
  const plugins = () => appState.plugins.connections;

  function handleOpenChange(isOpen: boolean) {
    setOpen(isOpen);
    if (isOpen) {
      refreshPluginConnections();
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
            class='relative size-8 rounded-full text-muted-foreground'
            aria-label={t.plugins.title()}
          >
            <Plug2Icon class='size-3.5' />
            <Show when={appState.plugins.isConnected}>
              <span class='pointer-events-none absolute right-1.5 top-1.5 size-1.5 rounded-full bg-green-500' />
            </Show>
          </DropdownMenuTrigger>
          <DropdownMenuContent class='w-80 p-1'>
            <DropdownMenuLabel class='text-xs font-medium'>
              {t.plugins.title()}
            </DropdownMenuLabel>
            <Show
              when={appState.plugins.isConnected}
              fallback={
                <div class='flex flex-col gap-1 px-2 py-1 text-xs font-light leading-relaxed text-muted-foreground'>
                  <p>{t.plugins.empty()}</p>
                  <p>{t.plugins.description()}</p>
                  <p>
                    {t.plugins.installHintBeforePlug()}
                    <Plug2Icon
                      class='mx-0.5 inline size-3.5 -translate-y-px'
                      aria-label={t.plugins.plugIcon()}
                    />
                    {t.plugins.installHintAfterPlug()}
                  </p>
                </div>
              }
            >
              <For each={plugins()}>
                {(plugin) => (
                  <article class='flex items-center justify-between gap-2 rounded-sm p-2 text-xs transition-colors hover:bg-muted/60'>
                    <span class='pointer-events-none relative size-1.5 rounded-full bg-green-500 after:absolute after:inset-0 after:animate-ping after:rounded-full after:bg-green-500 after:content-[""]' />
                    <Show
                      when={plugin.host === 'figma'}
                      fallback={
                        <PenToolIcon class='size-4 text-muted-foreground' />
                      }
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
                    <Show
                      when={plugin.document_name}
                      fallback={
                        <p class='text-muted-foreground'>
                          {t.plugins.noDocument()}
                        </p>
                      }
                    >
                      <p class='min-w-0 truncate'>{plugin.document_name}</p>
                    </Show>
                    <p class='ml-auto text-muted-foreground'>
                      {plugin.host === 'figma' ? 'Figma' : 'Illustrator'}
                    </p>
                  </article>
                )}
              </For>
            </Show>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              class='cursor-pointer gap-2 text-xs text-muted-foreground'
              onSelect={() => openUrl(FIGMA_PLUGIN_URL)}
            >
              <ExternalLinkIcon class='size-3.5' />
              <span class='min-w-0 truncate'>{t.plugins.getPlugin()}</span>
            </DropdownMenuItem>
            <p class='px-2 pb-1 pt-0.5 text-xs font-normal text-muted-foreground/60'>
              {t.plugins.illustratorSoon()}
            </p>
          </DropdownMenuContent>
        </DropdownMenu>
      </TooltipTrigger>
      <TooltipContent>{t.plugins.title()}</TooltipContent>
    </Tooltip>
  );
}
