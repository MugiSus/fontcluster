import { batch, createEffect, createMemo, createSignal } from 'solid-js';
import { GraphBottomControls } from './bottom-controls';
import { GraphFilterDock } from './filter-dock';
import { GraphViewer, type ViewportZoomControls } from './graph-viewer';
import { appState, type GraphMode } from '@/store';
import {
  setActiveGraphWeights,
  setGraphMode,
  setVisibleGraphClusters,
} from '@/actions';
import { type GraphToolMode } from './types';
import { availableGraphModes as collectAvailableGraphModes } from '@/lib/graph-modes';

export function GraphContent() {
  const [toolMode, setToolMode] = createSignal<GraphToolMode>('select');
  const [showImages, setShowImages] = createSignal(true);
  const [showFontNames, setShowFontNames] = createSignal(true);
  const [showGlow, setShowGlow] = createSignal(true);
  const [isFilterOpen, setIsFilterOpen] = createSignal(false);
  const [viewportZoomControls, setViewportZoomControls] =
    createSignal<ViewportZoomControls | null>(null);
  const sessionWeights = () => appState.session.algorithm.rendering.weights;

  // The scatter layout needs per-font coordinates; sessions clustered before
  // `clustering.two` existed have none until they re-cluster.
  const isScatterAvailable = createMemo(() =>
    Object.values(appState.fonts.displayData).some(
      (item) => item.computed?.clustering?.two != null,
    ),
  );
  const availableGraphModes = createMemo<GraphMode[]>(() =>
    collectAvailableGraphModes(
      appState.dendrogram !== null,
      isScatterAvailable(),
    ),
  );

  createEffect(() => {
    const weights = sessionWeights();
    if (weights.length > 0) {
      batch(() => {
        setActiveGraphWeights(weights);
        setVisibleGraphClusters([]);
      });
    }
  });

  // Keep the selected mode valid for the loaded session. Skipping the cleared
  // intermediate payload prevents session switches and re-cluster refreshes
  // from changing modes before the replacement data arrives.
  createEffect(() => {
    if (appState.ui.isSessionLoading) return;
    const modes = availableGraphModes();
    const fallbackMode = modes[0];
    if (fallbackMode && !modes.includes(appState.ui.graphMode)) {
      setGraphMode(fallbackMode);
    }
  });

  return (
    <div class='relative isolate size-full bg-background'>
      <GraphViewer
        toolMode={toolMode()}
        showImages={showImages()}
        showFontNames={showFontNames()}
        showGlow={showGlow()}
        onViewportZoomControlsChange={setViewportZoomControls}
      />
      <GraphBottomControls
        toolMode={toolMode()}
        showImages={showImages()}
        showFontNames={showFontNames()}
        showGlow={showGlow()}
        graphMode={appState.ui.graphMode}
        canCycleGraphMode={availableGraphModes().length > 1}
        isFilterOpen={isFilterOpen()}
        zoomControls={viewportZoomControls()}
        onToolModeChange={setToolMode}
        onToggleImages={() => setShowImages((shown) => !shown)}
        onToggleFontNames={() => setShowFontNames((shown) => !shown)}
        onToggleGlow={() => setShowGlow((shown) => !shown)}
        onCycleGraphMode={() => {
          const modes = availableGraphModes();
          const nextMode =
            modes[(modes.indexOf(appState.ui.graphMode) + 1) % modes.length];
          if (nextMode) setGraphMode(nextMode);
        }}
        onToggleFilter={() => setIsFilterOpen((open) => !open)}
      />
      <GraphFilterDock
        isOpen={isFilterOpen()}
        weights={sessionWeights()}
        onWeightsChange={setActiveGraphWeights}
        onClose={() => setIsFilterOpen(false)}
      />
    </div>
  );
}
