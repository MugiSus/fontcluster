import { cn } from '../../lib/utils';

interface FontItemProps {
  fontName: string;
  weightLabel: string;
  clusterBackgroundClass: string;
  clusterTextClass: string;
  sampleSrc: string;
  class?: string | undefined;
}

export function FontItem(props: FontItemProps) {
  return (
    <div
      class={cn(
        'flex h-20 w-full cursor-pointer flex-col items-start gap-2 pb-3.5 pt-2.5',
        props.class,
      )}
    >
      <div class='flex items-center gap-2 px-4 font-semibold'>
        <div class={`h-3.5 w-1 rounded-full ${props.clusterBackgroundClass}`} />
        <div class={`text-sm ${props.clusterTextClass}`}>
          {props.weightLabel}
        </div>
        <div class='text-nowrap text-sm text-muted-foreground'>
          {props.fontName}
        </div>
      </div>
      <img
        class='block size-auto h-7 max-h-none max-w-none px-4 mix-blend-darken grayscale invert dark:mix-blend-lighten dark:invert-0'
        src={props.sampleSrc}
        alt={`Font preview for ${props.fontName}`}
        decoding='async'
      />
    </div>
  );
}
