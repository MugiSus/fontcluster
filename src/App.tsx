import { For, createResource, createSignal, onMount } from 'solid-js';
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
import { FontConfig, CompressedFontVector } from './types/font';

function App() {
  const [fonts, { refetch: refetchFonts }] = createResource(() =>
    invoke<string>('get_session_fonts')
      .then((jsonStr) => JSON.parse(jsonStr) as FontConfig[])
      .catch((error) => {
        console.error('Failed to get session fonts:', error);
        return [] as FontConfig[];
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
  const [nearestFont, setNearestFont] = createSignal('');

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
      invoke<string>('get_compressed_vectors')
        .then((jsonStr) => JSON.parse(jsonStr) as CompressedFontVector[])
        .catch((error) => {
          console.error('Failed to get compressed vectors:', error);
          return [] as CompressedFontVector[];
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
      const element = document.querySelector(
        `[data-font-name="${nearestFont}"] > img`,
      );
      if (element) {
        element.scrollIntoView({ behavior: 'instant', block: 'center' });
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

      refetchSessionId(); // Trigger reload of compressed vectors
      refetchFonts(); // Trigger reload of font list
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
    });
  });

  return (
    <main class='grid min-h-0 flex-1 grid-cols-10 grid-rows-1 gap-4 px-4 pb-4'>
      <div class='col-span-3 flex flex-col gap-3'>
        <form
          onSubmit={handleSubmit}
          class='flex w-full flex-col items-stretch gap-3'
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
        <ul class='flex flex-col items-start gap-0 overflow-scroll rounded-md border bg-muted/20'>
          <For
            each={
              fonts()?.sort((a, b) => a.font_name.localeCompare(b.font_name)) ||
              []
            }
          >
            {(fontConfig: FontConfig) => (
              <li
                class={`flex cursor-pointer flex-col items-start gap-2 pb-4 pt-3 ${
                  nearestFont() === fontConfig.safe_name && 'bg-border'
                }`}
                data-font-name={fontConfig.safe_name}
                onClick={() => setNearestFont(fontConfig.safe_name)}
              >
                <div class='sticky left-0 overflow-hidden text-ellipsis text-nowrap break-all px-4 text-sm font-light text-muted-foreground'>
                  {fontConfig.font_name}
                </div>
                <img
                  class='block size-auto h-10 max-h-none max-w-none px-4 grayscale invert dark:invert-0'
                  src={convertFileSrc(
                    `${sessionDirectory() || ''}/${fontConfig.safe_name}/sample.png`,
                  )}
                  alt={`Font preview for ${fontConfig.font_name}`}
                />
              </li>
            )}
          </For>
        </ul>
      </div>
      <div class='col-span-7 rounded-md border bg-muted/20'>
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
            const vectors = compressedVectors() || [];
            console.log('Compressed vectors:', vectors, sessionId());

            // Calculate bounds once
            const allX = vectors.map((v) => v.vector[0]);
            const allY = vectors.map((v) => v.vector[1]);
            const minX = Math.min(...allX);
            const maxX = Math.max(...allX);
            const minY = Math.min(...allY);
            const maxY = Math.max(...allY);

            return (
              <For each={vectors}>
                {(vectorData: CompressedFontVector) => {
                  const { config, vector } = vectorData;
                  const [x, y, k] = vector;
                  const scaledX = ((x - minX) / (maxX - minX)) * 600;
                  const scaledY = ((y - minY) / (maxY - minY)) * 600;

                  // Define cluster colors
                  const clusterColors = [
                    'fill-red-500 stroke-red-700',
                    'fill-blue-500 stroke-blue-700',
                    'fill-green-500 stroke-green-700',
                    'fill-purple-500 stroke-purple-700',
                    'fill-orange-500 stroke-orange-700',
                    'fill-pink-500 stroke-pink-700',
                    'fill-teal-500 stroke-teal-700',
                    'fill-indigo-500 stroke-indigo-700',
                  ];

                  const clusterColor =
                    clusterColors[(k - 1) % clusterColors.length];

                  return (
                    <g>
                      <circle
                        cx={scaledX}
                        cy={scaledY}
                        r='3'
                        class={`stroke-1 ${
                          nearestFont() === config.safe_name
                            ? 'fill-yellow-300 stroke-yellow-500'
                            : clusterColor
                        }`}
                      />
                      <circle
                        cx={scaledX}
                        cy={scaledY}
                        r='48'
                        fill='transparent'
                        data-font-name={config.safe_name}
                        data-font-select-area
                      />
                      <text
                        x={scaledX}
                        y={scaledY - 8}
                        class={`pointer-events-none select-none fill-foreground text-xs ${
                          nearestFont() === config.safe_name ? 'font-bold' : ''
                        }`}
                        text-anchor='middle'
                      >
                        {nearestFont() === config.safe_name
                          ? config.font_name
                          : config.font_name.length > 12
                            ? config.font_name.substring(0, 12) + '…'
                            : config.font_name}
                      </text>
                    </g>
                  );
                }}
              </For>
            );
          })()}
        </svg>
      </div>
    </main>
  );
}

export default App;
