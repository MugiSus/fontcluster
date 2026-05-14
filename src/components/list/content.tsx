import {
  createEffect,
  createMemo,
  createSignal,
  Index,
  onCleanup,
  Show,
} from 'solid-js';
import { convertFileSrc } from '@tauri-apps/api/core';
import { quadtree, type Quadtree } from 'd3-quadtree';
import { MousePointerClickIcon } from 'lucide-solid';
import { setSelectedFontKey } from '../../actions';
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
import { FontItem } from './font-item';

const MAX_NEAREST_ITEMS = 120;
const LIST_UPDATE_DEBOUNCE_MS = 400;

interface PositionedFontItem {
  item: FontItemData;
  key: string;
  x: number;
  y: number;
}

interface NearestItemsIndex {
  tree: Quadtree<PositionedFontItem>;
}

interface FontItemViewProps {
  item: FontItemData;
  class?: string;
}

function getFontPosition(item: FontItemData) {
  const position = item.computed?.positioning?.position;
  const x = position?.[0];
  const y = position?.[1];

  if (x == null || y == null) return null;
  return { x, y };
}

function createNearestItemsIndex(items: FontItemData[]): NearestItemsIndex {
  const points: PositionedFontItem[] = [];

  for (const item of items) {
    const position = getFontPosition(item);
    if (!position) continue;

    points.push({
      item,
      key: item.meta.safe_name,
      x: position.x,
      y: position.y,
    });
  }

  return {
    tree: quadtree<PositionedFontItem>()
      .x((point) => point.x)
      .y((point) => point.y)
      .addAll(points),
  };
}

function getNearestItems(index: NearestItemsIndex, selectedItem: FontItemData) {
  const selectedPosition = selectedItem.computed?.positioning?.position;
  const x = selectedPosition?.[0];
  const y = selectedPosition?.[1];
  if (x == null || y == null) return [];

  const searchTree = index.tree.copy();
  const nearestItems: FontItemData[] = [];
  while (nearestItems.length < MAX_NEAREST_ITEMS && searchTree.size() > 0) {
    const nearest = searchTree.find(x, y);
    if (!nearest) break;

    searchTree.remove(nearest);
    if (nearest.key !== selectedItem.meta.safe_name) {
      nearestItems.push(nearest.item);
    }
  }

  return nearestItems;
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
    />
  );
}

export function ListContent() {
  const [selectedItem, setSelectedItem] = createSignal<FontItemData | null>(
    null,
  );
  const [nearestItems, setNearestItems] = createSignal<FontItemData[]>([]);
  let nearestItemsScrollElement: HTMLDivElement | undefined;

  const filteredItems = createMemo(() => {
    const data = appState.fonts.data;
    if (Object.keys(data).length === 0) return [];
    return Array.from(appState.fonts.filteredKeys)
      .map((key) => data[key])
      .filter((item): item is FontItemData => !!item);
  });

  const nearestItemsIndex = createMemo(() =>
    createNearestItemsIndex(filteredItems()),
  );

  createEffect(() => {
    const index = nearestItemsIndex();
    const selectedKey = appState.ui.selectedFontKey;
    if (!selectedKey) {
      setSelectedItem(null);
      setNearestItems([]);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const nextSelectedItem = appState.fonts.data[selectedKey] || null;
      setSelectedItem(nextSelectedItem);
      setNearestItems(
        nextSelectedItem ? getNearestItems(index, nextSelectedItem) : [],
      );
      nearestItemsScrollElement?.scrollTo({ top: 0 });
    }, LIST_UPDATE_DEBOUNCE_MS);

    onCleanup(() => window.clearTimeout(timeoutId));
  });

  const selectFont = (key: string) => {
    if (appState.ui.selectedFontKey === key) return;
    setSelectedFontKey(key);
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
            <FontItemView item={item()} class='animate-fade-in border-b' />
          )}
        </Show>
        <div
          ref={nearestItemsScrollElement}
          class='min-h-0 flex-1 overflow-scroll'
        >
          <ul class='w-full'>
            <Index each={nearestItems()}>
              {(item) => (
                <li
                  data-font-name={item().meta.safe_name}
                  onClick={() => selectFont(item().meta.safe_name)}
                >
                  <FontItemView item={item()} />
                </li>
              )}
            </Index>
          </ul>
        </div>
      </Show>
    </div>
  );
}
