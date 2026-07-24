import { createMemo, createResource, Show } from 'solid-js';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { CheckIcon, CopyIcon, Plug2Icon } from 'lucide-solid';
import { type FontItem, type FontWeight, WEIGHT_LABELS } from '@/types/font';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { getClusteringCssColor } from '@/lib/cluster-colors';
import { appState } from '@/store';
import { Button } from '@/components/ui/button';

interface ListFontItemProps {
  item: FontItem;
  previewText: string;
  previewFontSize: number;
  isPreviewEnabled?: boolean | undefined;
  isSelectedFontItem?: boolean | undefined;
  class?: string | undefined;
  isSentFontItem?: boolean | undefined;
  onClick?: (() => void) | undefined;
  onMouseEnter?: (() => void) | undefined;
  onMouseLeave?: (() => void) | undefined;
}

export function ListFontItem(props: ListFontItemProps) {
  const { t } = useI18n();
  const meta = () => props.item.meta;
  const clustering = () => props.item.computed?.clustering;
  const clusterColor = () => getClusteringCssColor(clustering());
  const weight = () => (Math.round(meta().weight / 100) * 100) as FontWeight;
  const shouldRenderPreview = () =>
    props.isPreviewEnabled !== false && props.previewText !== '';
  const isPluginConnected = () => appState.plugins.isConnected;

  const defaultSampleSrc = createMemo(() =>
    convertFileSrc(
      `${appState.sessionDirectory}/samples/${meta().safe_name}/sample.png`,
    ),
  );
  const [previewPath] = createResource(
    () => {
      if (!shouldRenderPreview()) return null;
      return {
        font: meta(),
        text: props.previewText,
        font_size: props.previewFontSize,
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
        'group relative flex h-16 w-full min-w-0 flex-col items-start justify-center gap-1.5 overflow-hidden rounded-none p-0 pb-1 pl-5 shadow-none hover:bg-muted',
        props.isSelectedFontItem && 'bg-muted',
        props.class,
      )}
      aria-current={props.isSelectedFontItem ? 'true' : undefined}
      onClick={props.onClick}
      onMouseEnter={props.onMouseEnter}
      onMouseLeave={props.onMouseLeave}
      aria-label={
        isPluginConnected()
          ? t.list.applyToPlugins({
              name: meta().font_name,
              weight: weightLabel(),
            })
          : t.list.copyFontName({ name: meta().font_name })
      }
    >
      <div
        class='absolute bottom-0 left-px top-px z-10 w-[5px]'
        style={{ 'background-color': clusterColor() }}
      />
      {/* <div
        aria-hidden='true'
        class='pointer-events-none absolute inset-y-0 right-0 w-16 opacity-60 transition-opacity group-hover:opacity-90'
        style={{
          'background-image': `repeating-linear-gradient(-45deg, black 0 13.14px, ${clusterColor()} 13.14px 14.14px)`,
          '-webkit-mask-image': 'linear-gradient(to right, transparent, black)',
          'mask-image': 'linear-gradient(to right, transparent, black)',
        }}
      /> */}
      {/* <div
        aria-hidden='true'
        class='pointer-events-none absolute inset-y-0 left-px w-2'
        style={{
          'background-image': `repeating-linear-gradient(-45deg, black 0 2.14px, ${clusterColor()} 2.14px 3.14px)`,
        }}
      /> */}
      <div class='flex items-center gap-2 text-xs font-semibold'>
        <div style={{ 'font-weight': weight() }}>{weightLabel()}</div>
        <div class='text-nowrap text-muted-foreground'>{meta().font_name}</div>
      </div>
      <div class='w-full min-w-0 overflow-x-auto overflow-y-hidden pr-4'>
        <img
          class={cn(
            'block size-auto h-6 max-h-none max-w-none mix-blend-darken grayscale invert dark:mix-blend-lighten dark:invert-0',
            props.previewText && !previewPath() && 'opacity-25',
          )}
          src={sampleSrc()}
          alt={t.list.fontPreviewAlt({ name: meta().font_name })}
          crossorigin='anonymous'
          decoding='async'
        />
      </div>
      <Show when={!isPluginConnected()}>
        <CopyIcon
          class='absolute right-3 top-1/2 !size-4 -translate-y-1/2 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100'
          stroke-width={2}
        />
      </Show>
      <Show when={isPluginConnected()}>
        <Plug2Icon
          class={cn(
            'absolute right-3 top-1/2 !size-4 -translate-y-1/2 text-muted-foreground opacity-0 transition-opacity',
            isPluginConnected() && !props.isSentFontItem && 'opacity-100',
          )}
          stroke-width={2}
        />
        <CheckIcon
          class={cn(
            'absolute right-3 top-1/2 !size-4 -translate-y-1/2 text-muted-foreground opacity-0 transition-opacity',
            isPluginConnected() && props.isSentFontItem && 'opacity-100',
          )}
          style={{ color: clusterColor() }}
          stroke-width={2}
        />
      </Show>
    </Button>
  );
}
