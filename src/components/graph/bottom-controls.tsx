import { Show, createSignal } from 'solid-js';
import { GraphBottomToolbar } from './bottom-toolbar';
import { GraphSearchField } from './search-field';
import { type GraphToolMode } from './types';
import { type ViewportZoomControls } from './graph-viewer';
import { LassoClearButton } from './lasso-clear-button';
import { WeightSelector } from '../weight-selector';
import { type FontWeight } from '../../types/font';

interface GraphBottomControlsProps {
  toolMode: GraphToolMode;
  showImages: boolean;
  showFontNames: boolean;
  weights: FontWeight[];
  activeWeights: FontWeight[];
  zoomControls: ViewportZoomControls | null;
  hasLassoResult: boolean;
  onToolModeChange: (mode: GraphToolMode) => void;
  onToggleImages: () => void;
  onToggleFontNames: () => void;
  onWeightsChange: (weights: FontWeight[]) => void;
  onClearLasso: () => void;
}

export function GraphBottomControls(props: GraphBottomControlsProps) {
  const [isSearchVisible, setIsSearchVisible] = createSignal(false);
  const [searchFocusRequest, setSearchFocusRequest] = createSignal(0);

  const toggleSearch = () => {
    const nextIsSearchVisible = !isSearchVisible();
    setIsSearchVisible(nextIsSearchVisible);
    if (nextIsSearchVisible) {
      setSearchFocusRequest((request) => request + 1);
    }
  };

  return (
    <div
      class='pointer-events-none absolute bottom-2 left-2 z-20 flex flex-col items-start gap-1.5 *:pointer-events-auto'
      onMouseDown={(event) => event.stopPropagation()}
    >
      <Show when={props.hasLassoResult}>
        <LassoClearButton onClear={props.onClearLasso} />
      </Show>
      <Show when={isSearchVisible()}>
        <GraphSearchField focusRequest={searchFocusRequest()} />
        <Show
          when={props.weights.length > 1 ? props.weights.join(',') : false}
          keyed
        >
          <WeightSelector
            weights={props.weights}
            defaultValue={props.activeWeights}
            onChange={props.onWeightsChange}
            showUnavailableWeights
          />
        </Show>
      </Show>
      <GraphBottomToolbar
        toolMode={props.toolMode}
        isSerachVisible={isSearchVisible()}
        showImages={props.showImages}
        showFontNames={props.showFontNames}
        onToolModeChange={props.onToolModeChange}
        onToggleImages={props.onToggleImages}
        onToggleFontNames={props.onToggleFontNames}
        onToggleSearch={toggleSearch}
        onZoomIn={props.zoomControls?.zoomIn}
        onZoomOut={props.zoomControls?.zoomOut}
        onResetZoom={props.zoomControls?.resetView}
      />
    </div>
  );
}
