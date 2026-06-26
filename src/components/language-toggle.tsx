import { For, Show } from 'solid-js';
import { Check, Globe } from 'lucide-solid';
import { useI18n, type LanguageSelection } from '@/i18n';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

export function LanguageToggle(props: { class?: string }) {
  const { t, language, setLanguage } = useI18n();

  const options: { value: LanguageSelection; label: () => string }[] = [
    { value: 'en', label: () => t.language.english() },
    { value: 'ja', label: () => t.language.japanese() },
    { value: 'system', label: () => t.language.system() },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        as={Button<'button'>}
        variant='ghost'
        size='sm'
        class={props.class}
      >
        <Globe class='size-6 transition-all' />
        <span class='sr-only'>{t.language.toggle()}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent class='rounded-lg bg-slate-50 dark:bg-zinc-900'>
        <For each={options}>
          {(option) => (
            <DropdownMenuItem onSelect={() => setLanguage(option.value)}>
              <span>{option.label()}</span>
              <Show when={language() === option.value}>
                <Check class='ml-auto size-4' />
              </Show>
            </DropdownMenuItem>
          )}
        </For>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
