import { FontCompressedVectorList } from './components/font-compressed-vector-list';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs';
import { SessionSelector } from './components/session-selector';
import { FontClusterVisualization } from './components/font-cluster-visualization';
import { FontProcessingForm } from './components/font-processing-form';
import { useAppState } from './hooks/use-app-state';
import { useEventListeners } from './hooks/use-event-listeners';
import { type FontWeight } from './types/font';

function App() {
  const appState = useAppState();
  useEventListeners(appState);

  return (
    <>
      <SessionSelector
        open={appState.showSessionSelector()}
        onOpenChange={appState.setShowSessionSelector}
        onSessionRestore={appState.handleSessionRestore}
        currentSessionId={appState.currentSessionId() || ''}
        onSessionSelect={appState.setCurrentSessionId}
      />
      <main class='grid min-h-0 flex-1 grid-cols-10 grid-rows-1 gap-4 px-4 pb-4'>
        <div class='col-span-3 flex flex-col gap-3'>
          <FontProcessingForm
            sampleText={appState.sampleText()}
            selectedWeights={appState.selectedWeights()}
            processingStatus={appState.processingStatus()}
            progressLabelNumerator={appState.progressLabelNumerator()}
            progressLabelDenominator={appState.progressLabelDenominator()}
            onSelectedWeightsChange={appState.setSelectedWeights}
            onSampleTextChange={appState.setSampleText}
            onSubmit={appState.generateFontImages}
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
                  appState.compressedVectors() || {},
                ).sort((a, b) =>
                  a.config.font_name.localeCompare(b.config.font_name),
                )}
                sessionDirectory={appState.sessionDirectory() || ''}
                nearestFontConfig={appState.nearestFontConfig()}
                onFontClick={appState.setNearestFontConfig}
              />
            </TabsContent>

            <TabsContent
              value='similarity'
              class='min-h-0 flex-1 overflow-scroll rounded-md border'
            >
              <FontCompressedVectorList
                compressedVectors={Object.values(
                  appState.compressedVectors() || {},
                ).sort(
                  (a, b) =>
                    (a.k < 0 ? Infinity : a.k) - (b.k < 0 ? Infinity : b.k) ||
                    a.config.font_name.localeCompare(b.config.font_name),
                )}
                sessionDirectory={appState.sessionDirectory() || ''}
                nearestFontConfig={appState.nearestFontConfig()}
                onFontClick={appState.setNearestFontConfig}
              />
            </TabsContent>
          </Tabs>
        </div>

        <div class='col-span-7 flex min-h-0 flex-1 flex-col gap-3 rounded-md border bg-muted/20'>
          <FontClusterVisualization
            compressedVectors={appState.compressedVectors()}
            nearestFontConfig={appState.nearestFontConfig()}
            sessionWeights={
              (appState.sessionInfo()?.weights as FontWeight[]) || [400]
            }
            visualizerWeights={appState.visualizerWeights()}
            onVisualizerWeightsChange={appState.setVisualizerWeights}
            onFontSelect={appState.setNearestFontConfig}
          />
        </div>
      </main>
    </>
  );
}

export default App;
