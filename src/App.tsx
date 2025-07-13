import { For, Show, createResource, createSignal, onMount } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// SVG ViewBox configuration
const INITIAL_VIEWBOX = {
  x: -50,
  y: -50,
  width: 700,
  height: 700,
};
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

  // SVG pan and zoom state
  const [viewBox, setViewBox] = createSignal(INITIAL_VIEWBOX);
  const [isDragging, setIsDragging] = createSignal(false);
  const [lastMousePos, setLastMousePos] = createSignal({ x: 0, y: 0 });

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
    // Handle pan dragging
    if (isDragging() && event.buttons === 2) {
      const deltaX = event.clientX - lastMousePos().x;
      const deltaY = event.clientY - lastMousePos().y;

      const currentViewBox = viewBox();
      const { x, y, width, height } = currentViewBox;

      // Convert screen delta to SVG coordinates
      const svgElement = event.currentTarget as SVGElement;
      const rect = svgElement.getBoundingClientRect();
      const scaleX = width / Math.min(rect.width, rect.height);
      const scaleY = height / Math.min(rect.width, rect.height);

      const newX = x - deltaX * scaleX;
      const newY = y - deltaY * scaleY;

      setViewBox({ x: newX, y: newY, width, height });
      setLastMousePos({ x: event.clientX, y: event.clientY });
      return;
    }

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

  const handleMouseDown = (event: MouseEvent) => {
    if (event.button === 2) {
      // Right click
      event.preventDefault();
      setIsDragging(true);
      setLastMousePos({ x: event.clientX, y: event.clientY });
    }
  };

  const handleMouseUp = (event: MouseEvent) => {
    if (event.button === 2) {
      // Right click
      setIsDragging(false);
    }
  };

  const handleWheel = (event: WheelEvent) => {
    event.preventDefault();

    const svgElement = event.currentTarget as SVGElement;
    const rect = svgElement.getBoundingClientRect();

    // Get mouse position relative to SVG
    const mouseX =
      event.clientX - rect.left - Math.max(rect.width - rect.height, 0) / 2;
    const mouseY =
      event.clientY - rect.top - Math.max(rect.height - rect.width, 0) / 2;

    const currentViewBox = viewBox();
    const { x, y, width, height } = currentViewBox;

    // Convert mouse position to SVG coordinates
    const svgMouseX = x + (mouseX / Math.min(rect.width, rect.height)) * width;
    const svgMouseY = y + (mouseY / Math.min(rect.width, rect.height)) * height;

    // Zoom factor
    const zoomFactor = event.deltaY > 0 ? 1.1 : 1 / 1.1;

    const newWidth = width * zoomFactor;
    const newHeight = height * zoomFactor;

    // Adjust position to zoom around mouse position
    const newX = svgMouseX - (svgMouseX - x) * zoomFactor;
    const newY = svgMouseY - (svgMouseY - y) * zoomFactor;

    setViewBox({ x: newX, y: newY, width: newWidth, height: newHeight });
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
                    (a.k < 0 ? Infinity : a.k) - (b.k < 0 ? Infinity : b.k) ||
                    a.config.font_name.localeCompare(b.config.font_name),
                )}
                sessionDirectory={sessionDirectory() || ''}
                nearestFont={nearestFont()}
                onFontClick={setNearestFont}
              />
            </TabsContent>
          </Tabs>
        </div>

        <div class='col-span-7 flex min-h-0 flex-1 flex-col gap-3 rounded-md border bg-muted/20'>
          <svg
            class='size-full select-none'
            viewBox={`${viewBox().x} ${viewBox().y} ${viewBox().width} ${viewBox().height}`}
            xmlns='http://www.w3.org/2000/svg'
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onWheel={handleWheel}
            onContextMenu={(e) => e.preventDefault()}
          >
            <g>
              <rect
                x='0'
                y='0'
                width='600'
                height='600'
                fill='none'
                class='pointer-events-none stroke-border stroke-1'
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
                    const [minX, maxX] = vectors.reduce(
                      ([min, max], v) => [
                        Math.min(min, v.x),
                        Math.max(max, v.x),
                      ],
                      [Infinity, -Infinity],
                    );

                    const [minY, maxY] = vectors.reduce(
                      ([min, max], v) => [
                        Math.min(min, v.y),
                        Math.max(max, v.y),
                      ],
                      [Infinity, -Infinity],
                    );

                    return (
                      <For each={vectors}>
                        {(vectorData: FontVectorData) => {
                          const { x, y, k, config } = vectorData;
                          const scaledX = ((x - minX) / (maxX - minX)) * 600;
                          const scaledY = ((y - minY) / (maxY - minY)) * 600;

                          // Define cluster colors
                          const clusterColors = [
                            'fill-blue-500',
                            'fill-red-500',
                            'fill-yellow-500',
                            'fill-green-500',
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
                              ? 'fill-gray-300'
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
      </main>
    </>
  );
}

export default App;
