import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  untrack,
  Show,
} from 'solid-js';
import { createVirtualizer } from '@tanstack/solid-virtual';
import { quadtree } from 'd3-quadtree';
import { type FontItem as FontItemData } from '../../types/font';
import { appState } from '../../store';
import { FontItem } from './font-item';

const ITEM_SIZE = 80;
const OVERSCAN = 10;

interface VirtualizedItemsProps {
  fontItems: FontItemData[];
}

interface PositionedFontItem {
  item: FontItemData;
  key: string;
  x: number;
  y: number;
}

function getPosition(item: FontItemData) {
  const position = item.computed?.positioning?.position;
  const x = position?.[0];
  const y = position?.[1];

  if (typeof x !== 'number' || typeof y !== 'number') return null;
  return { x, y };
}

function createNearestQueue(
  items: FontItemData[],
  selectedItem: FontItemData | null,
) {
  const selectedPosition = selectedItem ? getPosition(selectedItem) : null;
  if (!selectedItem || !selectedPosition) {
    return null;
  }

  const points: PositionedFontItem[] = [];
  for (const item of items) {
    const key = item.meta.safe_name;
    if (key === selectedItem.meta.safe_name) continue;

    const position = getPosition(item);
    if (!position) continue;

    points.push({
      item,
      key,
      x: position.x,
      y: position.y,
    });
  }

  const tree = quadtree<PositionedFontItem>()
    .x((point) => point.x)
    .y((point) => point.y)
    .addAll(points);

  return {
    size: points.length,
    next() {
      const nearest = tree.find(selectedPosition.x, selectedPosition.y);
      if (!nearest) return null;

      tree.remove(nearest);
      return nearest.item;
    },
  };
}

export function VirtualizedItems(props: VirtualizedItemsProps) {
  const [scrollContainerRef, setScrollContainerRef] =
    createSignal<HTMLUListElement>();
  const [scrollMetrics, setScrollMetrics] = createSignal({
    scrollTop: 0,
    clientHeight: 0,
  });
  const [isPointerDown, setIsPointerDown] = createSignal(false);
  const [revealedCount, setRevealedCount] = createSignal(0);
  let revealedItems: FontItemData[] = [];

  const selectedItem = createMemo(() => appState.ui.selectedFont);
  const nearestQueue = createMemo(() =>
    createNearestQueue(props.fontItems, selectedItem()),
  );

  const virtualizer = createVirtualizer({
    get count() {
      return nearestQueue()?.size ?? 0;
    },
    getScrollElement: () => scrollContainerRef()?.parentElement ?? null,
    estimateSize: () => ITEM_SIZE,
    overscan: OVERSCAN,
    getItemKey: (index) => revealedItems[index]?.meta.safe_name ?? index,
  });

  createEffect(() => {
    const scrollElement = scrollContainerRef()?.parentElement;
    if (!scrollElement) return;

    const updateScrollMetrics = () => {
      setScrollMetrics({
        scrollTop: scrollElement.scrollTop,
        clientHeight: scrollElement.clientHeight,
      });
    };

    updateScrollMetrics();
    scrollElement.addEventListener('scroll', updateScrollMetrics, {
      passive: true,
    });
    window.addEventListener('resize', updateScrollMetrics);
    const resizeObserver = new ResizeObserver(updateScrollMetrics);
    resizeObserver.observe(scrollElement);

    onCleanup(() => {
      scrollElement.removeEventListener('scroll', updateScrollMetrics);
      window.removeEventListener('resize', updateScrollMetrics);
      resizeObserver.disconnect();
    });
  });

  createEffect(() => {
    const handlePointerDown = () => setIsPointerDown(true);
    const handlePointerRelease = () => setIsPointerDown(false);

    window.addEventListener('pointerdown', handlePointerDown, {
      passive: true,
    });
    window.addEventListener('pointerup', handlePointerRelease, {
      passive: true,
    });
    window.addEventListener('pointercancel', handlePointerRelease, {
      passive: true,
    });
    window.addEventListener('blur', handlePointerRelease);

    onCleanup(() => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerRelease);
      window.removeEventListener('pointercancel', handlePointerRelease);
      window.removeEventListener('blur', handlePointerRelease);
    });
  });

  const requestedItemCount = createMemo(() => {
    const queue = nearestQueue();
    if (!queue) return 0;

    const { scrollTop, clientHeight } = scrollMetrics();
    if (clientHeight === 0) return Math.min(queue.size, 1);

    const visibleEndIndex = Math.ceil((scrollTop + clientHeight) / ITEM_SIZE);
    return Math.min(queue.size, Math.max(1, visibleEndIndex + OVERSCAN));
  });

  const visibleVirtualItems = createMemo(() => {
    revealedCount();
    return virtualizer.getVirtualItems();
  });

  let frameId: number | undefined;

  const cancelRevealFrame = () => {
    if (frameId === undefined) return;

    cancelAnimationFrame(frameId);
    frameId = undefined;
  };

  const scheduleRevealFrame = () => {
    if (frameId !== undefined) return;
    if (untrack(isPointerDown)) return;

    frameId = requestAnimationFrame(() => {
      frameId = undefined;
      if (isPointerDown()) return;

      const queue = nearestQueue();
      if (!queue) return;

      const currentLength = untrack(revealedCount);
      const targetCount = untrack(requestedItemCount);
      if (currentLength >= targetCount) return;

      const nextItem = queue.next();
      if (!nextItem) return;

      revealedItems[currentLength] = nextItem;
      setRevealedCount(currentLength + 1);
      scheduleRevealFrame();
    });
  };

  createEffect(() => {
    nearestQueue();
    cancelRevealFrame();
    revealedItems = [];
    setRevealedCount(0);

    const scrollElement = scrollContainerRef()?.parentElement;
    if (scrollElement) {
      scrollElement.scrollTop = 0;
      setScrollMetrics((metrics) => ({
        ...metrics,
        scrollTop: 0,
      }));
    }

    scheduleRevealFrame();
  });

  createEffect(() => {
    const targetCount = requestedItemCount();

    if (!isPointerDown() && untrack(revealedCount) < targetCount) {
      scheduleRevealFrame();
    }
  });

  onCleanup(cancelRevealFrame);

  return (
    <ul
      ref={setScrollContainerRef}
      class='relative w-full'
      style={{
        height: `${virtualizer.getTotalSize()}px`,
      }}
    >
      <For each={visibleVirtualItems()}>
        {(virtualItem) => {
          return (
            <li
              class='absolute'
              style={{
                transform: `translateY(${virtualItem.start}px)`,
                height: `${virtualItem.size}px`,
              }}
            >
              <Show when={revealedItems[virtualItem.index]}>
                {(item) => {
                  return <FontItem item={item()} />;
                }}
              </Show>
            </li>
          );
        }}
      </For>
    </ul>
  );
}
