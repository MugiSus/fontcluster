import { ClusterVisualizer } from './cluster-visualizer';
import { type CollapsiblePanelKey, GraphToolbar } from './graph-toolbar';

interface FontGraphViewPanelProps {
  collapsedPanels: Array<{
    key: CollapsiblePanelKey;
    label: string;
  }>;
  onReopenPanel: (panel: CollapsiblePanelKey) => void;
  isLeftInset?: boolean | undefined;
}

export function FontGraphViewPanel(props: FontGraphViewPanelProps) {
  return (
    <section class='flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background'>
      <GraphToolbar
        collapsedPanels={props.collapsedPanels}
        onReopenPanel={props.onReopenPanel}
        isLeftInset={props.isLeftInset}
      />
      <div class='min-h-0 flex-1 overflow-hidden'>
        <ClusterVisualizer />
      </div>
    </section>
  );
}
