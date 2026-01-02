import { For, Show } from 'solid-js';
import { convertFileSrc } from '@tauri-apps/api/core';
import { FontMetadata } from '../types/font';
import { getClusterBgColor, getClusterTextColor } from '../lib/cluster-colors';
import { SearchIcon } from 'lucide-solid';

interface FontMetadataListProps {
  fontMetadatas: FontMetadata[];
  sessionDirectory: string;
  selectedFontMetadata: FontMetadata | null;
  isSearchResult?: boolean;
  onFontClick: (fontMetadata: FontMetadata) => void;
}

export function FontMetadataList(props: FontMetadataListProps) {
  return (
    <ul class='flex flex-col items-start gap-0'>
      <For each={props.fontMetadatas}>
        {(fontMetadata: FontMetadata) => (
          <li
            class={`flex min-w-full cursor-pointer flex-col items-start gap-2 pb-4 pt-3 ${
              props.selectedFontMetadata?.safe_name ===
                fontMetadata.safe_name && 'bg-border'
            }`}
            data-font-name={fontMetadata.safe_name}
            onClick={() => props.onFontClick(fontMetadata)}
          >
            <div class='flex items-center gap-2 px-4'>
              <Show
                when={props.isSearchResult}
                fallback={
                  <div
                    class={`mb-0.5 h-3 w-1 rounded-full ${getClusterBgColor(fontMetadata.computed?.k ?? -1)}`}
                  />
                }
              >
                <SearchIcon
                  class={`mb-0.5 size-4 ${getClusterTextColor(fontMetadata.computed?.k ?? -1)}`}
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
              class={`block size-auto h-8 max-h-none max-w-none px-4 grayscale invert dark:invert-0 ${
                props.selectedFontMetadata?.safe_name ===
                  fontMetadata.safe_name &&
                'mix-blend-darken dark:mix-blend-lighten'
              }`}
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
