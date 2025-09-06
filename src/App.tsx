import { FontConfigList } from './components/font-config-list';
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
import { Separator } from './components/ui/separator';

function App() {
  const appSignal = useAppSignal();
  useEventListeners(appSignal);

  return (
    <>
      <SessionSelector
        currentSessionId={appSignal.currentSessionId() || ''}
        onSessionSelect={appSignal.setCurrentSessionId}
      />
      <Resizable class='min-h-0 overflow-hidden p-3 pt-0'>
        <ResizablePanel
          class='flex min-h-0 min-w-0 flex-col gap-3'
          initialSize={0.3}
          minSize={0.25}
          maxSize={0.75}
        >
          <FontProcessingForm
            sampleText={appSignal.sessionConfig()?.preview_text || ''}
            selectedWeights={appSignal.selectedWeights()}
            onSelectedWeightsChange={appSignal.setSelectedWeights}
            onSubmit={appSignal.generateFontImages}
          />
          <Separator />
          <Tabs value='name' class='flex min-h-0 flex-1 flex-col'>
            <TabsList class='grid w-full shrink-0 grid-cols-2'>
              <TabsTrigger value='name'>Name (A-Z)</TabsTrigger>
              <TabsTrigger value='similarity'>Similarity</TabsTrigger>
            </TabsList>

            <TabsContent
              value='name'
              class='min-h-0 flex-1 overflow-scroll rounded-md border'
            >
              <FontConfigList
                fontConfigs={Object.values(appSignal.fontConfigs() || {}).sort(
                  (a, b) =>
                    a.family_name.localeCompare(b.family_name) ||
                    a.weight - b.weight,
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
              <FontConfigList
                fontConfigs={Object.values(appSignal.fontConfigs() || {}).sort(
                  (a, b) => {
                    const aK = a.computed?.k ?? -1;
                    const bK = b.computed?.k ?? -1;
                    return (
                      (aK < 0 ? Infinity : aK) - (bK < 0 ? Infinity : bK) ||
                      a.family_name.localeCompare(b.family_name) ||
                      a.weight - b.weight
                    );
                  },
                )}
                sessionDirectory={appSignal.sessionDirectory() || ''}
                nearestFontConfig={appSignal.nearestFontConfig()}
                onFontClick={appSignal.setNearestFontConfig}
              />
            </TabsContent>
          </Tabs>
        </ResizablePanel>

        <ResizableHandle withHandle class='bg-transparent px-1.5' />

        <ResizablePanel
          class='flex min-h-0 min-w-0 overflow-hidden'
          initialSize={0.75}
        >
          <FontClusterVisualization
            fontConfigRecord={appSignal.fontConfigs()}
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
