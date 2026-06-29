import {
  createEffect,
  For,
  createSelector,
  createSignal,
  Show,
} from 'solid-js';
import { debounce } from '@solid-primitives/scheduled';
import { createVirtualizer } from '@tanstack/solid-virtual';
import { toast } from 'solid-sonner';
import { MousePointerClickIcon } from 'lucide-solid';
import { useI18n } from '@/i18n';
import { appState } from '../../store';
import {
  applyFontToPlugins,
  setHoveredFontKey,
  setListPreviewText,
} from '../../actions';
import { type FontItem } from '../../types/font';
import { getNearestSelectableFontItems } from '../graph/font-point-index';
import { ListFontItem } from './list-font-item';
import { ListPreviewTextField } from './preview-text-field';

const LIST_UPDATE_DEBOUNCE = 0;
const LIST_PREVIEW_SCROLL_DEBOUNCE = 400;
const LIST_ITEM_HEIGHT = 80;
const LIST_PREVIEW_FONT_SIZE = 64;

export function ListContent() {
  const { t } = useI18n();
  const [selectedItem, setSelectedItem] = createSignal<FontItem | null>(null);
  const [nearestItems, setNearestItems] = createSignal<FontItem[]>([]);
  const [canRenderListPreviews, setCanRenderListPreviews] = createSignal(true);
  const isSentFontItem = createSelector(() => appState.ui.sentFontItemKey);
  let nearestItemsScrollElement: HTMLDivElement | undefined;
  const virtualizer = createVirtualizer({
    get count() {
      return nearestItems().length;
    },
    getScrollElement: () => nearestItemsScrollElement ?? null,
    estimateSize: () => LIST_ITEM_HEIGHT,
    overscan: 2,
  });

  const updateSelectedItem = debounce(
    (
      selectedKey: string,
      nextSelectedItem: FontItem | null,
      filteredKeysSize: number,
    ) => {
      if (!nextSelectedItem || filteredKeysSize === 0) {
        setSelectedItem(nextSelectedItem);
        setNearestItems([]);
        return;
      }

      const items = getNearestSelectableFontItems(selectedKey);
      setSelectedItem(nextSelectedItem);
      setNearestItems(items);
      nearestItemsScrollElement?.scrollTo({ top: 0 });
    },
    LIST_UPDATE_DEBOUNCE,
  );
  const enableListPreviews = debounce(() => {
    setCanRenderListPreviews(true);
  }, LIST_PREVIEW_SCROLL_DEBOUNCE);

  createEffect(() => {
    const selectedKey = appState.ui.selectedFontKey;
    const nextSelectedItem = selectedKey
      ? appState.fonts.displayData[selectedKey] || null
      : null;
    const filteredKeys = appState.fonts.filteredKeys;

    if (!selectedKey) {
      updateSelectedItem.clear();
      setSelectedItem(null);
      setNearestItems([]);
      return;
    }

    updateSelectedItem(selectedKey, nextSelectedItem, filteredKeys.size);
  });

  const handleNearestItemsScroll = () => {
    setCanRenderListPreviews(false);
    enableListPreviews();
  };

  const handleApply = (item: FontItem) =>
    applyFontToPlugins(item)
      .then(() =>
        toast.success(t.plugins.applied({ name: item.meta.font_name })),
      )
      .catch((error) => {
        console.error('Failed to send font to plugins:', error);
        toast.error(t.plugins.applyFailed());
      });

  const NoResultsFound = () => (
    <div class='flex h-full flex-col items-center justify-center gap-2 pb-10 text-center text-sm text-muted-foreground'>
      <MousePointerClickIcon />
      <p class='text-xs'>{t.list.selectPrompt()}</p>
    </div>
  );

  return (
    <div class='flex h-full flex-1 flex-col'>
      <ListPreviewTextField
        value={appState.ui.listPreviewText}
        placeholder={appState.session.algorithm.rendering.text || 'A'}
        onValueChange={setListPreviewText}
      />
      <Show when={selectedItem()}>
        {(item) => (
          <ListFontItem
            item={item()}
            previewText={appState.ui.listPreviewText}
            previewFontSize={LIST_PREVIEW_FONT_SIZE}
            class='animate-fade-in border-b'
            isSentFontItem={isSentFontItem(item().meta.safe_name)}
            onClick={() => handleApply(item())}
            onMouseEnter={() => setHoveredFontKey(item().meta.safe_name)}
            onMouseLeave={() => setHoveredFontKey(null)}
          />
        )}
      </Show>
      <Show when={selectedItem()} fallback={<NoResultsFound />}>
        <div
          ref={nearestItemsScrollElement}
          class='min-h-0 w-full flex-1 overflow-y-scroll'
          onScroll={handleNearestItemsScroll}
        >
          <ul
            class='relative w-full'
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            <For each={virtualizer.getVirtualItems()}>
              {(virtualItem) => {
                const item = () => nearestItems()[virtualItem.index];
                return (
                  <Show when={item()}>
                    {(fontItem) => (
                      <li
                        data-font-name={fontItem().meta.safe_name}
                        class='absolute left-0 top-0 w-full'
                        style={{
                          transform: `translateY(${virtualItem.start}px)`,
                        }}
                      >
                        <ListFontItem
                          item={fontItem()}
                          previewText={appState.ui.listPreviewText}
                          previewFontSize={LIST_PREVIEW_FONT_SIZE}
                          isPreviewEnabled={canRenderListPreviews()}
                          isSentFontItem={isSentFontItem(
                            fontItem().meta.safe_name,
                          )}
                          onClick={() => handleApply(fontItem())}
                          onMouseEnter={() =>
                            setHoveredFontKey(fontItem().meta.safe_name)
                          }
                          onMouseLeave={() => setHoveredFontKey(null)}
                        />
                      </li>
                    )}
                  </Show>
                );
              }}
            </For>
          </ul>
        </div>
      </Show>
    </div>
  );
}
