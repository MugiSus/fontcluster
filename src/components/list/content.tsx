import {
  createEffect,
  createSelector,
  createSignal,
  Index,
  onCleanup,
  Show,
} from 'solid-js';
import { convertFileSrc } from '@tauri-apps/api/core';
import { MousePointerClickIcon } from 'lucide-solid';
import { sendFontToPlugin } from '../../lib/plugin-bridge';
import { appState } from '../../store';
import { setHoveredFontKey, setSentFontItemKey } from '../../actions';
import {
  type FontItem as FontItemData,
  type FontWeight,
  WEIGHT_LABELS,
} from '../../types/font';
import {
  getClusterBackgroundColor,
  getClusterTextColor,
} from '../../lib/cluster-colors';
import { getNearestSelectableFontItems } from '../graph/font-point-index';
import { FontItem } from './font-item';

const LIST_UPDATE_DEBOUNCE_MS = 400;

interface FontItemViewProps {
  item: FontItemData;
  class?: string;
  isSentFontItem?: boolean | undefined;
  onClick?: (() => void) | undefined;
  onMouseEnter?: (() => void) | undefined;
  onMouseLeave?: (() => void) | undefined;
}

function FontItemView(props: FontItemViewProps) {
  const meta = () => props.item.meta;
  const clusterId = () => props.item.computed?.clustering?.k;
  const weight = () => (Math.round(meta().weight / 100) * 100) as FontWeight;

  return (
    <FontItem
      fontName={meta().font_name}
      weightLabel={WEIGHT_LABELS[weight()].short}
      clusterBackgroundClass={getClusterBackgroundColor(clusterId())}
      clusterTextClass={getClusterTextColor(clusterId())}
      sampleSrc={convertFileSrc(
        `${appState.session.directory}/samples/${meta().safe_name}/sample.png`,
      )}
      class={props.class}
      isSentFontItem={props.isSentFontItem}
      onClick={props.onClick}
      onMouseEnter={props.onMouseEnter}
      onMouseLeave={props.onMouseLeave}
    />
  );
}

export function ListContent() {
  const [selectedItem, setSelectedItem] = createSignal<FontItemData | null>(
    null,
  );
  const [nearestItems, setNearestItems] = createSignal<FontItemData[]>([]);
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

  const sendFontItem = (item: FontItemData) => {
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
      <Show when={selectedItem()}>
        {(item) => (
          <FontItemView
            item={item()}
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
                <FontItemView
                  item={item()}
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
