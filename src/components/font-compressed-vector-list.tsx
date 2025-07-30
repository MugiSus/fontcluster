import { For } from 'solid-js';
import { convertFileSrc } from '@tauri-apps/api/core';
import { FontVectorData, FontConfig } from '../types/font';

interface FontCompressedVectorListProps {
  compressedVectors: FontVectorData[];
  sessionDirectory: string;
  nearestFontConfig: FontConfig | null;
  onFontClick: (fontConfig: FontConfig) => void;
}

export function FontCompressedVectorList(props: FontCompressedVectorListProps) {
  return (
    <ul class='flex flex-col items-start gap-0 bg-muted/20'>
      <For each={props.compressedVectors}>
        {(vectorData: FontVectorData) => {
          // Define cluster colors (same as in SVG)
          const clusterColors = [
            'bg-blue-500',
            'bg-red-500',
            'bg-yellow-500',
            'bg-green-500',
            'bg-purple-500',
            'bg-orange-500',
            'bg-teal-500',
            'bg-indigo-500',
            'bg-cyan-500',
            'bg-fuchsia-500',
          ];

          // Handle noise cluster (-1) with gray-400
          const clusterColor =
            vectorData.k === -1
              ? 'bg-gray-400'
              : clusterColors[vectorData.k % clusterColors.length];

          return (
            <li
              class={`flex min-w-full cursor-pointer flex-col items-start gap-2 pb-4 pt-3 ${
                props.nearestFontConfig?.safe_name ===
                  vectorData.config.safe_name && 'bg-border'
              }`}
              data-font-name={vectorData.config.safe_name}
              onClick={() => props.onFontClick(vectorData.config)}
            >
              <div class='flex items-center gap-2 px-4'>
                <div class={`mb-0.5 h-3 w-1 rounded-full ${clusterColor}`} />
                <div class='text-sm font-light text-foreground'>
                  {
                    ['UL', 'EL', 'L', 'R', 'M', 'DB', 'B', 'EB', 'UB'][
                      Math.trunc(vectorData.config.weight / 100) - 1
                    ]
                  }
                </div>
                <div class='text-sm font-light text-muted-foreground'>
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
