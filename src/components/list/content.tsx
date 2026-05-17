import { createEffect, createSignal, Index, onCleanup, Show } from 'solid-js';
import { convertFileSrc } from '@tauri-apps/api/core';
import { MousePointerClickIcon } from 'lucide-solid';
import { sendFontToFigma } from '../../lib/figma-bridge';
import { appState } from '../../store';
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
  onClick?: (() => void) | undefined;
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
      onClick={props.onClick}
    />
  );
}

export function ListContent() {
  const [selectedItem, setSelectedItem] = createSignal<FontItemData | null>(
    null,
  );
  const [nearestItems, setNearestItems] = createSignal<FontItemData[]>([]);
  let nearestItemsScrollElement: HTMLDivElement | undefined;

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
    sendFontToFigma(
      item.meta,
      appState.session.config.preview_text || '',
    ).catch((error) => {
      console.error('Failed to send font to Figma:', error);
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
      <Show when={nearestItems().length > 0} fallback={<NoResultsFound />}>
        <Show when={selectedItem()}>
          {(item) => (
            <FontItemView
              item={item()}
              class='animate-fade-in border-b'
              onClick={() => sendFontItem(item())}
            />
          )}
        </Show>
        <div
          ref={nearestItemsScrollElement}
          class='min-h-0 flex-1 overflow-scroll'
        >
          <ul class='w-full'>
            <Index each={nearestItems()}>
              {(item) => (
                <li data-font-name={item().meta.safe_name}>
                  <FontItemView
                    item={item()}
                    onClick={() => sendFontItem(item())}
                  />
                </li>
              )}
            </Index>
          </ul>
        </div>
      </Show>
    </div>
  );
}
