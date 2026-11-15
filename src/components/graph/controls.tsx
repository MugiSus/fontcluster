import type { JSX } from 'solid-js';
import { GraphToolbar } from './toolbar';
import { GraphZoomControls } from './zoom-controls';
import { type GraphMode } from '@/store';
import { type GraphToolMode } from './types';
import { type ViewportZoomControls } from './graph-viewer';

interface GraphControlsProps {
  controlAction?: JSX.Element;
  utilityControls?: JSX.Element;
  toolMode: GraphToolMode;
  showImages: boolean;
  showFontNames: boolean;
  showGlow: boolean;
  showList: boolean;
  graphMode: GraphMode;
  canCycleGraphMode: boolean;
  isFilterOpen: boolean;
  zoomControls: ViewportZoomControls | null;
  onToolModeChange: (mode: GraphToolMode) => void;
  onToggleImages: () => void;
  onToggleFontNames: () => void;
  onToggleGlow: () => void;
  onToggleList: () => void;
  onCycleGraphMode: () => void;
  onToggleFilter: () => void;
}

export function GraphControls(props: GraphControlsProps) {
  return (
    <>
      <div class='pointer-events-none absolute right-[3px] top-[3px] z-20 flex items-start gap-1 *:pointer-events-auto'>
        <div class='flex items-center gap-1'>
          {props.controlAction}
          {props.utilityControls}
        </div>
        <GraphToolbar
          toolMode={props.toolMode}
          showImages={props.showImages}
          showFontNames={props.showFontNames}
          showGlow={props.showGlow}
          showList={props.showList}
          graphMode={props.graphMode}
          canCycleGraphMode={props.canCycleGraphMode}
          isFilterOpen={props.isFilterOpen}
          onToolModeChange={props.onToolModeChange}
          onToggleImages={props.onToggleImages}
          onToggleFontNames={props.onToggleFontNames}
          onToggleGlow={props.onToggleGlow}
          onToggleList={props.onToggleList}
          onCycleGraphMode={props.onCycleGraphMode}
          onToggleFilter={props.onToggleFilter}
        />
      </div>
      <div
        class='absolute bottom-[3px] right-[3px] z-20'
        onMouseDown={(event) => event.stopPropagation()}
      >
        <GraphZoomControls
          onZoomIn={props.zoomControls?.zoomIn}
          onZoomOut={props.zoomControls?.zoomOut}
          onResetZoom={props.zoomControls?.resetView}
        />
      </div>
    </>
  );
}
