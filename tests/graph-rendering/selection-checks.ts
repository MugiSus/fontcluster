import { createRoot } from 'solid-js';
import { mockIPC, clearMocks } from '@tauri-apps/api/mocks';
import { loadSession } from '../../src/commands/session';
import { setSelectedFontKey } from '../../src/commands/font-selection';
import { appState } from '../../src/store';
import { useGraphSelection } from '../../src/components/graph/use-graph-selection';
import type { GraphPointData } from '../../src/components/graph/types';

type Check = (name: string, actual: number, expected: number) => void;

/** Uses public session/selection commands, never writes application state directly. */
export async function checkSelectionInput(
  check: Check,
  points: GraphPointData[],
) {
  const samples = points.slice(0, 3);
  mockIPC((command) => {
    if (command !== 'load_session')
      throw new Error(`Unexpected command: ${command}`);
    return {
      config: { ...appState.session, session_id: 'selection-regression' },
      directory: 'selection-regression',
      dendrogram: null,
      fonts: Object.fromEntries(
        samples.map((point) => [point.key, point.item]),
      ),
    };
  });
  await loadSession('selection-regression');
  const originalRaf = window.requestAnimationFrame;
  const originalCancel = window.cancelAnimationFrame;
  const frames = new Map<number, FrameRequestCallback>();
  let nextId = 0;
  window.requestAnimationFrame = (callback) => {
    frames.set(++nextId, callback);
    return nextId;
  };
  window.cancelAnimationFrame = (id) => {
    frames.delete(id);
  };
  const frame = () => {
    for (const [id, callback] of [...frames]) {
      if (frames.delete(id)) callback(performance.now());
    }
  };
  let dispose = () => {};
  const selection = createRoot((cleanup) => {
    dispose = cleanup;
    return useGraphSelection({
      getGraphPointFromEvent: (event) => ({
        x: event.clientX,
        y: event.clientY,
      }),
      getSelectionRadius: () => 1,
      findSelectablePoint: (x) => samples[x],
      findDendrogramAnchor: () => null,
      findDendrogramPoint: () => null,
      copySelectedFont: () => {},
    });
  });
  const pointer = (x: number) => new MouseEvent('mousemove', { clientX: x });
  const selectedIs = (index: number) =>
    Number(selection.selectedKey() === samples[index]!.key);
  try {
    selection.beginDraggingSelection(pointer(0));
    check('pointer down selects immediately', selectedIs(0), 1);
    for (let i = 0; i < 500; i++)
      selection.trackDraggingSelection(pointer(i % 3));
    selection.trackDraggingSelection(pointer(1));
    check('500 moves schedule one selection update', frames.size, 1);
    check('moves do not repeatedly publish selection', selectedIs(0), 1);
    selection.trackDraggingSelection(pointer(-1));
    frame();
    check(
      'empty space preserves latest node crossed in the frame',
      selectedIs(1),
      1,
    );
    check('selection input leaves no queued frames', frames.size, 0);
    selection.trackDraggingSelection(pointer(0));
    selection.selectFromMouseEvent(pointer(2));
    check(
      'release uses final coordinates before committing',
      Number(appState.ui.selectedFontKey === samples[2]!.key),
      1,
    );
    check('release cancels pending frame', frames.size, 0);
    selection.beginDraggingSelection(pointer(0));
    selection.trackDraggingSelection(pointer(1));
    selection.selectFromMouseEvent(pointer(-1));
    check(
      'release in empty space commits last unpainted hit',
      Number(appState.ui.selectedFontKey === samples[1]!.key),
      1,
    );
    selection.beginDraggingSelection(pointer(0));
    selection.trackDraggingSelection(pointer(2));
    selection.clearDraggingSelection();
    frame();
    check(
      'cancel cannot revive a queued selection',
      Number(appState.ui.draggingFontKey === null),
      1,
    );
    check('cancel preserves committed selection', selectedIs(1), 1);
    selection.beginDraggingSelection(pointer(0));
    selection.trackDraggingSelection(pointer(2));
    const reload = loadSession('selection-regression');
    check('session loading cancels pending input immediately', frames.size, 0);
    await reload;
    frame();
    check(
      'session loading cannot restore an old drag',
      Number(appState.ui.draggingFontKey === null),
      1,
    );
    selection.beginDraggingSelection(pointer(0));
    selection.trackDraggingSelection(pointer(2));
    dispose();
    frame();
    check(
      'unmount cancels input and transient selection',
      Number(frames.size === 0 && appState.ui.draggingFontKey === null),
      1,
    );
  } finally {
    dispose();
    window.requestAnimationFrame = originalRaf;
    window.cancelAnimationFrame = originalCancel;
    setSelectedFontKey(null);
    clearMocks();
  }
}
