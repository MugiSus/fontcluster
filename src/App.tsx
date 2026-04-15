import { Show, createMemo, onMount } from 'solid-js';
import { createStore } from 'solid-js/store';
import { FontLists } from './components/font-lists';
import { SessionSelector } from './components/session-selector';
import { FontProcessingForm } from './components/font-processing-form';
import { ClipboardManager } from './components/clipboard-manager';
import { initAppEvents } from './actions';
import { Toaster } from './components/ui/sonner';
import { AppShellPanel } from './components/app-shell-panel';
import { ChatViewPanel } from './components/chat-view-panel';
import { type CollapsiblePanelKey } from './components/graph-toolbar';
import { FontGraphViewPanel } from './components/font-graph-view-panel';

const COLLAPSIBLE_PANELS = [
  { key: 'control', label: 'Control' },
  { key: 'list', label: 'List' },
  { key: 'chat', label: 'Chat' },
] as const satisfies Array<{ key: CollapsiblePanelKey; label: string }>;

function App() {
  const [panelState, setPanelState] = createStore<
    Record<CollapsiblePanelKey, boolean>
  >({
    control: true,
    list: true,
    chat: false,
  });

  onMount(() => {
    initAppEvents();
  });

  const collapsedPanels = createMemo(() =>
    COLLAPSIBLE_PANELS.filter((panel) => !panelState[panel.key]),
  );

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
      <div class='flex h-full min-h-0 gap-3 p-3'>
        <Show when={panelState.control}>
          <AppShellPanel
            title='Control'
            class='w-[300px] shrink-0'
            bodyClass='p-3'
            onClose={() => closePanel('control')}
          >
            <FontProcessingForm />
          </AppShellPanel>
        </Show>

        <Show when={panelState.list}>
          <AppShellPanel
            title='List'
            class='w-[300px] shrink-0'
            bodyClass='p-3'
            onClose={() => closePanel('list')}
          >
            <FontLists />
          </AppShellPanel>
        </Show>

        <Show when={panelState.chat}>
          <AppShellPanel
            title='Chat'
            class='w-[300px] shrink-0'
            bodyClass='p-3'
            onClose={() => closePanel('chat')}
          >
            <ChatViewPanel />
          </AppShellPanel>
        </Show>

        <FontGraphViewPanel
          collapsedPanels={collapsedPanels()}
          onReopenPanel={openPanel}
        />
      </div>
    </>
  );
}

export default App;
