import { batch } from 'solid-js';
import { reconcile } from 'solid-js/store';
import { GRAPH_MODE_CAPABILITIES } from '@/lib/graph-modes';
import { selectionHistory } from '@/selection-history';
import { setAppState, type GraphMode } from '@/store';
import { type FontItemRecord, type FontWeight } from '@/types/font';
import { type DendrogramData, type SessionConfig } from '@/types/session';

export interface GraphSessionPayload {
  config: SessionConfig;
  directory: string;
  fonts: FontItemRecord;
  dendrogram: DendrogramData | null;
}

/**
 * Publishes one complete session payload to the application store. The caller
 * owns how the payload was obtained (Tauri command or browser document), while
 * this action remains the only writer of the graph's session data.
 */
export const setGraphSessionPayload = (payload: GraphSessionPayload) => {
  batch(() => {
    setAppState('session', {
      ...payload.config,
      status: {
        ...payload.config.status,
        samples_amount: Object.keys(payload.fonts).length,
      },
    });
    setAppState('sessionDirectory', payload.directory);
    setAppState('dendrogram', payload.dendrogram);
    setAppState('fonts', 'data', reconcile(payload.fonts));
  });
};

export const setSelectedFontKey = (key: string | null) => {
  batch(() => {
    setAppState('ui', 'selectedFontKey', key);
    // A plain font selection supersedes any merge-node sample selection.
    setAppState('ui', 'selectedDendrogramNode', null);
  });
  selectionHistory.commitDebounced();
};

/**
 * Selects a dendrogram merge node's exemplar sample: the represented font
 * becomes the selected font, and the node index drives the dendrogram's
 * subtree highlight until a plain selection replaces it.
 */
export const setSelectedDendrogramNodeSample = (
  nodeIndex: number,
  key: string,
) => {
  batch(() => {
    setAppState('ui', 'selectedFontKey', key);
    setAppState('ui', 'selectedDendrogramNode', nodeIndex);
  });
  selectionHistory.commitDebounced();
};

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
