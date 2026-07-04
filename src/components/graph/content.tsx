import { batch, createEffect, createSignal } from 'solid-js';
import { GraphBottomControls } from './bottom-controls';
import { GraphFilterDock } from './filter-dock';
import { GraphViewer, type ViewportZoomControls } from './graph-viewer';
import { appState } from '@/store';
import {
  clearLassoResult,
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
  // Owned by the ui store (the point layout derivation switches on it); this
  // component only renders and toggles it.
  const showDendrogram = () => appState.ui.showDendrogram;
  const [viewportZoomControls, setViewportZoomControls] =
    createSignal<ViewportZoomControls | null>(null);
  const sessionWeights = () => appState.session.algorithm.rendering.weights;
  const activeGraphWeights = () => appState.ui.activeGraphWeights;

  createEffect(() => {
    const weights = sessionWeights();
    if (weights.length > 0) {
      batch(() => {
        setActiveGraphWeights(weights);
        setVisibleGraphClusters([]);
      });
    }
  });

  return (
    <div class='relative isolate size-full bg-background'>
      <GraphViewer
        toolMode={toolMode()}
        showImages={showImages()}
        showFontNames={showFontNames()}
        showGlow={showGlow()}
        showDendrogram={showDendrogram()}
        activeGraphWeights={activeGraphWeights()}
        onViewportZoomControlsChange={setViewportZoomControls}
      />
      <GraphBottomControls
        toolMode={toolMode()}
        showImages={showImages()}
        showFontNames={showFontNames()}
        showGlow={showGlow()}
        showDendrogram={showDendrogram()}
        isFilterOpen={isFilterOpen()}
        zoomControls={viewportZoomControls()}
        hasLassoResult={!!appState.ui.lassoResult}
        onToolModeChange={setToolMode}
        onToggleImages={() => setShowImages((shown) => !shown)}
        onToggleFontNames={() => setShowFontNames((shown) => !shown)}
        onToggleGlow={() => setShowGlow((shown) => !shown)}
        onToggleDendrogram={() => setShowDendrogram(!showDendrogram())}
        onToggleFilter={() => setIsFilterOpen((open) => !open)}
        onClearLasso={clearLassoResult}
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
