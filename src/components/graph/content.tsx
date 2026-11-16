import {
  batch,
  createEffect,
  createMemo,
  createSignal,
  Show,
  type JSX,
} from 'solid-js';
import { GraphControls } from './controls';
import { GraphFilterDock } from './filter-dock';
import { GraphViewer, type ViewportControls } from './graph-viewer';
import { appState, type GraphMode } from '@/store';
import {
  setActiveGraphWeights,
  setGraphMode,
  setVisibleGraphClusters,
} from '@/commands/graph';
import { type FontItem, type RenderFontPreview } from '@/types/font';
import { type CopySelectedFont, type GraphToolMode } from './types';
import { availableGraphModes as collectAvailableGraphModes } from '@/lib/graph-modes';

interface GraphContentProps {
  sessionKey: string;
  sampleImageUrl: (safeName: string) => string | undefined;
  copySelectedFont: CopySelectedFont;
  applySelectedFont?: ((item: FontItem) => Promise<void>) | undefined;
  renderFontPreview?: RenderFontPreview | undefined;
  showHud: boolean;
  controlAction?: (onBackdropWheel: (event: WheelEvent) => void) => JSX.Element;
  /** Host-specific actions; the shared graph does not import desktop APIs. */
  utilityControls?: JSX.Element;
}

export function GraphContent(props: GraphContentProps) {
  const [toolMode, setToolMode] = createSignal<GraphToolMode>('select');
  const [showImages, setShowImages] = createSignal(true);
  const [showSamples, setShowSamples] = createSignal(true);
  const [showFontNames, setShowFontNames] = createSignal(false);
  const [showGlow, setShowGlow] = createSignal(false);
  const [showList, setShowList] = createSignal(true);
  const [isFilterOpen, setIsFilterOpen] = createSignal(false);
  const [viewportControls, setViewportControls] =
    createSignal<ViewportControls | null>(null);
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
    <div class='relative isolate size-full overflow-clip bg-background'>
      <GraphViewer
        toolMode={toolMode()}
        showImages={showImages()}
        showSamples={showSamples()}
        showFontNames={showFontNames()}
        showList={showList()}
        showGlow={showGlow()}
        showHud={props.showHud}
        sessionKey={props.sessionKey}
        sampleImageUrl={props.sampleImageUrl}
        copySelectedFont={props.copySelectedFont}
        applySelectedFont={props.applySelectedFont}
        renderFontPreview={props.renderFontPreview}
        onViewportControlsChange={setViewportControls}
      />
      <div data-tauri-drag-region class='absolute inset-x-0 top-0 z-10 h-10' />
      <Show when={props.showHud}>
        <GraphControls
          controlAction={props.controlAction?.((event) =>
            viewportControls()?.handleWheel(event),
          )}
          utilityControls={props.utilityControls}
          toolMode={toolMode()}
          showImages={showImages()}
          showSamples={showSamples()}
          showFontNames={showFontNames()}
          showList={showList()}
          showGlow={showGlow()}
          graphMode={appState.ui.graphMode}
          canCycleGraphMode={availableGraphModes().length > 1}
          zoomControls={viewportControls()}
          isFilterOpen={isFilterOpen()}
          onToggleFilter={() => setIsFilterOpen((open) => !open)}
          onToolModeChange={setToolMode}
          onToggleImages={() => setShowImages((shown) => !shown)}
          onToggleSamples={() => setShowSamples((shown) => !shown)}
          onToggleFontNames={() => setShowFontNames((shown) => !shown)}
          onToggleGlow={() => setShowGlow((shown) => !shown)}
          onToggleList={() => setShowList((shown) => !shown)}
          onCycleGraphMode={() => {
            const modes = availableGraphModes();
            const nextMode =
              modes[(modes.indexOf(appState.ui.graphMode) + 1) % modes.length];
            if (nextMode) setGraphMode(nextMode);
          }}
        />
        <GraphFilterDock
          isOpen={isFilterOpen()}
          weights={sessionWeights()}
          onWeightsChange={setActiveGraphWeights}
          onOpenChange={setIsFilterOpen}
        />
      </Show>
    </div>
  );
}
