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
    <div class='pointer-events-auto absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 flex-col gap-2'>
      <div
        class='pointer-events-none flex w-full max-w-sm flex-col items-center gap-2 *:pointer-events-auto *:shadow-sm'
        onMouseDown={(event) => event.stopPropagation()}
      >
        <Show when={props.hasLassoResult}>
          <LassoClearButton onClear={props.onClearLasso} />
        </Show>
        <Show when={isSearchVisible()}>
          <div class='flex w-full flex-col justify-center gap-2'>
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
          </div>
        </Show>
      </div>
      <div
        class='rounded-lg shadow-sm'
        onMouseDown={(event) => event.stopPropagation()}
      >
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
    </div>
  );
}
