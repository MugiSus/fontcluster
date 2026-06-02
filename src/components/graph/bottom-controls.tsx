import { Show, createSignal } from 'solid-js';
import { GraphBottomToolbar } from './bottom-toolbar';
import { GraphSearchField } from './search-field';
import { type GraphToolMode } from './types';

interface GraphBottomControlsProps {
  toolMode: GraphToolMode;
  onToolModeChange: (mode: GraphToolMode) => void;
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
        <div class='pointer-events-none absolute inset-x-0 bottom-16 z-20 flex justify-center px-4'>
          <div
            class='pointer-events-auto w-full max-w-sm'
            onMouseDown={(event) => event.stopPropagation()}
          >
            <GraphSearchField focusRequest={searchFocusRequest()} />
          </div>
        </div>
      </Show>
      <div
        class='pointer-events-auto absolute bottom-3 left-1/2 z-20 -translate-x-1/2'
        onMouseDown={(event) => event.stopPropagation()}
      >
        <GraphBottomToolbar
          toolMode={props.toolMode}
          onToolModeChange={props.onToolModeChange}
          onToggleSearch={toggleSearch}
        />
      </div>
    </>
  );
}
