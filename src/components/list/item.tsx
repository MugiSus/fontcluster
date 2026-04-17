import { convertFileSrc } from '@tauri-apps/api/core';
import { Show, createSelector, type Accessor } from 'solid-js';
import { SearchIcon } from 'lucide-solid';
import { setSelectedFontKey } from '../../actions';
import {
  getClusterBackgroundColor,
  getClusterTextColor,
} from '../../lib/cluster-colors';
import { appState } from '../../store';
import { FontMetadata, FontWeight, WEIGHT_LABELS } from '../../types/font';

interface ListItemProps {
  metadata: Accessor<FontMetadata | undefined>;
  isSearchResult: boolean;
  size: number;
  start: number;
}

export function ListItem(props: ListItemProps) {
  const isSelected = createSelector(() => appState.ui.selectedFontKey);

  return (
    <Show when={props.metadata()}>
      {(metadata) => (
        <li
          class={`absolute left-0 top-0 flex w-full cursor-pointer flex-col items-start gap-2 pb-3.5 pt-2.5 ${
            isSelected(metadata().safe_name)
              ? 'bg-slate-200 dark:bg-zinc-800'
              : 'bg-background'
          }`}
          style={{
            height: `${props.size}px`,
            transform: `translateY(${props.start}px)`,
          }}
          data-font-name={metadata().safe_name}
          onClick={() => setSelectedFontKey(metadata().safe_name)}
        >
          <div class='flex items-center gap-2 px-4 font-semibold'>
            <Show
              when={props.isSearchResult}
              fallback={
                <div
                  class={`h-3.5 w-1 rounded-full ${getClusterBackgroundColor(metadata().computed?.k)}`}
                />
              }
            >
              <SearchIcon
                class={`mb-px size-4 ${getClusterTextColor(metadata().computed?.k)}`}
                strokeWidth={3}
              />
            </Show>
            <div class='text-sm text-foreground'>
              {
                WEIGHT_LABELS[
                  (Math.round(metadata().weight / 100) * 100) as FontWeight
                ].short
              }
            </div>
            <div class='text-nowrap text-sm text-muted-foreground'>
              {metadata().font_name}
            </div>
          </div>
          <img
            class='block size-auto h-8 max-h-none max-w-none px-4 mix-blend-darken grayscale invert dark:mix-blend-lighten dark:invert-0'
            src={convertFileSrc(
              `${appState.session.directory}/samples/${metadata().safe_name}/sample.png`,
            )}
            alt={`Font preview for ${metadata().font_name}`}
            decoding='sync'
          />
        </li>
      )}
    </Show>
  );
}
