import { createSignal } from 'solid-js';
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
  let pointerY: number | null = null;
  let pointerTravel = 0;
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

  return (
    <div
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
        const rect = event.currentTarget.getBoundingClientRect();
        const row = props.list.previewAt(
          event.clientX - rect.left,
          event.clientY -
            rect.top +
            props.list.inputBounds().y -
            props.list.bounds().y,
        );
        pressedRowId = row?.id ?? null;
        pointerY = event.clientY;
        pointerTravel = 0;
        event.currentTarget.setPointerCapture(event.pointerId);
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
        if (pointerY === null) return;
        const delta = pointerY - event.clientY;
        pointerTravel += Math.abs(delta);
        pointerY = event.clientY;
        if (pointerTravel > 4) props.list.scrollBy(delta);
      }}
      onPointerLeave={() => setPointer(null)}
      onPointerUp={(event) => {
        if (pointerY === null) return;
        const pressedId = pressedRowId;
        pointerY = null;
        pressedRowId = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
        if (pointerTravel > 4) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const row = props.list.previewAt(
          event.clientX - rect.left,
          event.clientY -
            rect.top +
            props.list.inputBounds().y -
            props.list.bounds().y,
        );
        if (row && row.id === pressedId) activate(row);
      }}
      onPointerCancel={() => {
        pointerY = null;
        pressedRowId = null;
      }}
      onLostPointerCapture={() => {
        pointerY = null;
        pressedRowId = null;
      }}
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
