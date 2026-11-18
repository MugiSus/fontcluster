import { Show } from 'solid-js';
import { useColorMode } from '@kobalte/core';

import { Check, Laptop, Sun, Moon } from 'lucide-solid';
import { useI18n } from '@/i18n';
import { themeMode } from '@/theme';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function ThemeModeToggle(props: { class?: string }) {
  const { t } = useI18n();
  const { setColorMode } = useColorMode();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        as={Button<'button'>}
        variant='ghost'
        size='sm'
        class={props.class}
      >
        <Sun class='size-6 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90' />
        <Moon class='absolute size-6 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0' />
        <span class='sr-only'>{t.graph.utilityControls.theme.toggle()}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent class='rounded-lg bg-slate-50 dark:bg-zinc-900'>
        <DropdownMenuItem onSelect={() => setColorMode('light')}>
          <Sun class='mr-2 size-4' />
          <span>{t.graph.utilityControls.theme.light()}</span>
          <Show when={themeMode() === 'light'}>
            <Check class='ml-auto size-4' />
          </Show>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setColorMode('dark')}>
          <Moon class='mr-2 size-4' />
          <span>{t.graph.utilityControls.theme.dark()}</span>
          <Show when={themeMode() === 'dark'}>
            <Check class='ml-auto size-4' />
          </Show>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setColorMode('system')}>
          <Laptop class='mr-2 size-4' />
          <span>{t.graph.utilityControls.theme.system()}</span>
          <Show when={themeMode() === 'system'}>
            <Check class='ml-auto size-4' />
          </Show>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
