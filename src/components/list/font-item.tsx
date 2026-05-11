import {
  getClusterBackgroundColor,
  getClusterTextColor,
} from '../../lib/cluster-colors';
import { type FontWeight, WEIGHT_LABELS } from '../../types/font';
import { cn } from '../../lib/utils';

interface FontItemProps {
  safeName: string;
  fontName: string;
  weight: number;
  clusterId: number | undefined;
  sampleSrc: string;
  class?: string;
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
        <div
          class={`h-3.5 w-1 rounded-full ${getClusterBackgroundColor(props.clusterId)}`}
        />
        <div class={`text-sm ${getClusterTextColor(props.clusterId)}`}>
          {
            WEIGHT_LABELS[(Math.round(props.weight / 100) * 100) as FontWeight]
              .short
          }
        </div>
        <div class='text-nowrap text-sm text-muted-foreground'>
          {props.fontName}
        </div>
      </div>
      <img
        class='block size-auto h-7 max-h-none max-w-none px-4 mix-blend-darken grayscale invert dark:mix-blend-lighten dark:invert-0'
        src={props.sampleSrc}
        alt={`Font preview for ${props.fontName}`}
        decoding='sync'
      />
    </div>
  );
}
