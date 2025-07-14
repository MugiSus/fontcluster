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
          // Define cluster colors (same as in SVG)
          const clusterColors = [
            'text-blue-500',
            'text-red-500',
            'text-yellow-500',
            'text-green-500',
            'text-purple-500',
            'text-orange-500',
            'text-teal-500',
            'text-indigo-500',
            'text-cyan-500',
            'text-fuchsia-500',
          ];

          // Handle noise cluster (-1) with gray-400
          const clusterColor =
            vectorData.k === -1
              ? 'text-gray-400'
              : clusterColors[vectorData.k % clusterColors.length];

          return (
            <li
              class={`flex min-w-full cursor-pointer flex-col items-start gap-2 pb-4 pt-3 ${
                props.nearestFont === vectorData.config.safe_name && 'bg-border'
              }`}
              data-font-name={vectorData.config.safe_name}
              onClick={() => props.onFontClick(vectorData.config.safe_name)}
            >
              <div class='flex items-center gap-2 px-4'>
                <div
                  class={`mb-0.5 h-3 w-1 rounded-full bg-current ${clusterColor}`}
                />
                <div class={`text-sm ${clusterColor}`}>
                  {vectorData.k < 0 ? -1 : vectorData.k + 1}
                </div>
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
