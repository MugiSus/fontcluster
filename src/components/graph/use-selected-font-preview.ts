import { createMemo, createResource, type Accessor } from 'solid-js';
import { createScheduled, debounce } from '@solid-primitives/scheduled';
import { appState } from '@/store';
import { useI18n } from '@/i18n';
import { getFontDisplayName } from '@/lib/font-display-name';
import type { RenderFontPreview } from '@/types/font';

const PREVIEW_CANDIDATES = [
  ['永東国書', '調風愛機', 'あなふの', 'アタユシ'],
  ['いろはに', 'ホヘトチ', 'あなふの', 'アタユシ'],
  ['いろはに', 'ほへとち', 'りぬるを', 'あなゆし'],
  ['イロハニ', 'ホヘトチ', 'リヌルヲ', 'アナユシ'],
] as const;

/** UI-only request state; selection and rendered-image caching stay with their owners. */
export function useSelectedFontPreview(props: {
  selectedKey: Accessor<string | null>;
  renderFontPreview?: RenderFontPreview | undefined;
}) {
  const { locale } = useI18n();
  // A drag becoming a committed selection must not request the same font again.
  const selectedFont = createMemo(() => {
    const key = props.selectedKey();
    return key ? appState.fonts.displayData[key]?.meta : undefined;
  });
  const displayName = createMemo(() => {
    const font = selectedFont();
    return font ? getFontDisplayName(font, locale()) : '';
  });
  const isSettled = createScheduled((callback) => debounce(callback, 200));
  const request = createMemo(() => {
    const font = selectedFont();
    const render = props.renderFontPreview;
    // Disable the resource during the debounce so an older response cannot appear.
    return isSettled() && font ? { font, render } : undefined;
  });
  const [preview] = createResource(request, ({ font, render }) =>
    // Two source pixels per CSS pixel keep the 48px sample sharp on HiDPI displays.
    render?.(font, PREVIEW_CANDIDATES, 96),
  );

  const isDebouncing = () => selectedFont() !== undefined && !request();
  const isLoading = () => request() !== undefined && preview.loading;

  return { displayName, preview, isDebouncing, isLoading };
}
