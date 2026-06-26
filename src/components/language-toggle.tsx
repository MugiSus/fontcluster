import { LanguagesIcon } from 'lucide-solid';
import { useI18n } from '@/i18n';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

export function LanguageToggle(props: { class?: string }) {
  const { t, setLanguage } = useI18n();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        as={Button<'button'>}
        variant='ghost'
        size='sm'
        class={props.class}
      >
        <LanguagesIcon class='size-6 transition-all' />
        <span class='sr-only'>{t.language.toggle()}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent class='rounded-lg bg-slate-50 dark:bg-zinc-900'>
        <DropdownMenuItem onSelect={() => setLanguage('en')}>
          <span>{t.language.english()}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setLanguage('ja')}>
          <span>{t.language.japanese()}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setLanguage('system')}>
          <span>{t.language.system()}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
