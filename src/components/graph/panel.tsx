import type { JSX } from 'solid-js';
import { convertFileSrc } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { applyFontToPlugins } from '@/commands/plugins';
import { appState } from '@/store';
import { renderFontPreview } from '@/lib/font-preview';
import { GraphContent } from './content';
import { GraphUtilityControls } from './utility-controls';

interface GraphPanelProps {
  showHud: boolean;
  controlAction: (onBackdropWheel: (event: WheelEvent) => void) => JSX.Element;
}

export function GraphPanel(props: GraphPanelProps) {
  return (
    <section class='relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background'>
      <GraphContent
        showHud={props.showHud}
        controlAction={props.controlAction}
        utilityControls={<GraphUtilityControls />}
        sessionKey={appState.sessionDirectory}
        sampleImageUrl={(safeName) => {
          const directory = appState.sessionDirectory;
          return directory
            ? convertFileSrc(`${directory}/samples/${safeName}/sample.png`)
            : undefined;
        }}
        copySelectedFont={(options) => {
          void emit('copy_family_name', {
            toast: options.showToast,
            isFontName: options.isFontName,
          });
        }}
        applySelectedFont={applyFontToPlugins}
        renderFontPreview={renderFontPreview}
      />
    </section>
  );
}
