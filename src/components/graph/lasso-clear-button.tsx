import { LassoSelectIcon, XIcon } from 'lucide-solid';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';

interface LassoClearButtonProps {
  onClear: () => void;
}

export function LassoClearButton(props: LassoClearButtonProps) {
  const { t } = useI18n();
  return (
    <div class='flex flex-col overflow-hidden rounded-full border bg-background text-muted-foreground'>
      <Button
        variant='ghost'
        size='sm'
        class='group relative flex h-7 gap-1 rounded-none pl-2 pr-2.5'
        onClick={() => props.onClear()}
      >
        <XIcon class='size-4' />
        {t.graph.lassoClearButton.label()}
        <LassoSelectIcon class='size-4' />
      </Button>
    </div>
  );
}
