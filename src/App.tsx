import { For, Show, createResource, createSignal, onMount } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Button } from './components/ui/button';
import {
  TextField,
  TextFieldInput,
  TextFieldLabel,
} from './components/ui/text-field';
import { ArrowRightIcon, LoaderCircleIcon } from 'lucide-solid';
import { CompressedFontVectorMap, FontVectorData } from './types/font';
import { FontCompressedVectorList } from './components/font-compressed-vector-list';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs';
import { SessionSelector } from './components/session-selector';

function App() {
  // Get session ID for debugging/logging purposes
  const [sessionId, { refetch: refetchSessionId }] = createResource(() =>
    invoke<string>('get_session_id').catch((error) => {
      console.error('Failed to get session ID:', error);
      return '';
    }),
  );

  const [isGenerating, setIsGenerating] = createSignal(false);
  const [isVectorizing, setIsVectorizing] = createSignal(false);
  const [isCompressing, setIsCompressing] = createSignal(false);
  const [isClustering, setIsClustering] = createSignal(false);

  const [sampleText, setSampleText] = createSignal('');
  const [nearestFont, setNearestFont] = createSignal('');
  const [showSessionSelector, setShowSessionSelector] = createSignal(false);

  const [sessionDirectory, { refetch: refetchSessionDirectory }] =
    createResource(() =>
      invoke<string>('get_session_directory').catch((error) => {
        console.error('Failed to get session directory:', error);
        return '';
      }),
    );

  const [compressedVectors, { refetch: refetchCompressedVectors }] =
    createResource(() =>
      invoke<string>('get_compressed_vectors')
        .then((jsonStr) => JSON.parse(jsonStr) as CompressedFontVectorMap)
        .catch((error) => {
          console.error('Failed to get compressed vectors:', error);
          return {} as CompressedFontVectorMap;
        }),
    );

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const text = formData.get('preview-text') as string;
    generateFontImages(text || 'A quick brown fox jumps over the lazy dog');
  };

  const handleMouseMove = (event: MouseEvent) => {
    if (event.buttons === 0) return;

    const elements = document.elementsFromPoint(event.clientX, event.clientY);

    const fontElements = elements.filter((el) =>
      el.hasAttribute('data-font-select-area'),
    );

    if (fontElements.length === 0) {
      return;
    }

    let nearestFont = '';
    let nearestDistance = Infinity;

    fontElements.forEach((el) => {
      const circle = el as SVGCircleElement;
      const rect = circle.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distance = Math.sqrt(
        (event.clientX - centerX) ** 2 + (event.clientY - centerY) ** 2,
      );

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestFont = circle.getAttribute('data-font-name') || '';
      }
    });

    // 最も近いフォントのli要素にスクロール
    if (nearestFont) {
      setNearestFont(nearestFont);
      const elements = document.querySelectorAll(
        `[data-font-name="${nearestFont}"] > img`,
      );
      elements.forEach((element) => {
        element.scrollIntoView({ behavior: 'instant', block: 'center' });
      });
    }
  };

  const generateFontImages = async (text: string) => {
    setIsGenerating(true);
    try {
      // Single command to run all jobs sequentially
      const result = await invoke<string>('run_jobs', {
        text,
      });
      console.log('Complete pipeline result:', result);

      refetchSessionId(); // Trigger reload of compressed vectors
      // refetchFonts(); // Trigger reload of font list
    } catch (error) {
      console.error('Failed to process fonts:', error);
    } finally {
      setIsGenerating(false);
      setIsVectorizing(false);
      setIsCompressing(false);
      setIsClustering(false);
    }
  };

  onMount(() => {
    // Load preview text from current session on startup
    const loadCurrentSessionText = async () => {
      try {
        const sessionInfoStr = await invoke<string>('get_current_session_info');
        if (sessionInfoStr) {
          const sessionInfo = JSON.parse(sessionInfoStr);
          setSampleText(sessionInfo.preview_text);
        }
      } catch (error) {
        console.error('Failed to get current session preview text:', error);
      }
    };

    loadCurrentSessionText();

    listen('font_generation_complete', () => {
      console.log('Font generation completed, refreshing images');
      setIsGenerating(false);
      setIsVectorizing(true);
    });

    listen('vectorization_complete', () => {
      console.log('Vectorization completed');
      setIsVectorizing(false);
      setIsCompressing(true);
    });

    listen('compression_complete', () => {
      console.log('Compression completed');
      setIsCompressing(false);
      setIsClustering(true);
    });

    listen('clustering_complete', () => {
      console.log('Clustering completed');
      setIsClustering(false);

      refetchSessionId();
      refetchSessionDirectory();
      refetchCompressedVectors();
    });

    listen('all_jobs_complete', () => {
      console.log('All jobs completed successfully!');
      // All states are reset in the finally block of generateFontImages
    });

    listen('show_session_selection', () => {
      console.log('Show session selection dialog');
      setShowSessionSelector(true);
    });
  });

  const handleSessionRestore = async () => {
    // Refresh all data after session restore
    refetchSessionId();
    refetchSessionDirectory();
    refetchCompressedVectors();

    // Load preview text from the restored session
    try {
      const sessionInfoStr = await invoke<string>('get_current_session_info');
      if (sessionInfoStr) {
        const sessionInfo = JSON.parse(sessionInfoStr);
        setSampleText(sessionInfo.preview_text);
      }
    } catch (error) {
      console.error('Failed to get session preview text:', error);
    }
  };

  return (
    <>
      <SessionSelector
        open={showSessionSelector()}
        onOpenChange={setShowSessionSelector}
        onSessionRestore={handleSessionRestore}
      />
      <main class='grid min-h-0 flex-1 grid-cols-10 grid-rows-1 gap-4 px-4 pb-4'>
        <div class='col-span-3 flex flex-col gap-3'>
          <form
            onSubmit={handleSubmit}
            class='flex w-full flex-col items-stretch gap-2'
          >
            <TextField class='grid w-full items-center gap-2'>
              <TextFieldLabel for='preview-text'>Preview Text</TextFieldLabel>
              <TextFieldInput
                type='text'
                name='preview-text'
                id='preview-text'
                value={sampleText()}
                onInput={(e) => setSampleText(e.currentTarget.value)}
                placeholder='A quick brown fox jumps over the lazy dog'
              />
            </TextField>
            <Button
              type='submit'
              disabled={
                isGenerating() ||
                isVectorizing() ||
                isCompressing() ||
                isClustering()
              }
              variant='outline'
              class='flex items-center gap-2'
            >
              {isGenerating() ? (
                <>
                  Generating Images... (1/4)
                  <LoaderCircleIcon class='animate-spin' />
                </>
              ) : isVectorizing() ? (
                <>
                  Vectorizing Images... (2/4)
                  <LoaderCircleIcon class='animate-spin' />
                </>
              ) : isCompressing() ? (
                <>
                  Compressing Vectors... (3/4)
                  <LoaderCircleIcon class='animate-spin' />
                </>
              ) : isClustering() ? (
                <>
                  Clustering... (4/4)
                  <LoaderCircleIcon class='animate-spin' />
                </>
              ) : (
                <>
                  Clusterize with this preview text
                  <ArrowRightIcon />
                </>
              )}
            </Button>
          </form>
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
                  compressedVectors() || {},
                ).sort((a, b) =>
                  a.config.font_name.localeCompare(b.config.font_name),
                )}
                sessionDirectory={sessionDirectory() || ''}
                nearestFont={nearestFont()}
                onFontClick={setNearestFont}
              />
            </TabsContent>

            <TabsContent
              value='similarity'
              class='min-h-0 flex-1 overflow-scroll rounded-md border'
            >
              <FontCompressedVectorList
                compressedVectors={Object.values(
                  compressedVectors() || {},
                ).sort(
                  (a, b) =>
                    a.k - b.k ||
                    a.config.font_name.localeCompare(b.config.font_name),
                )}
                sessionDirectory={sessionDirectory() || ''}
                nearestFont={nearestFont()}
                onFontClick={setNearestFont}
              />
            </TabsContent>
          </Tabs>
        </div>
        <div class='col-span-7 flex flex-col gap-3'>
          <div class='flex min-h-0 flex-1 rounded-md border bg-muted/20'>
            <svg
              class='size-full select-none'
              viewBox='-50 -50 700 700'
              xmlns='http://www.w3.org/2000/svg'
              onMouseMove={handleMouseMove}
            >
              <g>
                <circle
                  cx='300'
                  cy='300'
                  r='2'
                  class='pointer-events-none fill-border'
                />
                <circle
                  cx='300'
                  cy='300'
                  r='75'
                  fill='none'
                  class='pointer-events-none stroke-border stroke-1'
                />
                <circle
                  cx='300'
                  cy='300'
                  r='150'
                  fill='none'
                  class='pointer-events-none stroke-border stroke-1'
                />
                <circle
                  cx='300'
                  cy='300'
                  r='250'
                  fill='none'
                  class='pointer-events-none stroke-border stroke-1'
                />
                <circle
                  cx='300'
                  cy='300'
                  r='400'
                  fill='none'
                  class='pointer-events-none stroke-border stroke-1'
                />
              </g>
              {(() => {
                const vectorsMap = compressedVectors() || {};
                console.log('Compressed vectors:', vectorsMap, sessionId());

                // Convert map to array for processing
                const vectors = Object.values(vectorsMap);

                return (
                  <Show when={vectors.length > 0}>
                    {(() => {
                      // Calculate bounds once
                      const allX = vectors.map((v) => v.x);
                      const allY = vectors.map((v) => v.y);
                      const minX = Math.min(...allX);
                      const maxX = Math.max(...allX);
                      const minY = Math.min(...allY);
                      const maxY = Math.max(...allY);

                      return (
                        <For each={vectors}>
                          {(vectorData: FontVectorData) => {
                            const { x, y, k, config } = vectorData;
                            const scaledX = ((x - minX) / (maxX - minX)) * 600;
                            const scaledY = ((y - minY) / (maxY - minY)) * 600;

                            // Define cluster colors
                            const clusterColors = [
                              'fill-red-500',
                              'fill-blue-500',
                              'fill-green-500',
                              'fill-yellow-500',
                              'fill-purple-500',
                              'fill-orange-500',
                              'fill-teal-500',
                              'fill-indigo-500',
                              'fill-cyan-500',
                              'fill-fuchsia-500',
                            ];

                            // Handle noise cluster (-1) with gray-300
                            const clusterColor =
                              k === -1
                                ? 'stroke-gray-300'
                                : clusterColors[k % clusterColors.length];

                            return (
                              <g>
                                <circle
                                  cx={scaledX}
                                  cy={scaledY}
                                  r={nearestFont() === config.safe_name ? 5 : 2}
                                  class={`${clusterColor}`}
                                />
                                {nearestFont() === config.safe_name && (
                                  <circle
                                    cx={scaledX}
                                    cy={scaledY}
                                    r='2.5'
                                    class='fill-background'
                                  />
                                )}
                                <circle
                                  cx={scaledX}
                                  cy={scaledY}
                                  r='48'
                                  fill='transparent'
                                  data-font-name={config.safe_name}
                                  data-font-select-area
                                />
                                {/* <text
                              x={scaledX}
                              y={scaledY - 8}
                              class={`pointer-events-none select-none fill-foreground text-xs ${
                                nearestFont() === config.safe_name
                                  ? 'font-bold'
                                  : ''
                              }`}
                              text-anchor='middle'
                            >
                              {nearestFont() === config.safe_name
                                ? config.font_name
                                : config.font_name.length > 12
                                  ? config.font_name.substring(0, 12) + '…'
                                  : config.font_name}
                            </text> */}
                              </g>
                            );
                          }}
                        </For>
                      );
                    })()}
                  </Show>
                );
              })()}
            </svg>
          </div>
        </div>
      </main>
    </>
  );
}

export default App;
