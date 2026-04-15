import { For, Show, createSignal } from 'solid-js';
import { ArrowDownAZ, ArrowDownNarrowWide, ArrowDownZA } from 'lucide-solid';
import { FontLists, type FontListSortMode } from './font-lists';
import { AppShellPanel } from './app-shell-panel';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

interface ListViewPanelProps {
  onClose: () => void;
  isLeftInset?: boolean | undefined;
}

const SORT_OPTIONS: Array<{
  value: FontListSortMode;
  label: string;
  icon: typeof ArrowDownAZ;
}> = [
  {
    value: 'similarity',
    label: 'Similarity',
    icon: ArrowDownNarrowWide,
  },
  {
    value: 'name-asc',
    label: 'Name (A-Z)',
    icon: ArrowDownAZ,
  },
  {
    value: 'name-desc',
    label: 'Name (Z-A)',
    icon: ArrowDownZA,
  },
];

export function ListViewPanel(props: ListViewPanelProps) {
  const [sortMode, setSortMode] = createSignal<FontListSortMode>('similarity');

  return (
    <AppShellPanel
      title='List'
      class='w-[300px] shrink-0'
      isLeftInset={props.isLeftInset}
      onClose={props.onClose}
      actions={
        <Tooltip>
          <TooltipTrigger as='div'>
            <DropdownMenu>
              <DropdownMenuTrigger
                as={Button<'button'>}
                variant='ghost'
                size='icon'
                class='size-8 rounded-full text-muted-foreground hover:bg-accent/80 hover:text-foreground'
                aria-label='Change list sort mode'
              >
                <For each={SORT_OPTIONS}>
                  {(option) => (
                    <Show when={option.value === sortMode()}>
                      <option.icon class='size-4' />
                    </Show>
                  )}
                </For>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuRadioGroup
                  value={sortMode()}
                  onChange={(value) => setSortMode(value as FontListSortMode)}
                >
                  <For each={SORT_OPTIONS}>
                    {(option) => (
                      <DropdownMenuRadioItem
                        value={option.value}
                        class='flex items-center gap-2'
                      >
                        <option.icon class='size-4 text-muted-foreground' />
                        {option.label}
                      </DropdownMenuRadioItem>
                    )}
                  </For>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </TooltipTrigger>
          <TooltipContent>Sort mode</TooltipContent>
        </Tooltip>
      }
    >
      <FontLists sortMode={sortMode()} />
    </AppShellPanel>
  );
}
