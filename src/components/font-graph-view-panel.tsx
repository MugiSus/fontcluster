import { ClusterVisualizer } from './cluster-visualizer';
import { GraphToolbar } from './graph-toolbar';
import { CollapsiblePanelKey, PanelState } from '../types/panels';

interface FontGraphViewPanelProps {
  panelState: PanelState;
  onReopenPanel: (panel: CollapsiblePanelKey) => void;
  isLeftInset?: boolean | undefined;
}

export function FontGraphViewPanel(props: FontGraphViewPanelProps) {
  return (
    <section class='relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background'>
      <GraphToolbar
        panelState={props.panelState}
        onReopenPanel={props.onReopenPanel}
        isLeftInset={props.isLeftInset}
      />
      <div class='min-h-0 flex-1 overflow-hidden'>
        <ClusterVisualizer />
      </div>
    </section>
  );
}
