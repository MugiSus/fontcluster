import {
  type Accessor,
  batch,
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  untrack,
} from 'solid-js';
import { debounce } from '@solid-primitives/scheduled';
import { MathUtils } from 'three';
import { scaleLinear } from 'd3-scale';
import { cumsum, range } from 'd3-array';
import { appState } from '@/store';
import {
  clearDraggingFont,
  commitDraggingFont,
  setDraggingFont,
  setSelectedFontKey,
} from '@/commands/font-selection';
import { type FontItem } from '@/types/font';

export const LIST_MIN_SCALE = 0.5;
export const LIST_MAX_SCALE = 2.4;
const BASE_ROW_HEIGHT_PX = 30;
export const LIST_SCROLL_STEP_PX = BASE_ROW_HEIGHT_PX * LIST_MAX_SCALE;
// Width of the Gaussian magnification in item units (larger = broader).
const MAGNIFICATION_SIGMA_ITEMS = 2.5;
const VISIBLE_RADIUS_ITEMS = 16;
const FADE_START_ITEMS = 5;
const LENS_SAMPLE_STEP = 0.125;
const lensOffsets = range(-24, 24 + LENS_SAMPLE_STEP, LENS_SAMPLE_STEP);
// Integrate the row heights once. D3 owns the cumulative sum, interpolation
// and inverse; the same monotone geometry drives rendering and hit testing.
const lensPositions = cumsum(lensOffsets, (offset, index) =>
  index === 0
    ? 0
    : LENS_SAMPLE_STEP *
      (BASE_ROW_HEIGHT_PX * LIST_MIN_SCALE +
        BASE_ROW_HEIGHT_PX *
          (LIST_MAX_SCALE - LIST_MIN_SCALE) *
          Math.exp(
            -0.5 *
              ((offset - LENS_SAMPLE_STEP / 2) / MAGNIFICATION_SIGMA_ITEMS) **
                2,
          )),
);
const lensCenter = lensPositions[(lensOffsets.length - 1) / 2]!;
const rowPosition = scaleLinear()
  .domain(lensOffsets)
  .range(Array.from(lensPositions, (position) => position - lensCenter));
export const LIST_SAMPLE_WIDTH = 112;
export const LIST_SAMPLE_HEIGHT = 24;
export const LIST_SAMPLE_LEFT = 26;

export interface FontListRow {
  id: string;
  key: string;
  item: FontItem;
  y: number;
  top: number;
  bottom: number;
  scale: number;
  opacity: number;
}

/** UI adapter: owns only the scroll position. Font/filter/selection state
 * stays in appState and is mutated exclusively through selection commands. */
export function useFontList(props: {
  size: Accessor<{ width: number; height: number }>;
  isVisible: Accessor<boolean>;
}) {
  const bounds = createMemo(() => ({
    x: 0,
    y: 40,
    width: Math.max(0, props.size().width - 56),
    height: Math.max(0, props.size().height - 48),
  }));
  const centerY = () => Math.max(0, props.size().height / 2 - bounds().y);
  const orderedItems = createMemo(() =>
    Object.values(appState.fonts.displayData)
      .filter((item) => item.computed?.clustering != null)
      .sort(
        (a, b) =>
          a.computed!.clustering!.leaf_angle -
          b.computed!.clustering!.leaf_angle,
      ),
  );
  const items = createMemo(() => {
    const keys = appState.fonts.filteredKeys;
    return orderedItems().filter((item) => keys.has(item.meta.safe_name));
  });
  const indexByKey = createMemo(
    () => new Map(items().map((item, index) => [item.meta.safe_name, index])),
  );
  const [offset, setOffset] = createSignal(0);
  const finishScroll = debounce(() => commitDraggingFont('list'), 180);
  const isLooping = createMemo(
    () =>
      items().length >
      Math.ceil(
        rowPosition.invert(bounds().height - centerY()) -
          rowPosition.invert(-centerY()),
      ),
  );

  createEffect(
    on(
      [items, () => appState.ui.selectedFontKey, () => props.isVisible()],
      () => {
        finishScroll.clear();
        clearDraggingFont('list');
        const key = appState.ui.selectedFontKey;
        setOffset(key ? (indexByKey().get(key) ?? 0) : 0);
      },
    ),
  );
  createEffect(() => {
    if (appState.ui.draggingFontSource !== 'graph') return;
    finishScroll.clear();
    const index = indexByKey().get(appState.ui.draggingFontKey ?? '');
    if (index !== undefined) setOffset(index);
  });

  const rows = createMemo<FontListRow[]>(() => {
    if (!props.isVisible()) return [];
    const fonts = items();
    const height = bounds().height;
    if (!fonts.length || height <= 0) return [];
    const scroll = offset();
    const first = Math.max(
      Math.ceil(scroll - VISIBLE_RADIUS_ITEMS),
      Math.floor(scroll + rowPosition.invert(-centerY())) - 1,
    );
    const last = Math.min(
      Math.floor(scroll + VISIBLE_RADIUS_ITEMS),
      Math.ceil(scroll + rowPosition.invert(height - centerY())) + 1,
    );
    const result: FontListRow[] = [];
    for (let index = first; index <= last; index++) {
      if (!isLooping() && (index < 0 || index >= fonts.length)) continue;
      const item = fonts[MathUtils.euclideanModulo(index, fonts.length)]!;
      const distance = index - scroll;
      const top = centerY() + rowPosition(distance - 0.5);
      const bottom = centerY() + rowPosition(distance + 0.5);
      const scale = (bottom - top) / BASE_ROW_HEIGHT_PX;
      result.push({
        id: `${index}:${item.meta.safe_name}`,
        key: item.meta.safe_name,
        item,
        y: (top + bottom) / 2,
        top,
        bottom,
        scale,
        opacity:
          1 -
          MathUtils.smoothstep(
            Math.abs(distance),
            FADE_START_ITEMS,
            VISIBLE_RADIUS_ITEMS,
          ),
      });
    }
    return result;
  });

  const scrollBy = (delta: number) => {
    const fonts = items();
    if (!fonts.length) return;
    batch(() => {
      setOffset((current) =>
        isLooping()
          ? MathUtils.euclideanModulo(
              current + delta / LIST_SCROLL_STEP_PX,
              fonts.length,
            )
          : MathUtils.clamp(
              current + delta / LIST_SCROLL_STEP_PX,
              0,
              fonts.length - 1,
            ),
      );
      const index = MathUtils.euclideanModulo(
        Math.round(offset()),
        fonts.length,
      );
      setDraggingFont('list', fonts[index]!.meta.safe_name);
    });
    finishScroll();
  };

  const rowAt = (y: number) =>
    rows().find((row) => row.opacity > 0 && y >= row.top && y < row.bottom);
  const selectRow = (row: FontListRow) => {
    finishScroll.clear();
    setSelectedFontKey(row.key);
  };
  onCleanup(() => {
    finishScroll.clear();
    untrack(() => clearDraggingFont('list'));
  });

  return {
    bounds,
    centerY,
    rows,
    items,
    scrollBy,
    rowAt,
    selectRow,
  };
}

export type FontListController = ReturnType<typeof useFontList>;
