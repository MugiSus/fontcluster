import { createEffect, createSignal, Index, onCleanup, Show } from 'solid-js';
import { MousePointerClickIcon } from 'lucide-solid';
import { appState } from '../../store';
import { type FontItem as FontItemData } from '../../types/font';
import { getNearestSelectableFontItems } from '../graph/font-point-index';
import { FontItem } from './font-item';

const LIST_UPDATE_DEBOUNCE_MS = 400;

export function ListContent() {
  const [selectedItem, setSelectedItem] = createSignal<FontItemData | null>(
    null,
  );
  const [nearestItems, setNearestItems] = createSignal<FontItemData[]>([]);
  let nearestItemsScrollElement: HTMLDivElement | undefined;

  createEffect(() => {
    const selectedKey = appState.ui.selectedFontKey;
    const nextSelectedItem = selectedKey
      ? appState.fonts.data[selectedKey] || null
      : null;
    const filteredKeys = appState.fonts.filteredKeys;

    if (!selectedKey) {
      setSelectedItem(null);
      setNearestItems([]);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      if (!nextSelectedItem || filteredKeys.size === 0) {
        setSelectedItem(nextSelectedItem);
        setNearestItems([]);
        return;
      }

      const items = getNearestSelectableFontItems(selectedKey);
      setSelectedItem(nextSelectedItem);
      setNearestItems(items);
      nearestItemsScrollElement?.scrollTo({ top: 0 });
    }, LIST_UPDATE_DEBOUNCE_MS);

    onCleanup(() => window.clearTimeout(timeoutId));
  });

  const NoResultsFound = () => (
    <div class='flex h-full flex-col items-center justify-center gap-1 pb-10 text-center text-sm text-muted-foreground'>
      <MousePointerClickIcon />
      <p class='text-xs'>Select a font to see similar fonts</p>
    </div>
  );

  return (
    <div class='flex h-full flex-1 flex-col overflow-hidden'>
      <Show when={nearestItems().length > 0} fallback={<NoResultsFound />}>
        <Show when={selectedItem()}>
          {(item) => <FontItem item={item()} class='border-b' isCopyable />}
        </Show>
        <div
          ref={nearestItemsScrollElement}
          class='min-h-0 flex-1 overflow-scroll'
        >
          <ul class='w-full'>
            <Index each={nearestItems()}>
              {(item) => (
                <li data-font-name={item().meta.safe_name}>
                  <FontItem item={item()} isCopyable />
                </li>
              )}
            </Index>
          </ul>
        </div>
      </Show>
    </div>
  );
}
