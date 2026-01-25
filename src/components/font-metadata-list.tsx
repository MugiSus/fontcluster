import {
  createEffect,
  createSelector,
  createSignal,
  For,
  Show,
} from 'solid-js';
import { createVirtualizer } from '@tanstack/solid-virtual';
import { convertFileSrc } from '@tauri-apps/api/core';
import { FontMetadata, FontWeight, WEIGHT_LABELS } from '../types/font';
import {
  getClusterBackgroundColor,
  getClusterTextColor,
} from '../lib/cluster-colors';
import { SearchIcon } from 'lucide-solid';

interface FontMetadataListProps {
  fontMetadatas: FontMetadata[];
  sessionDirectory: string;
  selectedFontKey: string | null;
  isSearchResult?: boolean;
  onFontSelect: (key: string) => void;
}

export function FontMetadataList(props: FontMetadataListProps) {
  const isSelected = createSelector(() => props.selectedFontKey);
  const [scrollContainerRef, setScrollContainerRef] =
    createSignal<HTMLUListElement>();

  const virtualizer = createVirtualizer({
    get count() {
      return props.fontMetadatas.length;
    },
    getScrollElement: () => scrollContainerRef()?.parentElement ?? null,
    estimateSize: () => 84,
    overscan: 20,
    getItemKey: (index) => props.fontMetadatas[index]?.safe_name ?? index,
  });

  createEffect(() => {
    const key = props.selectedFontKey;
    if (key) {
      const index = props.fontMetadatas.findIndex((m) => m.safe_name === key);
      if (index !== -1) {
        virtualizer.scrollToIndex(index, {
          align: 'center',
          behavior: 'auto',
        });
      }
    }
  });

  return (
    <ul
      ref={setScrollContainerRef}
      class='relative w-full'
      style={{
        height: `${virtualizer.getTotalSize()}px`,
      }}
    >
      <For each={virtualizer.getVirtualItems()}>
        {(virtualItem) => {
          const metadata = props.fontMetadatas[virtualItem.index];
          if (!metadata) return null;

          return (
            <li
              class={`absolute left-0 top-0 flex w-full cursor-pointer flex-col items-start gap-2 pb-3.5 pt-2.5 ${
                isSelected(metadata.safe_name)
                  ? 'bg-slate-300 dark:bg-zinc-700'
                  : 'bg-slate-100 dark:bg-zinc-900'
              }`}
              style={{
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
              data-font-name={metadata.safe_name}
              onClick={() => props.onFontSelect(metadata.safe_name)}
            >
              <div class='flex items-center gap-2 px-4'>
                <Show
                  when={props.isSearchResult}
                  fallback={
                    <div
                      class={`mb-0.5 h-3.5 w-1 rounded-full ${getClusterBackgroundColor(metadata.computed?.k)}`}
                    />
                  }
                >
                  <SearchIcon
                    class={`mb-0.5 size-4 ${getClusterTextColor(metadata.computed?.k)}`}
                  />
                </Show>
                <div class='text-sm font-light text-foreground'>
                  {
                    WEIGHT_LABELS[
                      (Math.round(metadata.weight / 100) * 100) as FontWeight
                    ].short
                  }
                </div>
                <div class='text-nowrap text-sm font-light text-muted-foreground'>
                  {metadata.font_name}
                </div>
              </div>
              <img
                class='block size-auto h-8 max-h-none max-w-none px-4 mix-blend-darken grayscale invert dark:mix-blend-lighten dark:invert-0'
                src={convertFileSrc(
                  `${props.sessionDirectory}/samples/${metadata.safe_name}/sample.png`,
                )}
                alt={`Font preview for ${metadata.font_name}`}
                decoding='sync'
              />
            </li>
          );
        }}
      </For>
    </ul>
  );
}
