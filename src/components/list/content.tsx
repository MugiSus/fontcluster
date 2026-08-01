import {
  createEffect,
  createMemo,
  For,
  createSelector,
  createSignal,
  on,
  onCleanup,
  Show,
  untrack,
} from 'solid-js';
import { createVirtualizer } from '@tanstack/solid-virtual';
import { toast } from 'solid-sonner';
import { SearchXIcon } from 'lucide-solid';
import { useI18n } from '@/i18n';
import { appState } from '@/store';
import {
  clearDraggingFont,
  commitDraggingFont,
  setDraggingFont,
} from '@/commands/font-selection';
import { setListPreviewText } from '@/commands/list';
import { applyFontToPlugins } from '@/commands/plugins';
import { type FontItem } from '@/types/font';
import { ListFontItem } from './list-font-item';
import { ListPreviewTextField } from './preview-text-field';

const LIST_ITEM_HEIGHT = 64;
const LIST_PREVIEW_FONT_SIZE = 64;
const DIRECT_SCROLL_INPUT_GRACE_MS = 250;
const LIST_SCROLL_END_DELAY_MS = 350;

export function ListContent() {
  const { t } = useI18n();
  const [canRenderListPreviews, setCanRenderListPreviews] = createSignal(true);
  const [scrollViewportHeight, setScrollViewportHeight] = createSignal(0);
  let listScrollElement: HTMLDivElement | undefined;
  let isDirectScrollActive = false;
  let isSelectionCausedByScroll = false;
  let hasScrollSelection = false;
  let lastDirectScrollInputAt = Number.NEGATIVE_INFINITY;
  let pendingLoopCorrectionOffset: number | null = null;
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
  const circularBufferItemCount = createMemo(() => {
    const itemCount = filteredLeafItems().length;
    const viewportHeight = scrollViewportHeight();
    if (
      itemCount === 0 ||
      viewportHeight === 0 ||
      itemCount * LIST_ITEM_HEIGHT <= viewportHeight
    ) {
      return 0;
    }

    return Math.min(
      itemCount - 1,
      Math.ceil((viewportHeight * 2) / LIST_ITEM_HEIGHT),
    );
  });
  const leafIndexByKey = createMemo(
    () =>
      new Map(
        filteredLeafItems().map((item, index) => [item.meta.safe_name, index]),
      ),
  );
  const markDirectScrollInput = () => {
    lastDirectScrollInputAt = performance.now();
  };
  const virtualizer = createVirtualizer({
    get count() {
      const itemCount = filteredLeafItems().length;
      const bufferItemCount = circularBufferItemCount();
      return bufferItemCount > 0 ? itemCount + bufferItemCount * 2 : itemCount;
    },
    getScrollElement: () => listScrollElement ?? null,
    estimateSize: () => LIST_ITEM_HEIGHT,
    overscan: 8,
    isScrollingResetDelay: LIST_SCROLL_END_DELAY_MS,
    onChange: (instance, sync) => {
      const viewportHeight = instance.scrollRect?.height ?? 0;
      setScrollViewportHeight(viewportHeight);
      setCanRenderListPreviews(!sync);

      const items = filteredLeafItems();
      const itemCount = items.length;
      const bufferItemCount = circularBufferItemCount();
      if (
        sync &&
        !isDirectScrollActive &&
        performance.now() - lastDirectScrollInputAt <=
          DIRECT_SCROLL_INPUT_GRACE_MS
      ) {
        isDirectScrollActive = true;
      }
      if (sync && isDirectScrollActive && viewportHeight > 0 && itemCount > 0) {
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
          ? items[
              (centerVirtualItem.index - bufferItemCount + itemCount) %
                itemCount
            ]
          : undefined;
        if (centerItem) {
          setDraggingFont('list', centerItem.meta.safe_name);
          hasScrollSelection = true;
        }
      }
      if (!sync && isDirectScrollActive) {
        isDirectScrollActive = false;
        lastDirectScrollInputAt = Number.NEGATIVE_INFINITY;
        if (hasScrollSelection) {
          const draggingKey = appState.ui.draggingFontKey;
          isSelectionCausedByScroll =
            draggingKey !== null && draggingKey !== appState.ui.selectedFontKey;
          commitDraggingFont('list');
          hasScrollSelection = false;
        }
      }

      const offset = instance.scrollOffset ?? 0;
      if (pendingLoopCorrectionOffset !== null) {
        const hasReachedCorrectionOffset =
          Math.abs(offset - pendingLoopCorrectionOffset) < 1;
        pendingLoopCorrectionOffset = null;
        if (hasReachedCorrectionOffset) return;
      }

      const cycleHeight = itemCount * LIST_ITEM_HEIGHT;
      const bufferHeight = bufferItemCount * LIST_ITEM_HEIGHT;
      if (
        viewportHeight === 0 ||
        cycleHeight <= viewportHeight ||
        bufferItemCount === 0
      ) {
        return;
      }

      // The loop seam is the center of item 0, not the beginning of the
      // viewport-sized margin. The margin shifts the virtual index of the
      // middle cycle, so use the same offset for every item lookup.
      const itemZeroCenterOffset =
        bufferHeight + (LIST_ITEM_HEIGHT - viewportHeight) / 2;
      const endItemZeroCenterOffset =
        cycleHeight + bufferHeight + (LIST_ITEM_HEIGHT - viewportHeight) / 2;
      const isAtStartLoop = offset < itemZeroCenterOffset;
      const isAtEndLoop = offset > endItemZeroCenterOffset;
      const shouldRecenter = sync
        ? (instance.scrollDirection === 'backward' && isAtStartLoop) ||
          (instance.scrollDirection === 'forward' && isAtEndLoop)
        : isAtStartLoop || isAtEndLoop;
      if (!shouldRecenter) return;

      const correctionOffset = isAtStartLoop
        ? offset + cycleHeight
        : offset - cycleHeight;
      pendingLoopCorrectionOffset = correctionOffset;
      instance.scrollToOffset(correctionOffset);
    },
  });

  createEffect(() => {
    if (appState.ui.draggingFontSource !== 'graph') return;

    isDirectScrollActive = false;
    hasScrollSelection = false;
    lastDirectScrollInputAt = Number.NEGATIVE_INFINITY;
  });

  onCleanup(() => {
    if (hasScrollSelection) clearDraggingFont('list');
  });

  createEffect(() => {
    if (!listScrollElement) return;

    const itemCount = filteredLeafItems().length;
    const viewportHeight = scrollViewportHeight();
    if (itemCount === 0 || viewportHeight === 0) return;

    const selectedKey = untrack(() => appState.ui.selectedFontKey);
    const selectedIndex = selectedKey
      ? leafIndexByKey().get(selectedKey)
      : undefined;
    const bufferItemCount = circularBufferItemCount();
    if (bufferItemCount === 0) {
      virtualizer.scrollToIndex(selectedIndex ?? 0, {
        align: selectedIndex === undefined ? 'start' : 'center',
      });
      return;
    }

    virtualizer.scrollToIndex(bufferItemCount + (selectedIndex ?? 0), {
      align: selectedIndex === undefined ? 'start' : 'center',
    });
  });

  createEffect(
    on(
      () => appState.ui.selectedFontKey,
      (key) => {
        if (isSelectionCausedByScroll) {
          isSelectionCausedByScroll = false;
          return;
        }
        if (!key) return;

        const selectedIndex = leafIndexByKey().get(key);
        if (selectedIndex === undefined) return;

        const bufferItemCount = circularBufferItemCount();
        virtualizer.scrollToIndex(bufferItemCount + selectedIndex, {
          align: 'center',
        });
      },
      { defer: true },
    ),
  );

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
      <div class='relative min-h-0 w-full flex-1'>
        <div
          ref={listScrollElement}
          class='size-full overflow-y-scroll'
          onWheel={markDirectScrollInput}
          onTouchMove={markDirectScrollInput}
          onPointerMove={(event) => {
            if (event.buttons !== 0) markDirectScrollInput();
          }}
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
                    const bufferItemCount = circularBufferItemCount();
                    return items[
                      (virtualItem.index - bufferItemCount + items.length) %
                        items.length
                    ];
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
        <Show when={filteredLeafItems().length > 0}>
          <div class='pointer-events-none absolute inset-x-0 top-1/2 z-10 h-16 -translate-y-1/2 border-y' />
        </Show>
      </div>
    </div>
  );
}
