import { ClusterVisualizer } from './cluster-visualizer';
import { type CollapsiblePanelKey, GraphToolbar } from './graph-toolbar';

interface FontGraphViewPanelProps {
  collapsedPanels: Array<{
    key: CollapsiblePanelKey;
    label: string;
  }>;
  onReopenPanel: (panel: CollapsiblePanelKey) => void;
}

export function FontGraphViewPanel(props: FontGraphViewPanelProps) {
  return (
    <section class='flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[32px] border border-border/70 bg-background/90 shadow-[0_32px_100px_-60px_rgba(15,23,42,0.55)] backdrop-blur-sm'>
      <GraphToolbar
        collapsedPanels={props.collapsedPanels}
        onReopenPanel={props.onReopenPanel}
      />
      <div class='min-h-0 flex-1 overflow-hidden px-3 pb-3 pt-2'>
        <ClusterVisualizer />
      </div>
    </section>
  );
}
