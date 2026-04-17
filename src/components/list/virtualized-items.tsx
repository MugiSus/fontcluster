import { createEffect, createSignal, For } from 'solid-js';
import { createVirtualizer } from '@tanstack/solid-virtual';
import { FontMetadata } from '../../types/font';
import { appState } from '../../store';
import { ListItem } from './item';

interface VirtualizedItemsProps {
  fontMetadatas: FontMetadata[];
  isSearchResult: boolean;
}

export function VirtualizedItems(props: VirtualizedItemsProps) {
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
    const key = appState.ui.selectedFontKey;
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
            <ListItem
              metadata={metadata}
              isSearchResult={props.isSearchResult}
              size={virtualItem.size}
              start={virtualItem.start}
            />
          );
        }}
      </For>
    </ul>
  );
}
