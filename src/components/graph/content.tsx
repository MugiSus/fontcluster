import { createEffect, createSignal } from 'solid-js';
import { GraphBottomControls } from './bottom-controls';
import { GraphViewer, type ViewportZoomControls } from './graph-viewer';
import { appState } from '../../store';
import { clearLassoResult, setActiveGraphWeights } from '../../actions';
import { type GraphToolMode } from './types';

export function GraphContent() {
  const [toolMode, setToolMode] = createSignal<GraphToolMode>('select');
  const [showImages, setShowImages] = createSignal(true);
  const [showFontNames, setShowFontNames] = createSignal(true);
  const [viewportZoomControls, setViewportZoomControls] =
    createSignal<ViewportZoomControls | null>(null);
  const sessionWeights = () =>
    appState.session.config.algorithm.rendering.weights;
  const activeGraphWeights = () => appState.ui.activeGraphWeights;

  createEffect(() => {
    const weights = sessionWeights();
    if (weights.length > 0) {
      setActiveGraphWeights(weights);
    }
  });

  return (
    <div class='relative isolate size-full bg-background'>
      <GraphViewer
        toolMode={toolMode()}
        showImages={showImages()}
        showFontNames={showFontNames()}
        activeGraphWeights={activeGraphWeights()}
        onViewportZoomControlsChange={setViewportZoomControls}
      />
      <GraphBottomControls
        toolMode={toolMode()}
        showImages={showImages()}
        showFontNames={showFontNames()}
        weights={sessionWeights()}
        activeWeights={activeGraphWeights()}
        zoomControls={viewportZoomControls()}
        hasLassoResult={!!appState.ui.lassoResult}
        onToolModeChange={setToolMode}
        onToggleImages={() => setShowImages((shown) => !shown)}
        onToggleFontNames={() => setShowFontNames((shown) => !shown)}
        onWeightsChange={setActiveGraphWeights}
        onClearLasso={clearLassoResult}
      />
    </div>
  );
}
