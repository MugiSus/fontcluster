import { Show, createSignal } from 'solid-js';
import { GraphBottomToolbar } from './bottom-toolbar';
import { GraphSearchField } from './search-field';
import { type GraphToolMode } from './types';
import { WeightSelector } from '../weight-selector';
import { type FontWeight } from '../../types/font';

interface GraphBottomControlsProps {
  toolMode: GraphToolMode;
  showImages: boolean;
  showFontNames: boolean;
  weights: FontWeight[];
  activeWeights: FontWeight[];
  onToolModeChange: (mode: GraphToolMode) => void;
  onToggleImages: () => void;
  onToggleFontNames: () => void;
  onWeightsChange: (weights: FontWeight[]) => void;
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
    <>
      <Show when={isSearchVisible()}>
        <div
          class='pointer-events-auto absolute bottom-16 left-1/2 z-20 mx-auto flex w-full max-w-sm -translate-x-1/2 flex-col justify-center gap-2 *:shadow-sm'
          onMouseDown={(event) => event.stopPropagation()}
        >
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
      <div
        class='pointer-events-auto absolute bottom-3 left-1/2 z-20 -translate-x-1/2'
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
        />
      </div>
    </>
  );
}
