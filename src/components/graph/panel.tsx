import { Show, createSignal } from 'solid-js';
import { GraphBottomToolbar } from './bottom-toolbar';
import { GraphContent } from './content';
import { GraphSearchField } from './search-field';
import { GraphToolbar } from './toolbar';
import { CollapsiblePanelKey, PanelState } from '../../types/panels';
import { type GraphToolMode } from './types';

interface GraphPanelProps {
  panelState: PanelState;
  onReopenPanel: (panel: CollapsiblePanelKey) => void;
  isLeftInset?: boolean | undefined;
}

export function GraphPanel(props: GraphPanelProps) {
  const [toolMode, setToolMode] = createSignal<GraphToolMode>('select');
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
    <section class='relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background'>
      <GraphToolbar
        panelState={props.panelState}
        onReopenPanel={props.onReopenPanel}
        isLeftInset={props.isLeftInset}
      />
      <GraphContent toolMode={toolMode()} />
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
          toolMode={toolMode()}
          onToolModeChange={setToolMode}
          onToggleSearch={toggleSearch}
        />
      </div>
    </section>
  );
}
