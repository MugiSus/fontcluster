import { ArrowRightIcon } from 'lucide-solid';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';

interface FontItemProps {
  fontName: string;
  weightLabel: string;
  clusterBackgroundClass: string;
  clusterTextClass: string;
  sampleSrc: string;
  class?: string | undefined;
  onClick?: (() => void) | undefined;
}

export function FontItem(props: FontItemProps) {
  return (
    <Button
      type='button'
      variant='ghost'
      class={cn(
        'group relative flex h-20 w-full flex-col items-start justify-start gap-2 rounded-none px-4 pb-3.5 pt-2.5 shadow-none hover:bg-muted',
        props.class,
      )}
      onClick={props.onClick}
      aria-label={`Apply ${props.fontName} ${props.weightLabel} to plugins`}
    >
      <div class='flex items-center gap-2 font-semibold'>
        <div class={`h-3.5 w-1 rounded-full ${props.clusterBackgroundClass}`} />
        <div class={`text-sm ${props.clusterTextClass}`}>
          {props.weightLabel}
        </div>
        <div class='text-nowrap text-sm text-muted-foreground'>
          {props.fontName}
        </div>
      </div>
      <img
        class='block size-auto h-7 max-h-none max-w-none mix-blend-darken grayscale invert dark:mix-blend-lighten dark:invert-0'
        src={props.sampleSrc}
        alt={`Font preview for ${props.fontName}`}
        decoding='async'
      />
      <ArrowRightIcon class='absolute right-3 top-1/2 -translate-y-1/2 text-border transition-colors group-hover:text-muted-foreground' />
    </Button>
  );
}
