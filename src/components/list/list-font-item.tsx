import { createMemo, createResource } from 'solid-js';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { ArrowRightIcon, CheckIcon } from 'lucide-solid';
import {
  type FontItem,
  type FontWeight,
  WEIGHT_LABELS,
} from '../../types/font';
import { cn } from '../../lib/utils';
import {
  getClusterBackgroundColor,
  getClusterTextColor,
} from '../../lib/cluster-colors';
import { appState } from '../../store';
import { Button } from '../ui/button';

interface ListFontItemProps {
  item: FontItem;
  previewText: string;
  class?: string | undefined;
  isSentFontItem?: boolean | undefined;
  onClick?: (() => void) | undefined;
  onMouseEnter?: (() => void) | undefined;
  onMouseLeave?: (() => void) | undefined;
}

export function ListFontItem(props: ListFontItemProps) {
  const meta = () => props.item.meta;
  const clusterId = () => props.item.computed?.clustering?.k;
  const weight = () => (Math.round(meta().weight / 100) * 100) as FontWeight;

  const defaultSampleSrc = createMemo(() =>
    convertFileSrc(
      `${appState.session.directory}/samples/${meta().safe_name}/sample.png`,
    ),
  );
  const [previewPath] = createResource(
    () => {
      if (!props.previewText || !meta().path) return null;
      return {
        font: meta(),
        text: props.previewText,
      };
    },
    async (payload) => {
      if (!payload) return null;
      return await invoke<string>('render_font_preview', { payload }).catch(
        (error) => {
          console.error('Failed to render font preview:', error);
          return null;
        },
      );
    },
  );
  const sampleSrc = createMemo(() => {
    if (!props.previewText) return defaultSampleSrc();
    const path = previewPath();
    return path ? convertFileSrc(path) : defaultSampleSrc();
  });
  const weightLabel = () => WEIGHT_LABELS[weight()].short;

  return (
    <Button
      type='button'
      variant='ghost'
      class={cn(
        'group relative flex h-20 w-full flex-col items-start justify-start gap-2 rounded-none px-4 pb-3.5 pt-2.5 shadow-none hover:bg-muted',
        props.class,
      )}
      onClick={props.onClick}
      onMouseEnter={props.onMouseEnter}
      onMouseLeave={props.onMouseLeave}
      aria-label={`Apply ${meta().font_name} ${weightLabel()} to plugins`}
    >
      <div class='flex items-center gap-2 font-semibold'>
        <div
          class={`h-3.5 w-1 rounded-full ${getClusterBackgroundColor(clusterId())}`}
        />
        <div class={`text-sm ${getClusterTextColor(clusterId())}`}>
          {weightLabel()}
        </div>
        <div class='text-nowrap text-sm text-muted-foreground'>
          {meta().font_name}
        </div>
      </div>
      <img
        class={cn(
          'block size-auto h-7 max-h-none max-w-none mix-blend-darken grayscale invert dark:mix-blend-lighten dark:invert-0',
          props.previewText && !previewPath() && 'opacity-25',
        )}
        src={sampleSrc()}
        alt={`Font preview for ${meta().font_name}`}
        decoding='async'
      />
      <ArrowRightIcon
        class={cn(
          'absolute right-3 top-1/2 !size-5 -translate-y-1/2 text-muted-foreground opacity-0',
          !props.isSentFontItem && 'transition-opacity group-hover:opacity-100',
        )}
        stroke-width={1.5}
      />
      <CheckIcon
        class={cn(
          'absolute right-3 top-1/2 !size-5 -translate-y-1/2 text-muted-foreground',
          props.isSentFontItem ? 'opacity-100' : 'opacity-0 transition-opacity',
        )}
        stroke-width={1.5}
      />
    </Button>
  );
}
