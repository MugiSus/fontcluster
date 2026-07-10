import { createSignal, onCleanup, Show, type JSX } from 'solid-js';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-solid';

import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

interface HorizontalScrollerProps {
  /**
   * Classes for the scroll container itself (the element that scrolls). Style
   * it exactly as you would a plain `overflow-x-auto` element, e.g. as a grid.
   */
  class?: string;
  children: JSX.Element;
}

/**
 * Horizontally scrollable region with overlaid left/right scroll buttons.
 *
 * The scroll container is exposed through `class`, so callers own its layout
 * (grid, flex, padding, …) while this component adds the affordance: each
 * button appears only when there is room to scroll that way and scrolls one
 * viewport width on click. `min-w-0` on the wrapper lets the region shrink
 * inside flex/grid parents so the inner `overflow-x-auto` actually engages.
 */
export function HorizontalScroller(props: HorizontalScrollerProps) {
  const { t } = useI18n();

  let scrollRef: HTMLDivElement | undefined;
  const [canScrollLeft, setCanScrollLeft] = createSignal(false);
  const [canScrollRight, setCanScrollRight] = createSignal(false);

  const updateAffordance = () => {
    const el = scrollRef;
    if (!el) return;
    const maxScrollLeft = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft < maxScrollLeft - 1);
  };

  // The region may mount/unmount (e.g. inside a dialog); a ResizeObserver seeds
  // the initial affordance and keeps it correct as the available width changes.
  const observe = (el: HTMLDivElement) => {
    scrollRef = el;
    updateAffordance();
    const observer = new ResizeObserver(updateAffordance);
    observer.observe(el);
    onCleanup(() => observer.disconnect());
  };

  const scrollByPage = (direction: -1 | 1) => {
    const el = scrollRef;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth, behavior: 'smooth' });
  };

  return (
    <div class='relative min-w-0'>
      <Show when={canScrollLeft()}>
        <Button
          type='button'
          variant='outline'
          size='icon'
          aria-label={t.common.scrollLeft()}
          class='absolute left-4 top-1/2 z-10 size-8 -translate-y-1/2 rounded-full bg-background shadow-sm'
          onClick={() => scrollByPage(-1)}
        >
          <ChevronLeftIcon />
        </Button>
      </Show>

      <div
        ref={observe}
        onScroll={updateAffordance}
        class={cn('overflow-x-auto', props.class)}
      >
        {props.children}
      </div>

      <Show when={canScrollRight()}>
        <Button
          type='button'
          variant='outline'
          size='icon'
          aria-label={t.common.scrollRight()}
          class='absolute right-4 top-1/2 z-10 size-8 -translate-y-1/2 rounded-full bg-background shadow-sm'
          onClick={() => scrollByPage(1)}
        >
          <ChevronRightIcon />
        </Button>
      </Show>
    </div>
  );
}
