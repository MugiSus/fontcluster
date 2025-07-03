import { useColorMode } from '@kobalte/core';

import { Laptop, Sun, Moon } from 'lucide-solid';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { cn } from '@/lib/utils';

export function ModeToggle(props: { class?: string }) {
  const { setColorMode } = useColorMode();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        as={Button<'button'>}
        variant='ghost'
        size='sm'
        class={cn('size-6 rounded-full px-0', props.class)}
      >
        <Sun class='size-6 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0' />
        <Moon class='absolute size-6 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100' />
        <span class='sr-only'>Toggle theme</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={() => setColorMode('light')}>
          <Sun class='mr-2 size-4' />
          <span>Light</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setColorMode('dark')}>
          <Moon class='mr-2 size-4' />
          <span>Dark</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setColorMode('system')}>
          <Laptop class='mr-2 size-4' />
          <span>System</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
