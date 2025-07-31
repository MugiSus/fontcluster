import { FontCompressedVectorList } from './components/font-compressed-vector-list';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs';
import { SessionSelector } from './components/session-selector';
import { FontClusterVisualization } from './components/font-cluster-visualization';
import { FontProcessingForm } from './components/font-processing-form';
import { useAppSignal } from './hooks/use-app-signal';
import { useEventListeners } from './hooks/use-event-listeners';
import { type FontWeight } from './types/font';

function App() {
  const appSignal = useAppSignal();
  useEventListeners(appSignal);

  return (
    <>
      <SessionSelector
        currentSessionId={appSignal.currentSessionId() || ''}
        onSessionSelect={appSignal.setCurrentSessionId}
      />
      <main class='grid min-h-0 flex-1 grid-cols-10 grid-rows-1 gap-4 px-4 pb-4'>
        <div class='col-span-3 flex flex-col gap-3'>
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
        </div>

        <div class='col-span-7 flex min-h-0 flex-1 flex-col gap-3 rounded-md border bg-muted/20'>
          <FontClusterVisualization
            compressedVectors={appSignal.compressedVectors()}
            nearestFontConfig={appSignal.nearestFontConfig()}
            sessionWeights={
              (appSignal.sessionConfig()?.weights as FontWeight[]) || [400]
            }
            visualizerWeights={appSignal.visualizerWeights()}
            onVisualizerWeightsChange={appSignal.setVisualizerWeights}
            onFontSelect={appSignal.setNearestFontConfig}
          />
        </div>
      </main>
    </>
  );
}

export default App;
