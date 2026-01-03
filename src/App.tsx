import { Show } from 'solid-js';
import { FontLists } from './components/font-lists';
import { SessionSelector } from './components/session-selector';
import { FontClusterVisualization } from './components/font-cluster-visualization';
import { FontProcessingForm } from './components/font-processing-form';
import { ClipboardManager } from './components/clipboard-manager';
import { useAppSignal } from './hooks/use-app-signal';
import { useEventListeners } from './hooks/use-event-listeners';
import { type FontWeight } from './types/font';
import {
  Resizable,
  ResizableHandle,
  ResizablePanel,
} from './components/ui/resizable';
import { CircleSlash2Icon } from 'lucide-solid';
import { Toaster } from './components/ui/toast';
import { useFilteredFontMetadataKeys } from './hooks/use-filtered-font-metadata-keys';

function App() {
  const appSignal = useAppSignal();

  useEventListeners({
    setCurrentSessionId: appSignal.setCurrentSessionId,
  });

  const { filteredFontMetadataKeys, query, onQueryChange } =
    useFilteredFontMetadataKeys({
      fontMetadataMap: appSignal.fontMetadataMap,
      onFontSelect: appSignal.setSelectedFontMetadata,
    });

  return (
    <>
      <Toaster />
      <ClipboardManager selectedFont={appSignal.selectedFontMetadata()} />
      <SessionSelector
        currentSessionId={appSignal.currentSessionId() || ''}
        onSessionSelect={appSignal.setCurrentSessionId}
      />
      <Resizable class='min-h-0 overflow-hidden p-3 pt-0'>
        <ResizablePanel
          class='flex min-w-0 flex-col gap-3 overflow-hidden'
          initialSize={0.25}
          minSize={0.2}
          collapsible={true}
          collapsedSize={0}
          collapseThreshold={0.1}
          maxSize={0.5}
        >
          <FontProcessingForm
            sampleText={appSignal.sessionConfig()?.preview_text || ''}
            selectedWeights={appSignal.selectedWeights()}
            algorithm={appSignal.sessionConfig()?.algorithm}
            initialStatus={appSignal.sessionConfig()?.process_status}
            sessionId={appSignal.currentSessionId()}
            onSelectedWeightsChange={appSignal.setSelectedWeights}
            onSubmit={appSignal.runProcessingJobs}
            onStop={appSignal.stopJobs}
          />
        </ResizablePanel>

        <ResizableHandle withHandle class='bg-transparent px-1.5' />

        <ResizablePanel
          class='flex min-h-0 min-w-0'
          minSize={0.2}
          initialSize={0.5}
        >
          <Show
            when={appSignal.sessionConfig()?.process_status === 'clustered'}
            fallback={
              <div class='flex size-full flex-col items-center justify-center rounded-md border bg-muted/20 text-sm font-light text-muted-foreground'>
                <CircleSlash2Icon class='mb-4 size-6' />
                <h2>No results yet</h2>
                <p class='text-xs'>Complete processing to see results</p>
              </div>
            }
          >
            <FontClusterVisualization
              fontMetadataMap={appSignal.fontMetadataMap()}
              filteredFontMetadataKeys={filteredFontMetadataKeys()}
              selectedFontMetadata={appSignal.selectedFontMetadata()}
              sessionWeights={
                (appSignal.sessionConfig()?.weights as FontWeight[]) || [400]
              }
              onFontSelect={appSignal.setSelectedFontMetadata}
            />
          </Show>
        </ResizablePanel>

        <ResizableHandle withHandle class='bg-transparent px-1.5' />

        <ResizablePanel
          initialSize={0.25}
          minSize={0.2}
          collapsible={true}
          collapsedSize={0}
          collapseThreshold={0.1}
          maxSize={0.5}
          class='flex min-h-0 min-w-0 flex-col overflow-hidden'
        >
          <FontLists
            fontMetadataMap={appSignal.fontMetadataMap()}
            filteredFontMetadataKeys={filteredFontMetadataKeys()}
            sessionDirectory={appSignal.sessionDirectory() || ''}
            selectedFontMetadata={appSignal.selectedFontMetadata()}
            onFontSelect={appSignal.setSelectedFontMetadata}
            onQueryChange={onQueryChange}
            isFiltered={query().length > 0}
          />
        </ResizablePanel>
      </Resizable>
    </>
  );
}

export default App;
