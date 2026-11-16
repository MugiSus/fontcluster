import { createSignal, onCleanup, onMount } from 'solid-js';
import { DragGesture } from '@use-gesture/vanilla';
import { toast } from 'solid-sonner';
import { useI18n } from '@/i18n';
import {
  LIST_SCROLL_STEP_PX,
  type FontListController,
  type FontListRow,
} from './use-font-list';

/** One fixed input surface; image hit testing only controls copy and cursor. */
export function GraphListOverlay(props: { list: FontListController }) {
  const { t } = useI18n();
  const [pointer, setPointer] = createSignal<{ x: number; y: number } | null>(
    null,
  );
  let surface!: HTMLDivElement;
  let pressedRowId: string | null = null;
  const activate = (row: FontListRow) => {
    props.list.selectRow(row);
    void navigator.clipboard
      .writeText(row.item.meta.font_name)
      .then(() =>
        toast.success(t.list.toasts.copied({ name: row.item.meta.font_name })),
      )
      .catch(() => toast.error(t.list.toasts.copyFailed()));
  };

  onMount(() => {
    const drag = new DragGesture<PointerEvent>(
      surface,
      // eslint-disable-next-line solid/reactivity -- DragGesture invokes this as an event handler.
      ({ event, delta, velocity, direction, last, tap, canceled }) => {
        if (
          canceled ||
          event.type === 'pointercancel' ||
          event.type === 'lostpointercapture'
        ) {
          pressedRowId = null;
          return;
        }
        if (tap) {
          const rect = surface.getBoundingClientRect();
          const row = props.list.previewAt(
            event.clientX - rect.left,
            event.clientY -
              rect.top +
              props.list.inputBounds().y -
              props.list.bounds().y,
          );
          if (row && row.id === pressedRowId) activate(row);
        } else {
          if (delta[1] !== 0) props.list.scrollBy(-delta[1]);
          if (last) props.list.startInertia(-velocity[1] * direction[1] * 1000);
        }
        if (last) pressedRowId = null;
      },
      {
        axis: 'y',
        filterTaps: true,
        tapsThreshold: 4,
        threshold: 4,
        pointer: { keys: false },
      },
    );
    onCleanup(() => drag.destroy());
  });

  return (
    <div
      ref={surface}
      class='absolute z-20 touch-none outline-none'
      style={{
        left: `${props.list.inputBounds().x}px`,
        top: `${props.list.inputBounds().y}px`,
        width: `${props.list.inputBounds().width}px`,
        height: `${props.list.inputBounds().height}px`,
        cursor:
          pointer() && props.list.previewAt(pointer()!.x, pointer()!.y)
            ? 'pointer'
            : 'default',
      }}
      role='listbox'
      tabIndex={0}
      aria-label={t.panels.list()}
      onMouseDown={(event) => event.stopPropagation()}
      onMouseMove={(event) => event.stopPropagation()}
      onMouseUp={(event) => event.stopPropagation()}
      onWheel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const unit =
          event.deltaMode === 1
            ? LIST_SCROLL_STEP_PX
            : event.deltaMode === 2
              ? props.list.bounds().height
              : 1;
        props.list.scrollBy(event.deltaY * unit);
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        props.list.stopInertia();
        const rect = event.currentTarget.getBoundingClientRect();
        const row = props.list.previewAt(
          event.clientX - rect.left,
          event.clientY -
            rect.top +
            props.list.inputBounds().y -
            props.list.bounds().y,
        );
        pressedRowId = row?.id ?? null;
        event.currentTarget.focus();
      }}
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setPointer({
          x: event.clientX - rect.left,
          y:
            event.clientY -
            rect.top +
            props.list.inputBounds().y -
            props.list.bounds().y,
        });
      }}
      onPointerLeave={() => setPointer(null)}
      onKeyDown={(event) => {
        if (
          event.key === 'ArrowDown' ||
          event.key === 'ArrowUp' ||
          event.key === 'PageDown' ||
          event.key === 'PageUp'
        ) {
          event.preventDefault();
          props.list.scrollBy(
            (event.key.endsWith('Down') ? 1 : -1) *
              (event.key.startsWith('Page')
                ? props.list.bounds().height
                : LIST_SCROLL_STEP_PX),
          );
        } else if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          const row = props.list.rowAt(props.list.centerY());
          if (row && props.list.previewSizes[row.id]) activate(row);
        }
      }}
    />
  );
}
