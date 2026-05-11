import { createMemo, Show } from 'solid-js';
import { type FontItem as FontItemData } from '../../types/font';
import { SearchSlashIcon } from 'lucide-solid';
import { appState } from '../../store';
// import { FontItem } from './font-item';
import { VirtualizedItems } from './virtualized-items';

export function ListContent() {
  const filteredItems = createMemo(() => {
    const data = appState.fonts.data;
    if (Object.keys(data).length === 0) return [];
    return Array.from(appState.fonts.filteredKeys)
      .map((key) => data[key])
      .filter((item): item is FontItemData => !!item);
  });

  const NoResultsFound = () => (
    <div class='inset-x-0 flex h-full flex-col items-center justify-center gap-1 pb-10 text-center text-sm text-muted-foreground'>
      <SearchSlashIcon />
      No Results
    </div>
  );

  return (
    <div class='flex h-full flex-1 flex-col overflow-hidden'>
      <Show when={filteredItems().length > 0} fallback={<NoResultsFound />}>
        {/* <Show when={appState.ui.selectedFont}>
          {(item) => <FontItem item={item()} class='border-b' />}
        </Show> */}
        <div class='min-h-0 flex-1 overflow-scroll'>
          <VirtualizedItems fontItems={filteredItems()} />
        </div>
      </Show>
    </div>
  );
}
