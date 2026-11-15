import { createSignal, onCleanup, onMount } from 'solid-js';
import { listen } from '@tauri-apps/api/event';
import { ClipboardListener } from './components/clipboard-listener';
import { useAppEvents } from './hooks/use-app-events';
import { Toaster } from './components/ui/sonner';
import { ControlDrawer } from './components/control';
import { GraphPanel } from './components/graph';

function App() {
  const [isInterfaceVisible, setIsInterfaceVisible] = createSignal(true);
  useAppEvents();

  onMount(() => {
    const unlistenPromise = listen('toggle-interface-requested', () => {
      setIsInterfaceVisible((visible) => !visible);
    });
    onCleanup(() => void unlistenPromise.then((unlisten) => unlisten()));
  });

  return (
    <>
      <Toaster position='bottom-center' />
      <ClipboardListener />
      <div class='relative flex h-full min-h-0'>
        <GraphPanel
          showHud={isInterfaceVisible()}
          controlAction={<ControlDrawer />}
        />
      </div>
    </>
  );
}

export default App;
