import { BotIcon } from 'lucide-solid';
import { useI18n } from '@/i18n';

export function ChatContent() {
  const { t } = useI18n();
  return (
    <div class='flex size-full items-stretch justify-stretch'>
      <div class='m-4 flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/20 p-4 text-center'>
        <BotIcon class='size-8 animate-bounce text-foreground' />
        <div class='text-sm font-medium text-foreground'>{t('chat.title')}</div>
        <p class='text-xs text-muted-foreground'>{t('chat.description')}</p>
      </div>
    </div>
  );
}
