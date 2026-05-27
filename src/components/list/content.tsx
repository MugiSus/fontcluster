import {
  createEffect,
  createSelector,
  createSignal,
  Index,
  onCleanup,
  Show,
} from 'solid-js';
import { MousePointerClickIcon } from 'lucide-solid';
import { sendFontToPlugin } from '../../lib/plugin-bridge';
import { appState } from '../../store';
import {
  setHoveredFontKey,
  setListPreviewText,
  setSentFontItemKey,
} from '../../actions';
import { type FontItem } from '../../types/font';
import { getNearestSelectableFontItems } from '../graph/font-point-index';
import { ListFontItem } from './list-font-item';
import { ListPreviewTextField } from './preview-text-field';

const LIST_UPDATE_DEBOUNCE_MS = 400;

export function ListContent() {
  const [selectedItem, setSelectedItem] = createSignal<FontItem | null>(null);
  const [nearestItems, setNearestItems] = createSignal<FontItem[]>([]);
  const isSentFontItem = createSelector(() => appState.ui.sentFontItemKey);
  let nearestItemsScrollElement: HTMLUListElement | undefined;

  createEffect(() => {
    const selectedKey = appState.ui.selectedFontKey;
    const nextSelectedItem = selectedKey
      ? appState.fonts.data[selectedKey] || null
      : null;
    const filteredKeys = appState.fonts.filteredKeys;

    if (!selectedKey) {
      setSelectedItem(null);
      setNearestItems([]);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      if (!nextSelectedItem || filteredKeys.size === 0) {
        setSelectedItem(nextSelectedItem);
        setNearestItems([]);
        return;
      }

      const items = getNearestSelectableFontItems(selectedKey);
      setSelectedItem(nextSelectedItem);
      setNearestItems(items);
      nearestItemsScrollElement?.scrollTo({ top: 0 });
    }, LIST_UPDATE_DEBOUNCE_MS);

    onCleanup(() => window.clearTimeout(timeoutId));
  });

  const sendFontItem = (item: FontItem) => {
    const key = item.meta.safe_name;
    sendFontToPlugin(item.meta)
      .then(() => setSentFontItemKey(key))
      .catch((error) => {
        console.error('Failed to send font to plugins:', error);
      });
  };

  const NoResultsFound = () => (
    <div class='flex h-full flex-col items-center justify-center gap-1 pb-10 text-center text-sm text-muted-foreground'>
      <MousePointerClickIcon />
      <p class='text-xs'>Select a font to see similar fonts</p>
    </div>
  );

  return (
    <div class='flex h-full flex-1 flex-col overflow-hidden'>
      <ListPreviewTextField
        value={appState.ui.listPreviewText}
        placeholder={appState.session.config.preview_text || 'A'}
        onValueChange={setListPreviewText}
      />
      <Show when={selectedItem()}>
        {(item) => (
          <ListFontItem
            item={item()}
            previewText={appState.ui.listPreviewText}
            class='animate-fade-in border-b'
            isSentFontItem={isSentFontItem(item().meta.safe_name)}
            onClick={() => sendFontItem(item())}
            onMouseEnter={() => setHoveredFontKey(item().meta.safe_name)}
            onMouseLeave={() => setHoveredFontKey(null)}
          />
        )}
      </Show>
      <Show when={selectedItem()} fallback={<NoResultsFound />}>
        <ul
          ref={nearestItemsScrollElement}
          class='min-h-0 w-full flex-1 overflow-scroll'
        >
          <Index each={nearestItems()}>
            {(item) => (
              <li data-font-name={item().meta.safe_name}>
                <ListFontItem
                  item={item()}
                  previewText={appState.ui.listPreviewText}
                  isSentFontItem={isSentFontItem(item().meta.safe_name)}
                  onClick={() => sendFontItem(item())}
                  onMouseEnter={() => setHoveredFontKey(item().meta.safe_name)}
                  onMouseLeave={() => setHoveredFontKey(null)}
                />
              </li>
            )}
          </Index>
        </ul>
      </Show>
    </div>
  );
}
