import { FontCompressedVectorList } from './components/font-compressed-vector-list';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs';
import { SessionSelector } from './components/session-selector';
import { FontClusterVisualization } from './components/font-cluster-visualization';
import { FontProcessingForm } from './components/font-processing-form';
import { useAppSignal } from './hooks/use-app-signal';
import { useEventListeners } from './hooks/use-event-listeners';
import { type FontWeight } from './types/font';
import {
  Resizable,
  ResizableHandle,
  ResizablePanel,
} from './components/ui/resizable';

function App() {
  const appSignal = useAppSignal();
  useEventListeners(appSignal);

  return (
    <>
      <SessionSelector
        currentSessionId={appSignal.currentSessionId() || ''}
        onSessionSelect={appSignal.setCurrentSessionId}
      />
      <Resizable class='min-h-0 overflow-hidden border-t'>
        <ResizablePanel
          class='flex min-h-0 min-w-0 flex-col gap-3 p-4 pt-2'
          initialSize={0.25}
          minSize={0.225}
          maxSize={0.75}
        >
          <FontProcessingForm
            sampleText={appSignal.sessionConfig()?.preview_text || ''}
            selectedWeights={appSignal.selectedWeights()}
            onSelectedWeightsChange={appSignal.setSelectedWeights}
            onSubmit={appSignal.generateFontImages}
          />
          <Tabs value='name' class='flex min-h-0 flex-1 flex-col'>
            <TabsList class='grid w-full shrink-0 grid-cols-2'>
              <TabsTrigger value='name'>Name (A-Z)</TabsTrigger>
              <TabsTrigger value='similarity'>Similarity</TabsTrigger>
            </TabsList>

            <TabsContent
              value='name'
              class='min-h-0 flex-1 overflow-scroll rounded-md border'
            >
              <FontCompressedVectorList
                compressedVectors={Object.values(
                  appSignal.compressedVectors() || {},
                ).sort((a, b) =>
                  a.config.font_name.localeCompare(b.config.font_name),
                )}
                sessionDirectory={appSignal.sessionDirectory() || ''}
                nearestFontConfig={appSignal.nearestFontConfig()}
                onFontClick={appSignal.setNearestFontConfig}
              />
            </TabsContent>

            <TabsContent
              value='similarity'
              class='min-h-0 flex-1 overflow-scroll rounded-md border'
            >
              <FontCompressedVectorList
                compressedVectors={Object.values(
                  appSignal.compressedVectors() || {},
                ).sort(
                  (a, b) =>
                    (a.k < 0 ? Infinity : a.k) - (b.k < 0 ? Infinity : b.k) ||
                    a.config.font_name.localeCompare(b.config.font_name),
                )}
                sessionDirectory={appSignal.sessionDirectory() || ''}
                nearestFontConfig={appSignal.nearestFontConfig()}
                onFontClick={appSignal.setNearestFontConfig}
              />
            </TabsContent>
          </Tabs>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel
          class='flex min-h-0 min-w-0 overflow-hidden p-4'
          initialSize={0.75}
        >
          <FontClusterVisualization
            compressedVectors={appSignal.compressedVectors()}
            nearestFontConfig={appSignal.nearestFontConfig()}
            sessionWeights={
              (appSignal.sessionConfig()?.weights as FontWeight[]) || [400]
            }
            onFontSelect={appSignal.setNearestFontConfig}
          />
        </ResizablePanel>
      </Resizable>
    </>
  );
}

export default App;
