import { For, createResource, createSignal, onMount, Show } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Button } from './components/ui/button';
import {
  TextField,
  TextFieldInput,
  TextFieldLabel,
} from './components/ui/text-field';
import { ArrowRightIcon, LoaderIcon } from 'lucide-solid';

function App() {
  const [fonts] = createResource(() =>
    invoke<string[]>('get_system_fonts').catch((error) => {
      console.error('Failed to get system fonts:', error);
      return [];
    }),
  );

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

  const [sampleText, setSampleText] = createSignal('');

  const [sessionDirectory] = createResource(
    () => isCompressing() === false && sessionId(),
    () =>
      invoke<string>('get_session_directory').catch((error) => {
        console.error('Failed to get session directory:', error);
        return '';
      }),
  );

  const [compressedVectors] = createResource(
    () => isCompressing() === false && sessionId(),
    () =>
      invoke<[string, number, number][]>('get_compressed_vectors').catch(
        (error) => {
          console.error('Failed to get compressed vectors:', error);
          return [];
        },
      ),
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
      const element = document.querySelector(
        `[data-font-name="${nearestFont.replace(/\s/g, '_').replace(/\//g, '_')}"]`,
      );
      if (element) {
        element.scrollIntoView({ behavior: 'instant', block: 'start' });
      }
    }
  };

  const generateFontImages = async (text: string) => {
    setIsGenerating(true);
    try {
      // Step 0: Create new session for this clustering operation
      const sessionResult = await invoke<string>('create_new_session');
      console.log('Session creation result:', sessionResult);

      // Step 1: Generate font images
      const imageResult = await invoke<string>('generate_font_images', {
        text,
      });
      console.log('Image generation result:', imageResult);

      // Step 2: Vectorize images
      setIsGenerating(false);
      setIsVectorizing(true);
      const vectorResult = await invoke<string>('vectorize_font_images');
      console.log('Vectorization result:', vectorResult);

      // Step 3: Compress vectors to 2D
      setIsVectorizing(false);
      setIsCompressing(true);
      const compressionResult = await invoke<string>('compress_vectors_to_2d');
      console.log('Compression result:', compressionResult);
    } catch (error) {
      console.error('Failed to process fonts:', error);
    } finally {
      setIsGenerating(false);
      setIsVectorizing(false);
      setIsCompressing(false);
    }
  };

  onMount(() => {
    listen('font_generation_complete', () => {
      console.log('Font generation completed, refreshing images');
    });

    listen('vectorization_complete', () => {
      console.log('Vectorization completed');
    });

    listen('compression_complete', () => {
      console.log('Compression completed');
      refetchSessionId(); // Trigger reload of compressed vectors
    });
  });

  return (
    <main class='grid min-h-0 flex-1 grid-cols-12 grid-rows-1 gap-4 px-4 pb-4'>
      <div class='col-span-3 flex flex-col gap-3'>
        <form
          onSubmit={handleSubmit}
          class='flex w-full flex-col items-stretch gap-3'
        >
          <TextField class='grid w-full max-w-sm items-center gap-2'>
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
            disabled={isGenerating() || isVectorizing() || isCompressing()}
            variant='default'
            class='flex items-center gap-2'
          >
            {isGenerating() ? (
              <>
                Generating Images... (1/3)
                <LoaderIcon class='animate-spin' />
              </>
            ) : isVectorizing() ? (
              <>
                Vectorizing Images... (2/3)
                <LoaderIcon class='animate-spin' />
              </>
            ) : isCompressing() ? (
              <>
                Compressing Vectors... (3/3)
                <LoaderIcon class='animate-spin' />
              </>
            ) : (
              <>
                Clusterize with this preview text
                <ArrowRightIcon />
              </>
            )}
          </Button>
        </form>
        <ul class='flex flex-col items-start gap-4 overflow-scroll rounded-md border bg-muted/20 p-4 px-5'>
          <For each={fonts() || []}>
            {(item) => (
              <li
                class='flex flex-col items-start gap-3'
                data-font-name={item.replace(/\s/g, '_').replace(/\//g, '_')}
              >
                <div class='sticky left-0 overflow-hidden text-ellipsis text-nowrap break-all text-sm font-light text-muted-foreground'>
                  {item}
                </div>
                <img
                  src={convertFileSrc(
                    `${sessionDirectory() || ''}/Images/${item.replace(/\s/g, '_').replace(/\//g, '_')}.png`,
                  )}
                  alt={`Font preview for ${item}`}
                  class='block size-auto h-10 max-h-none max-w-none grayscale invert dark:invert-0'
                />
              </li>
            )}
          </For>
        </ul>
      </div>
      <div class='col-span-9 rounded-md border bg-muted/20'>
        <svg
          class='size-full select-none'
          viewBox='0 0 800 600'
          xmlns='http://www.w3.org/2000/svg'
          onMouseMove={handleMouseMove}
        >
          {(() => {
            const vectors = compressedVectors() || [];

            // Calculate bounds once
            const allX = vectors.map(([, x]) => x);
            const allY = vectors.map(([, , y]) => y);
            const minX = Math.min(...allX);
            const maxX = Math.max(...allX);
            const minY = Math.min(...allY);
            const maxY = Math.max(...allY);
            const padding = 50;

            return (
              <Show when={vectors.length > 0}>
                <For each={vectors}>
                  {([fontName, x, y]) => {
                    const scaledX =
                      padding +
                      ((x - minX) / (maxX - minX)) * (800 - 2 * padding);
                    const scaledY =
                      padding +
                      ((y - minY) / (maxY - minY)) * (600 - 2 * padding);

                    return (
                      <g>
                        <circle
                          cx={scaledX}
                          cy={scaledY}
                          r='3'
                          class='fill-blue-500 stroke-blue-700 stroke-1'
                        />
                        <circle
                          cx={scaledX}
                          cy={scaledY}
                          r='48'
                          fill='transparent'
                          data-font-name={fontName}
                          data-font-select-area
                        />
                        <text
                          x={scaledX}
                          y={scaledY - 8}
                          class='pointer-events-none select-none fill-foreground font-mono text-xs'
                          text-anchor='middle'
                        >
                          {fontName.length > 12
                            ? fontName.substring(0, 12) + '…'
                            : fontName}
                        </text>
                      </g>
                    );
                  }}
                </For>
              </Show>
            );
          })()}
        </svg>
      </div>
    </main>
  );
}

export default App;
