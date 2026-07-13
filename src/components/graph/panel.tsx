import { convertFileSrc } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { applyFontToPlugins } from '@/actions';
import { appState } from '@/store';
import { GraphContent } from './content';
import { GraphPanelReopenControls } from './panel-reopen-controls';
import { GraphUtilityControls } from './utility-controls';
import { CollapsiblePanelKey, PanelState } from '@/types/panels';

interface GraphPanelProps {
  panelState: PanelState;
  onReopenPanel: (panel: CollapsiblePanelKey) => void;
  isLeftInset?: boolean | undefined;
}

export function GraphPanel(props: GraphPanelProps) {
  return (
    <section class='relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background'>
      <GraphPanelReopenControls
        panelState={props.panelState}
        onReopenPanel={props.onReopenPanel}
        isLeftInset={props.isLeftInset}
      />
      <GraphUtilityControls />
      <GraphContent
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
      />
    </section>
  );
}
