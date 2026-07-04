import { Show } from 'solid-js';
import { GraphBottomToolbar } from './bottom-toolbar';
import { DendrogramDock } from './dendrogram-dock';
import { type GraphToolMode } from './types';
import { type ViewportZoomControls } from './graph-viewer';
import { LassoClearButton } from './lasso-clear-button';

interface GraphBottomControlsProps {
  toolMode: GraphToolMode;
  showImages: boolean;
  showFontNames: boolean;
  showGlow: boolean;
  showDendrogram: boolean;
  dendrogramVisibleMerges: number;
  onDendrogramVisibleMergesChange: (count: number) => void;
  isFilterOpen: boolean;
  zoomControls: ViewportZoomControls | null;
  hasLassoResult: boolean;
  onToolModeChange: (mode: GraphToolMode) => void;
  onToggleImages: () => void;
  onToggleFontNames: () => void;
  onToggleGlow: () => void;
  onToggleDendrogram: () => void;
  onToggleFilter: () => void;
  onClearLasso: () => void;
}

export function GraphBottomControls(props: GraphBottomControlsProps) {
  return (
    <div
      class='pointer-events-none absolute bottom-2 right-2 z-20 flex items-end gap-1.5 *:pointer-events-auto'
      onMouseDown={(event) => event.stopPropagation()}
    >
      <Show when={props.hasLassoResult}>
        <LassoClearButton onClear={props.onClearLasso} />
      </Show>
      <Show when={props.showDendrogram}>
        <DendrogramDock
          visibleMerges={props.dendrogramVisibleMerges}
          onVisibleMergesChange={props.onDendrogramVisibleMergesChange}
        />
      </Show>
      <GraphBottomToolbar
        toolMode={props.toolMode}
        showImages={props.showImages}
        showFontNames={props.showFontNames}
        showGlow={props.showGlow}
        showDendrogram={props.showDendrogram}
        isFilterOpen={props.isFilterOpen}
        onToolModeChange={props.onToolModeChange}
        onToggleImages={props.onToggleImages}
        onToggleFontNames={props.onToggleFontNames}
        onToggleGlow={props.onToggleGlow}
        onToggleDendrogram={props.onToggleDendrogram}
        onToggleFilter={props.onToggleFilter}
        onZoomIn={props.zoomControls?.zoomIn}
        onZoomOut={props.zoomControls?.zoomOut}
        onResetZoom={props.zoomControls?.resetView}
      />
    </div>
  );
}
