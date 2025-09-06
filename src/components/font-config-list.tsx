import { For } from 'solid-js';
import { convertFileSrc } from '@tauri-apps/api/core';
import { FontConfig } from '../types/font';
import { getClusterBgColor } from '../lib/cluster-colors';

interface FontConfigListProps {
  fontConfigs: FontConfig[];
  sessionDirectory: string;
  nearestFontConfig: FontConfig | null;
  onFontClick: (fontConfig: FontConfig) => void;
}

export function FontConfigList(props: FontConfigListProps) {
  return (
    <ul class='flex flex-col items-start gap-0 bg-muted/20'>
      <For each={props.fontConfigs}>
        {(fontConfig: FontConfig) => (
          <li
            class={`flex min-w-full cursor-pointer flex-col items-start gap-2 pb-4 pt-3 ${
              props.nearestFontConfig?.safe_name === fontConfig.safe_name &&
              'bg-border'
            }`}
            data-font-name={fontConfig.safe_name}
            onClick={() => props.onFontClick(fontConfig)}
          >
            <div class='flex items-center gap-2 px-4'>
              <div
                class={`mb-0.5 h-3 w-1 rounded-full ${getClusterBgColor(fontConfig.computed?.k ?? -1)}`}
              />
              <div class='text-sm font-light text-foreground'>
                {
                  ['UL', 'EL', 'L', 'R', 'M', 'DB', 'B', 'EB', 'UB'][
                    Math.trunc(fontConfig.weight / 100) - 1
                  ]
                }
              </div>
              <div class='text-nowrap text-sm font-light text-muted-foreground'>
                {fontConfig.font_name}
              </div>
            </div>
            <img
              class={`block size-auto h-10 max-h-none max-w-none px-4 grayscale invert dark:invert-0 ${
                props.nearestFontConfig?.safe_name === fontConfig.safe_name &&
                'mix-blend-darken dark:mix-blend-lighten'
              }`}
              src={convertFileSrc(
                `${props.sessionDirectory}/${fontConfig.safe_name}/sample.png`,
              )}
              alt={`Font preview for ${fontConfig.font_name}`}
            />
          </li>
        )}
      </For>
    </ul>
  );
}
