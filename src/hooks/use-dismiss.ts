import { createEffect, createSignal, onCleanup } from 'solid-js';

interface UseDismissOptions {
  /** Listeners are only attached while this returns true. */
  enabled: () => boolean;
  /** Called on a pointer press outside the element or on the Escape key. */
  onDismiss: () => void;
  /** Targets matching this selector are treated as inside (e.g. a toggle button). */
  ignoreSelector?: string;
}

/**
 * Dismisses a floating element when the user presses outside of it or hits
 * Escape. Returns a `ref` setter to attach to the element to keep open.
 */
export function useDismiss(options: UseDismissOptions) {
  const [el, setEl] = createSignal<HTMLElement | undefined>();

  createEffect(() => {
    if (!options.enabled()) return;
    const element = el();

    const isInside = (target: EventTarget | null) => {
      const node = target as HTMLElement | null;
      if (!node) return false;
      if (element?.contains(node)) return true;
      return options.ignoreSelector
        ? !!node.closest(options.ignoreSelector)
        : false;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!isInside(event.target)) options.onDismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') options.onDismiss();
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    onCleanup(() => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    });
  });

  return (node: HTMLElement) => setEl(() => node);
}
