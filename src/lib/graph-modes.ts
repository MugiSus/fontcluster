import { type GraphMode } from '@/types/graph';

interface GraphModeCapabilities {
  source: 'dendrogram' | 'scatter';
  showPointCore: boolean;
  canSelectMergeNodes: boolean;
  canShowTreemapBoundaries: boolean;
}

export const GRAPH_MODE_ORDER: readonly GraphMode[] = [
  'radial-tree',
  'horizontal-tree',
  'rectangular-treemap',
  'voronoi-treemap',
  'scatter-plot',
];

export const GRAPH_MODE_CAPABILITIES: Record<GraphMode, GraphModeCapabilities> =
  {
    'radial-tree': {
      source: 'dendrogram',
      showPointCore: true,
      canSelectMergeNodes: true,
      canShowTreemapBoundaries: false,
    },
    'horizontal-tree': {
      source: 'dendrogram',
      showPointCore: true,
      canSelectMergeNodes: true,
      canShowTreemapBoundaries: false,
    },
    'rectangular-treemap': {
      source: 'dendrogram',
      showPointCore: false,
      canSelectMergeNodes: false,
      canShowTreemapBoundaries: true,
    },
    'voronoi-treemap': {
      source: 'dendrogram',
      showPointCore: false,
      canSelectMergeNodes: false,
      canShowTreemapBoundaries: true,
    },
    'scatter-plot': {
      source: 'scatter',
      showPointCore: true,
      canSelectMergeNodes: false,
      canShowTreemapBoundaries: false,
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
