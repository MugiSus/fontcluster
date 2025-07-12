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
          const categoryBgColors = [
            'bg-blue-500', // 0: sans-serif
            'bg-red-500', // 1: serif
            'bg-yellow-500', // 2: handwriting
            'bg-purple-500', // 3: monospace
            'bg-green-500', // 4: display
          ];

          const categoryTextColors = [
            'text-blue-500', // 0: sans-serif
            'text-red-500', // 1: serif
            'text-yellow-500', // 2: handwriting
            'text-purple-500', // 3: monospace
            'text-green-500', // 4: display
          ];

          const categoryNames = [
            'Sans Serif',
            'Serif',
            'Handwriting',
            'Monospace',
            'Display',
          ];

          // Get category color (no noise handling needed for supervised learning)
          const categoryBgColor =
            categoryBgColors[vectorData.k % categoryBgColors.length];
          const categoryTextColor =
            categoryTextColors[vectorData.k % categoryTextColors.length];
          const categoryName =
            categoryNames[vectorData.k % categoryNames.length];

          return (
            <li
              class={`flex min-w-full cursor-pointer flex-col items-start gap-2 pb-4 pt-3 ${
                props.nearestFont === vectorData.config.safe_name && 'bg-border'
              }`}
              data-font-name={vectorData.config.safe_name}
              onClick={() => props.onFontClick(vectorData.config.safe_name)}
            >
              <div class='flex items-center gap-2 px-4'>
                <div class={`mb-0.5 h-3 w-1 rounded-full ${categoryBgColor}`} />
                <div class={`${categoryTextColor} text-sm font-light`}>
                  {categoryName}
                </div>
                <div class='overflow-hidden text-ellipsis text-nowrap break-all text-sm font-semibold text-muted-foreground'>
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
