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
import { createStore } from 'solid-js/store';
import { debounce } from '@solid-primitives/scheduled';
import { animate, type AnimationPlaybackControls } from 'motion';
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

export const LIST_MIN_SCALE = 0.6;
export const LIST_MAX_SCALE = 2.4;
const BASE_ROW_HEIGHT_PX = 33;
export const LIST_SCROLL_STEP_PX = BASE_ROW_HEIGHT_PX * LIST_MAX_SCALE;
// Width of the Gaussian magnification in item units (larger = broader).
const MAGNIFICATION_SIGMA_ITEMS = 2;
const VISIBLE_RADIUS_ITEMS = 20;
const FADE_ITEMS = 5;
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
    width: Math.min(400, Math.max(0, props.size().width * 0.45)),
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
  // Committing a scroll keeps the same active font, so it must not recenter
  // the fractional scroll position. Solid's memo suppresses that transition.
  const activeFontKey = createMemo(
    () => appState.ui.draggingFontKey ?? appState.ui.selectedFontKey,
  );
  const isGraphDragging = createMemo(
    () => appState.ui.draggingFontSource === 'graph',
  );
  // Measured image dimensions from the WebGL layer; copy hit testing uses
  // these same fitted boxes instead of a separate row-wide hit area.
  const [previewSizes, setPreviewSize] = createStore<
    Record<string, { width: number; height: number } | undefined>
  >({});
  const finishScroll = debounce(() => commitDraggingFont('list'), 180);
  let inertia: AnimationPlaybackControls | undefined;
  const stopInertia = () => {
    if (!inertia) return;
    inertia.stop();
    inertia = undefined;
    finishScroll();
  };
  const isLooping = createMemo(
    () =>
      items().length >
      Math.min(
        VISIBLE_RADIUS_ITEMS * 2,
        Math.ceil(
          rowPosition.invert(bounds().height - centerY()) -
            rowPosition.invert(-centerY()),
        ),
      ),
  );

  createEffect(
    on([items, () => props.isVisible()], () => {
      stopInertia();
      finishScroll.clear();
      clearDraggingFont('list');
      const key = appState.ui.selectedFontKey;
      setOffset(key ? (indexByKey().get(key) ?? 0) : 0);
    }),
  );
  createEffect(
    on([activeFontKey, isGraphDragging], ([key]) => {
      if (appState.ui.draggingFontSource === 'list') return;
      stopInertia();
      finishScroll.clear();
      setOffset(key ? (indexByKey().get(key) ?? 0) : 0);
    }),
  );

  const rows = createMemo<FontListRow[]>(() => {
    if (!props.isVisible()) return [];
    const fonts = items();
    const height = bounds().height;
    if (!fonts.length || height <= 0) return [];
    const scroll = offset();
    // Fade before the viewport clips a row. Keep at most 20 rows per side,
    // with the outer five fading even when the window cannot fit all 20.
    const topRadius = Math.min(
      VISIBLE_RADIUS_ITEMS,
      Math.max(0, -rowPosition.invert(-centerY()) - 0.5),
    );
    const bottomRadius = Math.min(
      VISIBLE_RADIUS_ITEMS,
      Math.max(0, rowPosition.invert(height - centerY()) - 0.5),
    );
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
      // Keep the extra magnification at 1.2 within a quarter row of the center,
      // then ease back to 1 at half a row's distance.
      const scale =
        ((bottom - top) / BASE_ROW_HEIGHT_PX) *
        (1 + 0.2 * (1 - MathUtils.smoothstep(Math.abs(distance), 0.25, 0.5)));
      const fadeEnd = distance < 0 ? topRadius : bottomRadius;
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
            Math.max(0, fadeEnd - FADE_ITEMS),
            fadeEnd,
          ),
      });
    }
    return result;
  });

  const inputBounds = createMemo(() => {
    const viewport = bounds();
    const visible = rows().filter((row) => row.opacity > 0);
    const top = Math.max(0, visible[0]?.top ?? 0);
    const bottom = Math.min(viewport.height, visible.at(-1)?.bottom ?? top);
    return {
      x: viewport.x,
      y: viewport.y + top,
      width: viewport.width,
      height: Math.max(0, bottom - top),
    };
  });

  const moveScroll = (delta: number) => {
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
  };

  const scrollBy = (delta: number) => {
    stopInertia();
    moveScroll(delta);
    finishScroll();
  };

  // Velocity arrives in CSS pixels/second. Motion owns decay and frame
  // scheduling; offset remains the only authoritative list position.
  const startInertia = (velocity: number) => {
    stopInertia();
    if (!props.isVisible() || !items().length || Math.abs(velocity) < 20)
      return;
    finishScroll.clear();
    const start = offset() * LIST_SCROLL_STEP_PX;
    const end = (items().length - 1) * LIST_SCROLL_STEP_PX;
    const shouldLoop = isLooping();
    const timeConstant = 200;
    // Match travel to decay time to preserve the release velocity.
    const power = timeConstant / 1000;
    let previous = 0;
    // A distinct destination prevents Motion's equal-keyframe shortcut.
    inertia = animate(0, power * velocity, {
      type: 'inertia',
      velocity,
      power,
      timeConstant,
      restDelta: 0.5,
      modifyTarget: (target) =>
        shouldLoop ? target : MathUtils.clamp(target, -start, end - start),
      onUpdate: (distance) => {
        moveScroll(distance - previous);
        previous = distance;
      },
      onComplete: () => {
        inertia = undefined;
        finishScroll();
      },
    });
  };

  const rowAt = (y: number) =>
    rows().find((row) => row.opacity > 0 && y >= row.top && y < row.bottom);
  const previewAt = (x: number, y: number) =>
    rows().find((row) => {
      const size = previewSizes[row.id];
      return (
        size &&
        row.opacity > 0 &&
        x >= LIST_SAMPLE_LEFT &&
        x < LIST_SAMPLE_LEFT + size.width &&
        y >= row.y - size.height / 2 &&
        y < row.y + size.height / 2
      );
    });
  const selectRow = (row: FontListRow) => {
    stopInertia();
    finishScroll.clear();
    setSelectedFontKey(row.key);
    setOffset(indexByKey().get(row.key) ?? 0);
  };
  onCleanup(() => {
    stopInertia();
    finishScroll.clear();
    untrack(() => clearDraggingFont('list'));
  });

  return {
    bounds,
    inputBounds,
    previewSizes,
    setPreviewSize,
    previewAt,
    centerY,
    rows,
    items,
    scrollBy,
    startInertia,
    stopInertia,
    rowAt,
    selectRow,
  };
}

export type FontListController = ReturnType<typeof useFontList>;
