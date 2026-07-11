import { batch, createEffect, createMemo, createSignal } from 'solid-js';
import { GraphBottomControls } from './bottom-controls';
import { GraphFilterDock } from './filter-dock';
import { GraphViewer, type ViewportZoomControls } from './graph-viewer';
import { appState } from '@/store';
import {
  setActiveGraphWeights,
  setShowDendrogram,
  setVisibleGraphClusters,
} from '@/actions';
import { type GraphToolMode } from './types';

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

  createEffect(() => {
    const weights = sessionWeights();
    if (weights.length > 0) {
      batch(() => {
        setActiveGraphWeights(weights);
        setVisibleGraphClusters([]);
      });
    }
  });

  // Landing in the scatter mode with no coordinates (switching to a session
  // clustered before they existed) would show an empty graph with its toggle
  // hidden; fall back to the dendrogram. Skipped while a session is still
  // loading — the flag only clears once the fonts are in place, so a
  // re-cluster refresh of a scatter-capable session never bounces the layout.
  createEffect(() => {
    if (appState.ui.isSessionLoading) return;
    if (!isScatterAvailable() && !appState.ui.showDendrogram) {
      setShowDendrogram(true);
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
        showDendrogram={appState.ui.showDendrogram}
        isScatterAvailable={isScatterAvailable()}
        isFilterOpen={isFilterOpen()}
        zoomControls={viewportZoomControls()}
        onToolModeChange={setToolMode}
        onToggleImages={() => setShowImages((shown) => !shown)}
        onToggleFontNames={() => setShowFontNames((shown) => !shown)}
        onToggleGlow={() => setShowGlow((shown) => !shown)}
        onToggleDendrogram={() =>
          setShowDendrogram(!appState.ui.showDendrogram)
        }
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
