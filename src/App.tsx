import { Show } from 'solid-js';
import { createStore } from 'solid-js/store';
import { platform } from '@tauri-apps/plugin-os';
import { ClipboardListener } from './components/clipboard-listener';
import { useAppEvents } from './actions';
import { Toaster } from './components/ui/sonner';
import { ChatPanel } from './components/chat';
import { ControlPanel } from './components/control';
import { GraphPanel } from './components/graph';
import { ListPanel } from './components/list';
import { CollapsiblePanelKey, PanelState } from './types/panels';
import { useIsFullscreen } from './hooks/use-is-fullscreen';

function App() {
  const isFullscreen = useIsFullscreen();
  const isMac = platform() === 'macos';
  const [panelState, setPanelState] = createStore<PanelState>({
    control: true,
    list: true,
    chat: false,
  });
  useAppEvents();

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
            isLeftInset={isMac && !isFullscreen()}
            onClose={() => closePanel('control')}
          />
        </Show>

        <Show when={panelState.list}>
          <ListPanel
            onClose={() => closePanel('list')}
            isLeftInset={isMac && !isFullscreen() && !panelState.control}
          />
        </Show>

        <Show when={panelState.chat}>
          <ChatPanel
            isLeftInset={
              isMac &&
              !isFullscreen() &&
              !panelState.control &&
              !panelState.list
            }
            onClose={() => closePanel('chat')}
          />
        </Show>

        <GraphPanel
          panelState={panelState}
          onReopenPanel={openPanel}
          isLeftInset={
            isMac &&
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
