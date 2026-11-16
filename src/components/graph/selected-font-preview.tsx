import { createMemo, For, Show, type Accessor } from 'solid-js';
import { LoaderIcon } from 'lucide-solid';
import { Vector2 } from 'three';
import { useElementSize } from '@/hooks/use-element-size';
import { getClusterCssColor } from '@/lib/cluster-colors';
import type { RenderFontPreview } from '@/types/font';
import { useSelectedFontPreview } from './use-selected-font-preview';
import { RING_LINE_WIDTH_PX, SELECTED_RING_RADIUS_PX } from './constants';
import type { GraphPointData, GraphViewBox } from './types';

export function SelectedFontPreview(props: {
  selectedKey: Accessor<string | null>;
  renderFontPreview: RenderFontPreview;
  viewBox: Accessor<GraphViewBox>;
  size: Accessor<{ width: number; height: number }>;
  getPointByKey: (key: string) => GraphPointData | undefined;
}) {
  const { displayName, preview, isDebouncing, isLoading } =
    useSelectedFontPreview(props);
  const { ref: setPreviewRef, size: previewSize } =
    useElementSize<HTMLDivElement>();
  const connector = createMemo(() => {
    const key = props.selectedKey();
    const point = key ? props.getPointByKey(key) : undefined;
    const { width, height } = props.size();
    const viewBox = props.viewBox();
    const contentWidth = previewSize().width;
    if (
      !point ||
      contentWidth <= 0 ||
      width <= 0 ||
      height <= 0 ||
      viewBox.width <= 0 ||
      viewBox.height <= 0
    ) {
      return null;
    }

    // Match the graph's xMidYMid meet projection and fixed CSS-pixel ring size.
    const scale = Math.min(width / viewBox.width, height / viewBox.height);
    const center = new Vector2(
      (width - viewBox.width * scale) / 2 + (point.x - viewBox.x) * scale,
      (height - viewBox.height * scale) / 2 + (point.y - viewBox.y) * scale,
    );
    const start = new Vector2(width - 48 - contentWidth - 16, height / 2);
    if (center.x > start.x) return null;
    const radius = SELECTED_RING_RADIUS_PX + RING_LINE_WIDTH_PX / 2;
    const distance = center.distanceTo(start);
    if (distance <= radius) return null;
    return {
      start,
      end: center.lerp(start, radius / distance),
      color: getClusterCssColor(point.colorAngle),
    };
  });

  return (
    <Show when={props.selectedKey() && !isDebouncing()}>
      <div
        class='pointer-events-none absolute inset-0 z-20'
        aria-busy={isLoading()}
      >
        <Show
          when={!isLoading()}
          fallback={
            <LoaderIcon
              class='absolute right-12 top-1/2 -mt-3 size-6 animate-spin text-muted-foreground'
              stroke-width={1}
              aria-hidden='true'
            />
          }
        >
          <div class='absolute inset-0'>
            <svg
              class='absolute inset-0 size-full overflow-hidden'
              aria-hidden='true'
            >
              <Show when={connector()}>
                {(line) => (
                  <line
                    x1={line().start.x}
                    y1={line().start.y}
                    x2={line().end.x}
                    y2={line().end.y}
                    stroke={line().color}
                    stroke-width={1}
                    pathLength={1}
                    stroke-dasharray='1'
                    class='animate-preview-connector'
                  />
                )}
              </Show>
            </svg>
            <div class='absolute right-12 top-1/2 flex w-48 max-w-[calc(50%-48px)] -translate-y-1/2 justify-end'>
              <Show
                when={!preview.error}
                fallback={
                  <div
                    ref={setPreviewRef}
                    class='w-max shrink-0 whitespace-nowrap text-right text-xs text-muted-foreground duration-200 animate-in fade-in-0'
                  >
                    {displayName()}
                  </div>
                }
              >
                <div
                  ref={setPreviewRef}
                  class='relative flex w-max max-w-full flex-col items-end duration-200 animate-in fade-in-0'
                >
                  <div class='absolute bottom-full right-0 mb-2 w-max whitespace-nowrap text-right text-xs text-muted-foreground'>
                    {displayName()}
                  </div>
                  <For each={preview()}>
                    {(line) => (
                      <div class='flex h-12 max-w-full items-center justify-end'>
                        <img
                          srcset={`${line.url} 2x`}
                          alt={line.text}
                          class='h-auto max-w-full invert dark:invert-0'
                          draggable={false}
                        />
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </div>
        </Show>
      </div>
    </Show>
  );
}
