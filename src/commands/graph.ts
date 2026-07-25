import { batch } from 'solid-js';
import { GRAPH_MODE_CAPABILITIES } from '@/lib/graph-modes';
import { setAppState, type GraphMode } from '@/store';
import { type FontWeight } from '@/types/font';

export const setActiveGraphWeights = (weights: FontWeight[]) =>
  setAppState('ui', 'activeGraphWeights', weights);

/** Changes the graph layout and clears merge-node selection outside layouts
 * where dendrogram nodes are directly selectable. */
export const setGraphMode = (mode: GraphMode) =>
  batch(() => {
    setAppState('ui', 'graphMode', mode);
    if (!GRAPH_MODE_CAPABILITIES[mode].canSelectMergeNodes) {
      setAppState('ui', 'selectedDendrogramNode', null);
    }
  });

export const setVisibleGraphClusters = (clusterIds: number[]) =>
  setAppState('ui', 'visibleGraphClusters', clusterIds);
