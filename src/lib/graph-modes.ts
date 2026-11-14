import { type GraphMode } from '@/types/graph';

interface GraphModeCapabilities {
  source: 'dendrogram' | 'scatter';
  canSelectMergeNodes: boolean;
}

export const GRAPH_MODE_ORDER: readonly GraphMode[] = [
  'scatter-plot',
  'radial-tree',
  'horizontal-tree',
];

export const GRAPH_MODE_CAPABILITIES: Record<GraphMode, GraphModeCapabilities> =
  {
    'radial-tree': {
      source: 'dendrogram',
      canSelectMergeNodes: true,
    },
    'horizontal-tree': {
      source: 'dendrogram',
      canSelectMergeNodes: true,
    },
    'scatter-plot': {
      source: 'scatter',
      canSelectMergeNodes: false,
    },
  };

export function availableGraphModes(
  hasDendrogram: boolean,
  hasScatter: boolean,
): GraphMode[] {
  return GRAPH_MODE_ORDER.filter((mode) =>
    GRAPH_MODE_CAPABILITIES[mode].source === 'dendrogram'
      ? hasDendrogram
      : hasScatter,
  );
}
