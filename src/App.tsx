import { Show, onMount } from 'solid-js';
import { createStore } from 'solid-js/store';
import { SessionSelector } from './components/session-selector';
import { FontProcessingForm } from './components/font-processing-form';
import { ClipboardManager } from './components/clipboard-manager';
import { initAppEvents } from './actions';
import { Toaster } from './components/ui/sonner';
import { AppShellPanel } from './components/app-shell-panel';
import { ChatViewPanel } from './components/chat-view-panel';
import { FontGraphViewPanel } from './components/font-graph-view-panel';
import { ListViewPanel } from './components/list-view-panel';
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
      <Toaster position='bottom-right' />
      <ClipboardManager />
      <SessionSelector />
      <div class='flex h-full min-h-0'>
        <Show when={panelState.control}>
          <AppShellPanel
            title='Control'
            class='w-[300px] shrink-0'
            isLeftInset={!isFullscreen()}
            onClose={() => closePanel('control')}
          >
            <FontProcessingForm />
          </AppShellPanel>
        </Show>

        <div class={cn('flex min-h-0 shrink-0', !panelState.list && 'hidden')}>
          <ListViewPanel
            onClose={() => closePanel('list')}
            isLeftInset={!isFullscreen() && !panelState.control}
          />
        </div>

        <Show when={panelState.chat}>
          <AppShellPanel
            title='Chat'
            class='w-[300px] shrink-0'
            isLeftInset={
              !isFullscreen() && !panelState.control && !panelState.list
            }
            onClose={() => closePanel('chat')}
          >
            <ChatViewPanel />
          </AppShellPanel>
        </Show>

        <FontGraphViewPanel
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
