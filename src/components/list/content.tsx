import {
  createEffect,
  createMemo,
  For,
  createSelector,
  createSignal,
  Show,
} from 'solid-js';
import { createVirtualizer } from '@tanstack/solid-virtual';
import { toast } from 'solid-sonner';
import { SearchXIcon } from 'lucide-solid';
import { useI18n } from '@/i18n';
import { appState } from '@/store';
import {
  applyFontToPlugins,
  setHoveredFontKey,
  setListPreviewText,
} from '@/actions';
import { type FontItem } from '@/types/font';
import { ListFontItem } from './list-font-item';
import { ListPreviewTextField } from './preview-text-field';

const LIST_ITEM_HEIGHT = 80;
const LIST_PREVIEW_FONT_SIZE = 64;

export function ListContent() {
  const { t } = useI18n();
  const [canRenderListPreviews, setCanRenderListPreviews] = createSignal(true);
  const [scrollViewportHeight, setScrollViewportHeight] = createSignal(0);
  let listScrollElement: HTMLDivElement | undefined;
  const isSentFontItem = createSelector(() => appState.ui.sentFontItemKey);
  const isSelectedFontItem = createSelector(() => appState.ui.selectedFontKey);
  const orderedLeafItems = createMemo(() =>
    Object.values(appState.fonts.displayData)
      .filter(
        (item) =>
          item.computed?.clustering !== undefined &&
          item.computed.clustering !== null,
      )
      .sort(
        (left, right) =>
          left.computed!.clustering!.leaf_angle -
          right.computed!.clustering!.leaf_angle,
      ),
  );
  const filteredLeafItems = createMemo(() => {
    const filteredKeys = appState.fonts.filteredKeys;
    return orderedLeafItems().filter((item) =>
      filteredKeys.has(item.meta.safe_name),
    );
  });
  const leafIndexByKey = createMemo(
    () =>
      new Map(
        filteredLeafItems().map((item, index) => [item.meta.safe_name, index]),
      ),
  );
  const virtualizer = createVirtualizer({
    get count() {
      const itemCount = filteredLeafItems().length;
      return itemCount * LIST_ITEM_HEIGHT > scrollViewportHeight()
        ? itemCount * 3
        : itemCount;
    },
    getScrollElement: () => listScrollElement ?? null,
    estimateSize: () => LIST_ITEM_HEIGHT,
    overscan: 8,
    onChange: (instance, sync) => {
      const viewportHeight = instance.scrollRect?.height ?? 0;
      setScrollViewportHeight(viewportHeight);
      setCanRenderListPreviews(!sync);

      const items = filteredLeafItems();
      const itemCount = items.length;
      if (sync && viewportHeight > 0 && itemCount > 0) {
        const viewportCenter =
          (instance.scrollOffset ?? 0) + viewportHeight / 2;
        const centerVirtualItem = instance
          .getVirtualItems()
          .find(
            (virtualItem) =>
              virtualItem.start <= viewportCenter &&
              viewportCenter < virtualItem.end,
          );
        const centerItem = centerVirtualItem
          ? items[centerVirtualItem.index % itemCount]
          : undefined;
        if (centerItem) {
          setHoveredFontKey(centerItem.meta.safe_name);
        }
      }

      const cycleHeight = itemCount * LIST_ITEM_HEIGHT;
      if (sync || viewportHeight === 0 || cycleHeight <= viewportHeight) return;

      const offset = instance.scrollOffset ?? 0;
      if (offset < cycleHeight) {
        instance.scrollToOffset(offset + cycleHeight);
      } else if (offset >= cycleHeight * 2) {
        instance.scrollToOffset(offset - cycleHeight);
      }
    },
  });

  createEffect(() => {
    if (!listScrollElement) return;

    const itemCount = filteredLeafItems().length;
    const viewportHeight = scrollViewportHeight();
    if (itemCount === 0 || viewportHeight === 0) return;

    const selectedKey = appState.ui.selectedFontKey;
    const selectedIndex = selectedKey
      ? leafIndexByKey().get(selectedKey)
      : undefined;
    const isCircular = itemCount * LIST_ITEM_HEIGHT > viewportHeight;
    if (!isCircular) {
      virtualizer.scrollToIndex(selectedIndex ?? 0, {
        align: selectedIndex === undefined ? 'start' : 'center',
      });
      return;
    }

    if (selectedIndex === undefined) {
      virtualizer.scrollToIndex(itemCount, { align: 'start' });
      return;
    }

    virtualizer.scrollToIndex(itemCount + selectedIndex, { align: 'center' });
  });

  const handleApply = (item: FontItem) =>
    applyFontToPlugins(item)
      .then(() =>
        toast.success(t.plugins.toasts.applied({ name: item.meta.font_name })),
      )
      .catch((error) => {
        console.error('Failed to send font to plugins:', error);
        toast.error(t.plugins.toasts.applyFailed());
      });

  const handleCopy = (item: FontItem) =>
    navigator.clipboard
      .writeText(item.meta.font_name)
      .then(() =>
        toast.success(t.list.toasts.copied({ name: item.meta.font_name })),
      )
      .catch((error) => {
        console.error('Failed to copy font name:', error);
        toast.error(t.list.toasts.copyFailed());
      });

  // When no plugin is connected, clicking falls back to copying the font name
  // to the clipboard instead of applying it to a design tool.
  const handleSelect = (item: FontItem) =>
    appState.plugins.isConnected ? handleApply(item) : handleCopy(item);

  const NoResultsFound = () => (
    <div class='flex h-full flex-col items-center justify-center gap-2 pb-10 text-center text-sm text-muted-foreground'>
      <SearchXIcon />
      <p class='text-xs'>{t.list.noMatchingFonts()}</p>
    </div>
  );

  return (
    <div class='flex h-full flex-1 flex-col'>
      <ListPreviewTextField
        value={appState.ui.listPreviewText}
        placeholder={appState.session.algorithm.rendering.text || 'A'}
        onValueChange={setListPreviewText}
      />
      <div
        ref={listScrollElement}
        class='min-h-0 w-full flex-1 overflow-y-scroll'
      >
        <Show
          when={filteredLeafItems().length > 0}
          fallback={<NoResultsFound />}
        >
          <ul
            class='relative w-full'
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            <For each={virtualizer.getVirtualItems()}>
              {(virtualItem) => {
                const item = () => {
                  const items = filteredLeafItems();
                  return items[virtualItem.index % items.length];
                };
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
                          isSelectedFontItem={isSelectedFontItem(
                            fontItem().meta.safe_name,
                          )}
                          isSentFontItem={isSentFontItem(
                            fontItem().meta.safe_name,
                          )}
                          onClick={() => handleSelect(fontItem())}
                          onMouseEnter={() =>
                            setHoveredFontKey(fontItem().meta.safe_name)
                          }
                          onMouseLeave={() => {
                            if (
                              appState.ui.hoveredFontKey ===
                              fontItem().meta.safe_name
                            ) {
                              setHoveredFontKey(null);
                            }
                          }}
                        />
                      </li>
                    )}
                  </Show>
                );
              }}
            </For>
          </ul>
        </Show>
      </div>
    </div>
  );
}
