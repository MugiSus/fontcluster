import { createMemo, Index, Show } from 'solid-js';
import { convertFileSrc } from '@tauri-apps/api/core';
import { quadtree } from 'd3-quadtree';
import { SearchSlashIcon } from 'lucide-solid';
import { setSelectedFontKey } from '../../actions';
import { appState } from '../../store';
import { type FontItem as FontItemData } from '../../types/font';
import { FontItem } from './font-item';

const MAX_NEAREST_ITEMS = 80;

interface PositionedFontItem {
  item: FontItemData;
  key: string;
  x: number;
  y: number;
}

interface FontItemViewProps {
  item: FontItemData;
  class?: string;
}

function getPosition(item: FontItemData) {
  const position = item.computed?.positioning?.position;
  const x = position?.[0];
  const y = position?.[1];

  if (typeof x !== 'number' || typeof y !== 'number') return null;
  return { x, y };
}

function getNearestItems(items: FontItemData[], selectedItem: FontItemData) {
  const selectedPosition = getPosition(selectedItem);
  if (!selectedPosition) return [];

  const points: PositionedFontItem[] = [];
  for (const item of items) {
    const key = item.meta.safe_name;
    if (key === selectedItem.meta.safe_name) continue;

    const position = getPosition(item);
    if (!position) continue;

    points.push({
      item,
      key,
      x: position.x,
      y: position.y,
    });
  }

  const tree = quadtree<PositionedFontItem>()
    .x((point) => point.x)
    .y((point) => point.y)
    .addAll(points);

  const nearestItems: FontItemData[] = [];
  while (nearestItems.length < MAX_NEAREST_ITEMS) {
    const nearest = tree.find(selectedPosition.x, selectedPosition.y);
    if (!nearest) break;

    tree.remove(nearest);
    nearestItems.push(nearest.item);
  }

  return nearestItems;
}

function FontItemView(props: FontItemViewProps) {
  const meta = () => props.item.meta;

  return (
    <FontItem
      safeName={meta().safe_name}
      fontName={meta().font_name}
      weight={meta().weight}
      clusterId={props.item.computed?.clustering?.k}
      sampleSrc={convertFileSrc(
        `${appState.session.directory}/samples/${meta().safe_name}/sample.png`,
      )}
      class={props.class}
    />
  );
}

export function ListContent() {
  const filteredItems = createMemo(() => {
    const data = appState.fonts.data;
    if (Object.keys(data).length === 0) return [];
    return Array.from(appState.fonts.filteredKeys)
      .map((key) => data[key])
      .filter((item): item is FontItemData => !!item);
  });

  const nearestItems = createMemo(() => {
    const selectedItem = appState.ui.selectedFont;
    if (!selectedItem) return [];

    return getNearestItems(filteredItems(), selectedItem);
  });

  const selectFont = (key: string) => {
    if (appState.ui.selectedFontKey === key) return;
    setSelectedFontKey(key);
  };

  const NoResultsFound = () => (
    <div class='inset-x-0 flex h-full flex-col items-center justify-center gap-1 pb-10 text-center text-sm text-muted-foreground'>
      <SearchSlashIcon />
      No Results
    </div>
  );

  return (
    <div class='flex h-full flex-1 flex-col overflow-hidden'>
      <Show when={filteredItems().length > 0} fallback={<NoResultsFound />}>
        <Show when={appState.ui.selectedFont}>
          {(item) => <FontItemView item={item()} class='border-b' />}
        </Show>
        {/* <div class='min-h-0 flex-1 overflow-scroll'>
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
        </div> */}
      </Show>
    </div>
  );
}
