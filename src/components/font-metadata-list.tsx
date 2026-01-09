import { For, Show } from 'solid-js';
import { convertFileSrc } from '@tauri-apps/api/core';
import { FontMetadata } from '../types/font';
import {
  getClusterBackgroundColor,
  getClusterTextColor,
} from '../lib/cluster-colors';
import { SearchIcon } from 'lucide-solid';

interface FontMetadataListProps {
  fontMetadatas: FontMetadata[];
  sessionDirectory: string;
  selectedFontKey: string | null;
  isSearchResult?: boolean;
  onFontSelect: (key: string) => void;
}

export function FontMetadataList(props: FontMetadataListProps) {
  return (
    <ul class='flex w-fit min-w-full flex-col items-stretch gap-0'>
      <For each={props.fontMetadatas}>
        {(fontMetadata: FontMetadata) => (
          <li
            class={`flex w-full cursor-pointer flex-col items-start gap-2 pb-3.5 pt-2.5 ${
              props.selectedFontKey === fontMetadata.safe_name
                ? 'bg-slate-300 dark:bg-zinc-700'
                : 'bg-slate-100 dark:bg-zinc-900'
            }`}
            data-font-name={fontMetadata.safe_name}
            onClick={() => props.onFontSelect(fontMetadata.safe_name)}
          >
            <div class='flex items-center gap-2 px-4'>
              <Show
                when={props.isSearchResult}
                fallback={
                  <div
                    class={`mb-0.5 h-3.5 w-1 rounded-full ${getClusterBackgroundColor(fontMetadata.computed?.k)}`}
                  />
                }
              >
                <SearchIcon
                  class={`mb-0.5 size-4 ${getClusterTextColor(fontMetadata.computed?.k)}`}
                />
              </Show>
              <div class='text-sm font-light text-foreground'>
                {
                  ['UL', 'EL', 'L', 'R', 'M', 'DB', 'B', 'EB', 'UB'][
                    Math.trunc(fontMetadata.weight / 100) - 1
                  ]
                }
              </div>
              <div class='text-nowrap text-sm font-light text-muted-foreground'>
                {fontMetadata.font_name}
              </div>
            </div>
            <img
              class='block size-auto h-8 max-h-none max-w-none px-4 mix-blend-darken grayscale invert dark:mix-blend-lighten dark:invert-0'
              src={convertFileSrc(
                `${props.sessionDirectory}/${fontMetadata.safe_name}/sample.png`,
              )}
              alt={`Font preview for ${fontMetadata.font_name}`}
            />
          </li>
        )}
      </For>
    </ul>
  );
}
