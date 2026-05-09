import { createMemo, Show } from 'solid-js';
import { type FontItem } from '../../types/font';
import { SearchSlashIcon } from 'lucide-solid';
import { appState } from '../../store';
import { VirtualizedItems } from './virtualized-items';

export type ListSortMode = 'similarity' | 'name-asc' | 'name-desc';

interface ListProps {
  sortMode: ListSortMode;
}

export function ListContent(props: ListProps) {
  const isFiltered = createMemo(() => appState.ui.searchQuery.length > 0);

  const filteredItems = createMemo(() => {
    const data = appState.fonts.data;
    if (Object.keys(data).length === 0) return [];
    return Array.from(appState.fonts.filteredKeys)
      .map((key) => data[key])
      .filter((item): item is FontItem => !!item);
  });

  const similaritySortedItems = createMemo(() => {
    return filteredItems().toSorted((a, b) => {
      const aK = a.computed?.clustering?.k ?? -1;
      const bK = b.computed?.clustering?.k ?? -1;
      return (
        (aK < 0 ? Infinity : aK) - (bK < 0 ? Infinity : bK) ||
        a.meta.family_name.localeCompare(b.meta.family_name) ||
        a.meta.weight - b.meta.weight
      );
    });
  });

  const nameSortedItems = createMemo(() => {
    return filteredItems().toSorted(
      (a, b) =>
        a.meta.family_name.localeCompare(b.meta.family_name) ||
        a.meta.weight - b.meta.weight,
    );
  });

  const nameSortedDescendingItems = createMemo(() => {
    return filteredItems().toSorted(
      (a, b) =>
        b.meta.family_name.localeCompare(a.meta.family_name) ||
        b.meta.weight - a.meta.weight,
    );
  });

  const sortedItems = createMemo(() => {
    switch (props.sortMode) {
      case 'name-asc':
        return nameSortedItems();
      case 'name-desc':
        return nameSortedDescendingItems();
      case 'similarity':
      default:
        return similaritySortedItems();
    }
  });

  const NoResultsFound = () => (
    <div class='inset-x-0 flex h-full flex-col items-center justify-center gap-1 pb-10 text-center text-sm text-muted-foreground'>
      <SearchSlashIcon />
      No Results
    </div>
  );

  return (
    <div class='h-full flex-1 overflow-scroll py-1'>
      <Show when={filteredItems().length > 0} fallback={<NoResultsFound />}>
        <VirtualizedItems
          fontItems={sortedItems()}
          isSearchResult={isFiltered()}
        />
      </Show>
    </div>
  );
}
