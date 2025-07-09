import { For, createResource, createSignal, onMount } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Button } from './components/ui/button';
import { homeDir } from '@tauri-apps/api/path';
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

  const [homeDirPath] = createResource(() =>
    homeDir().catch((error) => {
      console.error('Failed to get home directory:', error);
      return '';
    }),
  );

  const [isGenerating, setIsGenerating] = createSignal(false);
  const [isVectorizing, setIsVectorizing] = createSignal(false);

  const [sampleText, setSampleText] = createSignal('');
  const [imageVersion, setImageVersion] = createSignal(Date.now());

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const text = formData.get('preview-text') as string;
    generateFontImages(text || 'A quick brown fox jumps over the lazy dog');
  };

  const generateFontImages = async (text: string) => {
    setIsGenerating(true);
    setIsVectorizing(true);
    try {
      // Run both processes in parallel
      const [imageResult, vectorResult] = await Promise.all([
        invoke<string>('generate_font_images', { text }),
        invoke<string>('vectorize_font_images'),
      ]);
      console.log('Image generation result:', imageResult);
      console.log('Vectorization result:', vectorResult);
    } catch (error) {
      console.error('Failed to generate or vectorize:', error);
    } finally {
      setIsGenerating(false);
      setIsVectorizing(false);
    }
  };

  onMount(() => {
    listen('font_generation_complete', () => {
      console.log('Font generation completed, refreshing images');
      setImageVersion(Date.now());
    });

    listen('vectorization_complete', () => {
      console.log('Vectorization completed');
      setIsVectorizing(false);
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
            disabled={isGenerating() || isVectorizing()}
            variant='default'
            class='flex items-center gap-2'
          >
            {isGenerating() ? (
              <>
                Generating Images...
                <LoaderIcon class='animate-spin' />
              </>
            ) : isVectorizing() ? (
              <>
                Vectorizing Images...
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
        <ul class='flex flex-col items-start gap-4 overflow-scroll rounded-md border bg-muted/10 p-4 px-5'>
          <For each={fonts() || []}>
            {(item) => (
              <li class='flex flex-col items-start gap-3'>
                <div class='sticky left-0 overflow-hidden text-ellipsis text-nowrap break-all text-sm font-light text-muted-foreground'>
                  {item}
                </div>
                <img
                  src={`${convertFileSrc(
                    `${homeDirPath() || ''}/Library/Application Support/FontCluster/${item.replace(/\s/g, '_').replace(/\//g, '_')}.png`,
                  )}?v=${imageVersion()}`}
                  alt={`Font preview for ${item}`}
                  class='block size-auto h-10 max-h-none max-w-none invert dark:invert-0'
                />
              </li>
            )}
          </For>
        </ul>
      </div>
      <div class='col-span-9 rounded-md border bg-muted/10'>
        <svg
          class='size-full'
          viewBox='0 0 800 600'
          xmlns='http://www.w3.org/2000/svg'
        >
          <For each={fonts() || []}>
            {() => {
              const x = Math.random() * 800;
              const y = Math.random() * 600;
              return <circle cx={x} cy={y} r='1' class='fill-foreground' />;
            }}
          </For>
        </svg>
      </div>
    </main>
  );
}

export default App;
