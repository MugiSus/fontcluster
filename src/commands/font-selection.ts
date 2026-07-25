import { createEventBus } from '@solid-primitives/event-bus';
import { batch, createRoot } from 'solid-js';
import { selectionHistory } from '@/selection-history';
import { appState, setAppState, type DraggingFontSource } from '@/store';

/**
 * One-way UI request emitted by graph selection and consumed by the list.
 * Unlike selectedFontKey, this event is not replayed when the list mounts.
 */
const listScrollBus = createRoot(() => createEventBus<string>());

export const listenListScrollRequests = listScrollBus.listen;
export const sendListScrollRequest = listScrollBus.emit;

export const setSelectedFontKey = (key: string | null) => {
  batch(() => {
    setAppState('ui', 'selectedFontKey', key);
    // A plain font selection supersedes any merge-node sample selection.
    setAppState('ui', 'selectedDendrogramNode', null);
    setAppState('ui', 'draggingFontKey', null);
    setAppState('ui', 'draggingDendrogramNode', null);
    setAppState('ui', 'draggingFontSource', null);
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
    setAppState('ui', 'draggingFontKey', null);
    setAppState('ui', 'draggingDendrogramNode', null);
    setAppState('ui', 'draggingFontSource', null);
  });
  selectionHistory.commitDebounced();
};

export const setDraggingFont = (
  source: DraggingFontSource,
  key: string,
  dendrogramNode: number | null = null,
) =>
  batch(() => {
    setAppState('ui', 'draggingFontKey', key);
    setAppState('ui', 'draggingDendrogramNode', dendrogramNode);
    setAppState('ui', 'draggingFontSource', source);
  });

export const clearDraggingFont = (source: DraggingFontSource) => {
  if (appState.ui.draggingFontSource !== source) return;

  batch(() => {
    setAppState('ui', 'draggingFontKey', null);
    setAppState('ui', 'draggingDendrogramNode', null);
    setAppState('ui', 'draggingFontSource', null);
  });
};

export const commitDraggingFont = (source: DraggingFontSource) => {
  if (appState.ui.draggingFontSource !== source) return null;
  const key = appState.ui.draggingFontKey;
  if (key === null) return null;
  const dendrogramNode = appState.ui.draggingDendrogramNode;

  batch(() => {
    setAppState('ui', 'selectedFontKey', key);
    setAppState('ui', 'selectedDendrogramNode', dendrogramNode);
    setAppState('ui', 'draggingFontKey', null);
    setAppState('ui', 'draggingDendrogramNode', null);
    setAppState('ui', 'draggingFontSource', null);
  });
  selectionHistory.commitDebounced();
  return key;
};
