import { createSignal, onMount, onCleanup } from 'solid-js';

export function useElementSize<T extends Element>() {
  const [size, setSize] = createSignal({ width: 0, height: 0 });
  let elRef: T | undefined;

  onMount(() => {
    if (!elRef) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(elRef);

    const rect = elRef.getBoundingClientRect();
    setSize({ width: rect.width, height: rect.height });

    onCleanup(() => observer.disconnect());
  });

  return {
    ref: (el: T) => {
      elRef = el;
    },
    size,
  };
}
