import { convertFileSrc } from '@tauri-apps/api/core';
import {
  getClusterBackgroundColor,
  getClusterTextColor,
} from '../../lib/cluster-colors';
import { appState } from '../../store';
import {
  type FontItem as FontItemData,
  type FontWeight,
  WEIGHT_LABELS,
} from '../../types/font';
import { cn } from '../../lib/utils';

interface FontItemProps {
  item: FontItemData;
  class?: string;
}

export function FontItem(props: FontItemProps) {
  const meta = () => props.item.meta;
  const clusterId = () => props.item.computed?.clustering?.k;

  return (
    <div
      class={cn(
        'flex h-20 w-full cursor-pointer flex-col items-start gap-2 pb-3.5 pt-2.5',
        props.class,
      )}
    >
      <div class='flex items-center gap-2 px-4 font-semibold'>
        <div
          class={`h-3.5 w-1 rounded-full ${getClusterBackgroundColor(clusterId())}`}
        />
        <div class={`text-sm ${getClusterTextColor(clusterId())}`}>
          {
            WEIGHT_LABELS[(Math.round(meta().weight / 100) * 100) as FontWeight]
              .short
          }
        </div>
        <div class='text-nowrap text-sm text-muted-foreground'>
          {meta().font_name}
        </div>
      </div>
      <img
        class='block size-auto h-7 max-h-none max-w-none px-4 mix-blend-darken grayscale invert dark:mix-blend-lighten dark:invert-0'
        src={convertFileSrc(
          `${appState.session.directory}/samples/${meta().safe_name}/sample.png`,
        )}
        alt={`Font preview for ${meta().font_name}`}
        decoding='sync'
      />
    </div>
  );
}
