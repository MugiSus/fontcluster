import { CopyIcon } from 'lucide-solid';
import { convertFileSrc } from '@tauri-apps/api/core';
import { cn } from '../../lib/utils';
import { copyFontTextSvg } from '../../lib/font-svg-clipboard';
import { appState } from '../../store';
import {
  type FontItem as FontItemData,
  type FontWeight,
  WEIGHT_LABELS,
} from '../../types/font';
import {
  getClusterBackgroundColor,
  getClusterTextColor,
} from '../../lib/cluster-colors';

interface FontItemProps {
  item: FontItemData;
  isCopyable?: boolean | undefined;
  class?: string | undefined;
}

export function FontItem(props: FontItemProps) {
  const copySvgText = (event: MouseEvent) => {
    if (!props.isCopyable) return;

    event.preventDefault();
    event.stopPropagation();
    void copyFontTextSvg({
      familyName: props.item.meta.family_name,
      weight: props.item.meta.weight,
      text: appState.session.config.preview_text,
    }).catch((error) => {
      console.error('Failed to copy font text:', error);
    });
  };

  return (
    <div
      onClick={copySvgText}
      class={cn(
        'group relative flex h-20 w-full cursor-pointer flex-col items-start gap-2 pb-3.5 pt-2.5 hover:bg-muted',
        props.class,
      )}
    >
      <div class='flex items-center gap-2 px-4 font-semibold'>
        <div
          class={`h-3.5 w-1 rounded-full ${getClusterBackgroundColor(props.item.computed?.clustering?.k)}`}
        />
        <div
          class={`text-sm ${getClusterTextColor(props.item.computed?.clustering?.k)}`}
        >
          {
            WEIGHT_LABELS[
              (Math.round(props.item.meta.weight / 100) * 100) as FontWeight
            ].short
          }
        </div>
        <div class='text-nowrap text-sm text-muted-foreground'>
          {props.item.meta.font_name}
        </div>
      </div>
      <img
        class='block size-auto h-7 max-h-none max-w-none px-4 mix-blend-darken grayscale invert dark:mix-blend-lighten dark:invert-0'
        src={convertFileSrc(
          `${appState.session.directory}/samples/${props.item.meta.safe_name}/sample.png`,
        )}
        alt={`Font preview for ${props.item.meta.font_name}`}
        decoding='async'
      />
      {props.isCopyable && (
        <CopyIcon
          class='absolute right-3 top-8 hidden text-muted-foreground group-hover:block'
          size={16}
        />
      )}
    </div>
  );
}
