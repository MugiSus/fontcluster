import { Show, onMount } from 'solid-js';
import { FontLists } from './components/font-lists';
import { SessionSelector } from './components/session-selector';
import { FontClusterVisualization } from './components/font-cluster-visualization';
import { FontProcessingForm } from './components/font-processing-form';
import { ClipboardManager } from './components/clipboard-manager';
import { initAppEvents } from './actions';
import { appState } from './store';
import {
  Resizable,
  ResizableHandle,
  ResizablePanel,
} from './components/ui/resizable';
import { CircleSlash2Icon } from 'lucide-solid';
import { Toaster } from './components/ui/sonner';

function App() {
  onMount(() => {
    initAppEvents();
  });

  return (
    <>
      <Toaster position='bottom-right' />
      <ClipboardManager />
      <SessionSelector />
      <div class='m-2 mt-0 h-full min-h-0'>
        <Resizable class='min-h-0 overflow-hidden rounded-lg border border-border bg-gradient-to-b from-slate-100 to-slate-200 py-2 dark:from-zinc-850 dark:to-zinc-900'>
          <ResizablePanel
            class='flex min-w-0 flex-col gap-3 overflow-hidden'
            initialSize={0.2}
            minSize={0.2}
            collapsible={true}
            collapsedSize={0}
            collapseThreshold={0.05}
            maxSize={0.5}
          >
            <FontProcessingForm />
          </ResizablePanel>

          <ResizableHandle withHandle class='bg-transparent px-1' />

          <ResizablePanel
            class='flex min-h-0 min-w-0'
            minSize={0.2}
            initialSize={0.6}
          >
            <Show
              when={appState.session.status === 'clustered'}
              fallback={
                <div class='flex size-full flex-col items-center justify-center rounded-md border bg-muted text-sm font-light text-muted-foreground'>
                  <CircleSlash2Icon class='mb-4 size-6' />
                  <h2>No results found</h2>
                  <p class='text-xs'>Complete processing to see results</p>
                </div>
              }
            >
              <FontClusterVisualization />
            </Show>
          </ResizablePanel>

          <ResizableHandle withHandle class='bg-transparent px-1' />

          <ResizablePanel
            initialSize={0.2}
            minSize={0.2}
            collapsible={true}
            collapsedSize={0}
            collapseThreshold={0.05}
            maxSize={0.5}
            class='flex min-h-0 min-w-0 flex-col'
          >
            <FontLists />
          </ResizablePanel>
        </Resizable>
      </div>
    </>
  );
}

export default App;
