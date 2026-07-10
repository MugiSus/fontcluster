import { createMemo } from 'solid-js';
import { convertFileSrc } from '@tauri-apps/api/core';
import { type FontItem } from '@/types/font';
import { useI18n } from '@/i18n';
import { appState } from '@/store';
import { cn } from '@/lib/utils';
import { getClusterBackgroundColor } from '@/lib/cluster-colors';

interface ListFontSampleImageProps {
  item: FontItem;
}

/**
 * Large square view of the font's pre-rendered `sample.png`. Fed the live
 * dragging selection, so it must stay a plain file-backed image swap — no
 * per-update backend renders — to keep up with mouse-move frequency.
 */
export function ListFontSampleImage(props: ListFontSampleImageProps) {
  const { t } = useI18n();
  const src = createMemo(() =>
    convertFileSrc(
      `${appState.sessionDirectory}/samples/${props.item.meta.safe_name}/sample.png`,
    ),
  );

  return (
    // The img must stay out of flow: an in-flow replaced element feeds its
    // intrinsic size into the flex item's height and breaks the square.
    <div class='relative aspect-square w-full shrink-0 border-b'>
      <img
        class='absolute inset-0 size-full object-contain p-20 mix-blend-darken grayscale invert dark:mix-blend-lighten dark:invert-0'
        src={src()}
        alt={t.list.fontPreviewAlt({ name: props.item.meta.font_name })}
        decoding='async'
      />
      <div class='absolute left-0 top-0 flex items-center gap-2'>
        <div
          class={cn(
            'flex size-8 items-center justify-center font-extrabold text-background',
            getClusterBackgroundColor(
              props.item.computed?.clustering?.color_index,
            ),
          )}
        >
          {props.item.computed?.clustering?.k}
        </div>
        <div class='text-sm font-semibold text-muted-foreground'>
          {props.item.meta.font_name}
        </div>
      </div>
    </div>
  );
}
