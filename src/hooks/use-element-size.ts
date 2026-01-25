import { createSignal, createEffect, onCleanup } from 'solid-js';

export function useElementSize<T extends Element>() {
  const [size, setSize] = createSignal({ width: 0, height: 0 });
  const [el, setEl] = createSignal<T | undefined>();

  createEffect(() => {
    const element = el();
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(element);

    const rect = element.getBoundingClientRect();
    setSize({ width: rect.width, height: rect.height });

    onCleanup(() => observer.disconnect());
  });

  return {
    ref: (node: T) => setEl(() => node),
    size,
  };
}
