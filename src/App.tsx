import { Show, onMount } from 'solid-js';
import { createStore } from 'solid-js/store';
import { ClipboardListener } from './components/clipboard-listener';
import { initAppEvents } from './actions';
import { Toaster } from './components/ui/sonner';
import { ChatPanel } from './components/chat';
import { ControlPanel } from './components/control';
import { GraphPanel } from './components/graph';
import { ListPanel } from './components/list';
import { cn } from './lib/utils';
import { CollapsiblePanelKey, PanelState } from './types/panels';
import { useIsFullscreen } from './hooks/use-is-fullscreen';

function App() {
  const isFullscreen = useIsFullscreen();
  const [panelState, setPanelState] = createStore<PanelState>({
    control: true,
    list: true,
    chat: false,
  });

  onMount(() => {
    initAppEvents();
  });

  const closePanel = (panel: CollapsiblePanelKey) => {
    setPanelState(panel, false);
  };

  const openPanel = (panel: CollapsiblePanelKey) => {
    setPanelState(panel, true);
  };

  return (
    <>
      <Toaster position='bottom-center' />
      <ClipboardListener />
      <div class='flex h-full min-h-0'>
        <Show when={panelState.control}>
          <ControlPanel
            isLeftInset={!isFullscreen()}
            onClose={() => closePanel('control')}
          />
        </Show>

        <div class={cn('flex min-h-0 shrink-0', !panelState.list && 'hidden')}>
          <ListPanel
            onClose={() => closePanel('list')}
            isLeftInset={!isFullscreen() && !panelState.control}
          />
        </div>

        <Show when={panelState.chat}>
          <ChatPanel
            isLeftInset={
              !isFullscreen() && !panelState.control && !panelState.list
            }
            onClose={() => closePanel('chat')}
          />
        </Show>

        <GraphPanel
          panelState={panelState}
          onReopenPanel={openPanel}
          isLeftInset={
            !isFullscreen() &&
            !panelState.control &&
            !panelState.list &&
            !panelState.chat
          }
        />
      </div>
    </>
  );
}

export default App;
