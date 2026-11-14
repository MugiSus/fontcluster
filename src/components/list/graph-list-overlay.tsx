import { Show } from 'solid-js';
import { toast } from 'solid-sonner';
import { appState } from '@/store';
import { useI18n } from '@/i18n';
import { applyFontToPlugins } from '@/commands/plugins';
import {
  LIST_SCROLL_STEP_PX,
  type FontListController,
  type FontListRow,
} from './use-font-list';

/** A single input surface; all rows, samples and names are drawn in WebGL. */
export function GraphListOverlay(props: { list: FontListController }) {
  const { t } = useI18n();
  let pointerY: number | null = null;
  let pointerTravel = 0;
  const activate = (row: FontListRow) => {
    props.list.selectRow(row);
    if (appState.plugins.isConnected) {
      void applyFontToPlugins(row.item)
        .then(() =>
          toast.success(
            t.plugins.toasts.applied({ name: row.item.meta.font_name }),
          ),
        )
        .catch(() => toast.error(t.plugins.toasts.applyFailed()));
    } else {
      void navigator.clipboard
        .writeText(row.item.meta.font_name)
        .then(() =>
          toast.success(
            t.list.toasts.copied({ name: row.item.meta.font_name }),
          ),
        )
        .catch(() => toast.error(t.list.toasts.copyFailed()));
    }
  };

  return (
    <div
      class='absolute z-20'
      style={{
        left: `${props.list.bounds().x}px`,
        top: `${props.list.bounds().y}px`,
        width: `${Math.min(420, props.list.bounds().width)}px`,
      }}
      onMouseDown={(event) => event.stopPropagation()}
      onMouseMove={(event) => event.stopPropagation()}
      onMouseUp={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <div
        class='relative touch-none outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring'
        style={{ height: `${props.list.bounds().height}px` }}
        role='listbox'
        tabIndex={0}
        aria-label={`${t.panels.list()}: ${appState.ui.selectedFont?.meta.font_name ?? ''}`}
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
          pointerY = event.clientY;
          pointerTravel = 0;
          event.currentTarget.setPointerCapture(event.pointerId);
          event.currentTarget.focus();
        }}
        onPointerMove={(event) => {
          if (pointerY === null) return;
          const delta = pointerY - event.clientY;
          pointerTravel += Math.abs(delta);
          pointerY = event.clientY;
          if (pointerTravel > 4) props.list.scrollBy(delta);
        }}
        onPointerUp={(event) => {
          if (pointerY === null) return;
          pointerY = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
          if (pointerTravel > 4) return;
          const row = props.list.rowAt(
            event.clientY - event.currentTarget.getBoundingClientRect().top,
          );
          if (row) activate(row);
        }}
        onPointerCancel={() => {
          pointerY = null;
        }}
        onLostPointerCapture={() => {
          pointerY = null;
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
            if (row) activate(row);
          }
        }}
      >
        <Show when={props.list.items().length === 0}>
          <p class='pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted-foreground'>
            {t.list.noMatchingFonts()}
          </p>
        </Show>
      </div>
    </div>
  );
}
