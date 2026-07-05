import { GraphBottomToolbar } from './bottom-toolbar';
import { type GraphToolMode } from './types';
import { type ViewportZoomControls } from './graph-viewer';

interface GraphBottomControlsProps {
  toolMode: GraphToolMode;
  showImages: boolean;
  showFontNames: boolean;
  showGlow: boolean;
  isFilterOpen: boolean;
  zoomControls: ViewportZoomControls | null;
  onToolModeChange: (mode: GraphToolMode) => void;
  onToggleImages: () => void;
  onToggleFontNames: () => void;
  onToggleGlow: () => void;
  onToggleFilter: () => void;
}

export function GraphBottomControls(props: GraphBottomControlsProps) {
  return (
    <div
      class='pointer-events-none absolute bottom-2 right-2 z-20 flex items-end gap-1.5 *:pointer-events-auto'
      onMouseDown={(event) => event.stopPropagation()}
    >
      <GraphBottomToolbar
        toolMode={props.toolMode}
        showImages={props.showImages}
        showFontNames={props.showFontNames}
        showGlow={props.showGlow}
        isFilterOpen={props.isFilterOpen}
        onToolModeChange={props.onToolModeChange}
        onToggleImages={props.onToggleImages}
        onToggleFontNames={props.onToggleFontNames}
        onToggleGlow={props.onToggleGlow}
        onToggleFilter={props.onToggleFilter}
        onZoomIn={props.zoomControls?.zoomIn}
        onZoomOut={props.zoomControls?.zoomOut}
        onResetZoom={props.zoomControls?.resetView}
      />
    </div>
  );
}
