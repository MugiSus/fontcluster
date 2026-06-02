import { Show, createEffect, createSignal } from 'solid-js';
import { GraphBottomControls } from './bottom-controls';
import { LassoClearButton } from './lasso-clear-button';
import { GraphViewer, type ViewportZoomControls } from './graph-viewer';
import { ZoomControls } from './zoom-controls';
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
    <div class='relative size-full bg-background'>
      <GraphViewer
        toolMode={toolMode()}
        showImages={showImages()}
        showFontNames={showFontNames()}
        activeGraphWeights={activeGraphWeights()}
        onViewportZoomControlsChange={setViewportZoomControls}
      />
      <div
        class='pointer-events-none absolute bottom-3 right-3 z-10 flex items-end gap-3 *:pointer-events-auto'
        onMouseDown={(event) => event.stopPropagation()}
      >
        <Show when={appState.ui.lassoResult}>
          <LassoClearButton onClear={clearLassoResult} />
        </Show>
        <Show when={viewportZoomControls()}>
          {(controls) => (
            <ZoomControls
              onZoomIn={controls().zoomIn}
              onZoomOut={controls().zoomOut}
              onReset={controls().resetView}
            />
          )}
        </Show>
      </div>
      <GraphBottomControls
        toolMode={toolMode()}
        showImages={showImages()}
        showFontNames={showFontNames()}
        weights={sessionWeights()}
        activeWeights={activeGraphWeights()}
        onToolModeChange={setToolMode}
        onToggleImages={() => setShowImages((shown) => !shown)}
        onToggleFontNames={() => setShowFontNames((shown) => !shown)}
        onWeightsChange={setActiveGraphWeights}
      />
    </div>
  );
}
