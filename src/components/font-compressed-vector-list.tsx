import { For } from 'solid-js';
import { convertFileSrc } from '@tauri-apps/api/core';
import { FontVectorData } from '../types/font';

interface FontCompressedVectorListProps {
  compressedVectors: FontVectorData[];
  sessionDirectory: string;
  nearestFont: string;
  onFontClick: (safeName: string) => void;
}

export function FontCompressedVectorList(props: FontCompressedVectorListProps) {
  return (
    <ul class='flex flex-col items-start gap-0 bg-muted/20'>
      <For each={props.compressedVectors}>
        {(vectorData: FontVectorData) => {
          // Define category colors for supervised learning
          const categoryColors = [
            'text-blue-500 bg-blue-500', // 0: sans-serif
            'text-red-500 bg-red-500', // 1: serif
            'text-yellow-500 bg-yellow-500', // 2: handwriting
            'text-purple-500 bg-purple-500', // 3: monospace
            'text-green-500 bg-green-500', // 4: display
          ];

          // Get category color (no noise handling needed for supervised learning)
          const categoryColor =
            categoryColors[vectorData.k % categoryColors.length];

          return (
            <li
              class={`flex min-w-full cursor-pointer flex-col items-start gap-2 pb-4 pt-3 ${
                props.nearestFont === vectorData.config.safe_name && 'bg-border'
              }`}
              data-font-name={vectorData.config.safe_name}
              onClick={() => props.onFontClick(vectorData.config.safe_name)}
            >
              <div class='flex items-center gap-2 px-4'>
                <div class={`mb-0.5 h-3 w-1 rounded-full ${categoryColor}`} />
                <div />
                <div class='overflow-hidden text-ellipsis text-nowrap break-all text-sm font-light text-muted-foreground'>
                  {vectorData.config.font_name}
                </div>
              </div>
              <img
                class='block size-auto h-10 max-h-none max-w-none px-4 grayscale invert dark:invert-0'
                src={convertFileSrc(
                  `${props.sessionDirectory}/${vectorData.config.safe_name}/sample.png`,
                )}
                alt={`Font preview for ${vectorData.config.font_name}`}
              />
            </li>
          );
        }}
      </For>
    </ul>
  );
}
