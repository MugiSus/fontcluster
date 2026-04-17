import { createMemo, Show } from 'solid-js';
import { FontMetadata } from '../../types/font';
import { SearchSlashIcon } from 'lucide-solid';
import { appState } from '../../store';
import { VirtualizedItems } from './virtualized-items';

export type ListSortMode = 'similarity' | 'name-asc' | 'name-desc';

interface ListProps {
  sortMode: ListSortMode;
}

export function ListContent(props: ListProps) {
  const isFiltered = createMemo(() => appState.ui.searchQuery.length > 0);

  const filteredMetadatas = createMemo(() => {
    const data = appState.fonts.data;
    if (Object.keys(data).length === 0) return [];
    return Array.from(appState.fonts.filteredKeys)
      .map((key) => data[key])
      .filter((m): m is FontMetadata => !!m);
  });

  const similaritySortedMetadatas = createMemo(() => {
    return filteredMetadatas().toSorted((a, b) => {
      const aK = a.computed?.k ?? -1;
      const bK = b.computed?.k ?? -1;
      return (
        (aK < 0 ? Infinity : aK) - (bK < 0 ? Infinity : bK) ||
        a.family_name.localeCompare(b.family_name) ||
        a.weight - b.weight
      );
    });
  });

  const nameSortedMetadatas = createMemo(() => {
    return filteredMetadatas().toSorted(
      (a, b) =>
        a.family_name.localeCompare(b.family_name) || a.weight - b.weight,
    );
  });

  const nameSortedDescendingMetadatas = createMemo(() => {
    return filteredMetadatas().toSorted(
      (a, b) =>
        b.family_name.localeCompare(a.family_name) || b.weight - a.weight,
    );
  });

  const sortedMetadatas = createMemo(() => {
    switch (props.sortMode) {
      case 'name-asc':
        return nameSortedMetadatas();
      case 'name-desc':
        return nameSortedDescendingMetadatas();
      case 'similarity':
      default:
        return similaritySortedMetadatas();
    }
  });

  const NoResultsFound = () => (
    <div class='inset-x-0 flex h-full flex-col items-center justify-center gap-1 pb-10 text-center text-sm text-muted-foreground'>
      <SearchSlashIcon />
      No results found
    </div>
  );

  return (
    <div class='h-full flex-1 overflow-scroll py-1'>
      <Show when={filteredMetadatas().length > 0} fallback={<NoResultsFound />}>
        <VirtualizedItems
          fontMetadatas={sortedMetadatas()}
          isSearchResult={isFiltered()}
        />
      </Show>
    </div>
  );
}
