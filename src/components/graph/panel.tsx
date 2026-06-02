import { createSignal } from 'solid-js';
import { GraphBottomControls } from './bottom-controls';
import { GraphContent } from './content';
import { GraphToolbar } from './toolbar';
import { CollapsiblePanelKey, PanelState } from '../../types/panels';
import { type GraphToolMode } from './types';

interface GraphPanelProps {
  panelState: PanelState;
  onReopenPanel: (panel: CollapsiblePanelKey) => void;
  isLeftInset?: boolean | undefined;
}

export function GraphPanel(props: GraphPanelProps) {
  const [toolMode, setToolMode] = createSignal<GraphToolMode>('select');

  return (
    <section class='relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background'>
      <GraphToolbar
        panelState={props.panelState}
        onReopenPanel={props.onReopenPanel}
        isLeftInset={props.isLeftInset}
      />
      <GraphContent toolMode={toolMode()} />
      <GraphBottomControls
        toolMode={toolMode()}
        onToolModeChange={setToolMode}
      />
    </section>
  );
}
