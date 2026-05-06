import { createEffect, createSignal, For } from 'solid-js';
import { createVirtualizer } from '@tanstack/solid-virtual';
import { type FontItem } from '../../types/font';
import { appState } from '../../store';
import { ListItem } from './item';

interface VirtualizedItemsProps {
  fontItems: FontItem[];
  isSearchResult: boolean;
}

export function VirtualizedItems(props: VirtualizedItemsProps) {
  const [scrollContainerRef, setScrollContainerRef] =
    createSignal<HTMLUListElement>();

  const virtualizer = createVirtualizer({
    get count() {
      return props.fontItems.length;
    },
    getScrollElement: () => scrollContainerRef()?.parentElement ?? null,
    estimateSize: () => 84,
    overscan: 20,
    getItemKey: (index) => props.fontItems[index]?.meta.safe_name ?? index,
  });

  createEffect(() => {
    const key = appState.ui.selectedFontKey;
    if (key) {
      const index = props.fontItems.findIndex(
        (item) => item.meta.safe_name === key,
      );
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
          const item = () => props.fontItems[virtualItem.index];
          if (!item()) return null;

          return (
            <ListItem
              item={item}
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
