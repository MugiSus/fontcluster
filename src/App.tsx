import { For, createResource, createSignal } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { Button } from './components/ui/button';
import { homeDir } from '@tauri-apps/api/path';
import { TextField, TextFieldInput } from './components/ui/text-field';
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
  const [sampleText, setSampleText] = createSignal('');

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const text = formData.get('sample-text') as string;
    setSampleText(text || 'A quick brown fox jumps over the lazy dog');
    generateFontImages(text || 'A quick brown fox jumps over the lazy dog');
  };

  const generateFontImages = (text: string) => {
    setIsGenerating(true);
    invoke<string>('generate_font_images', { text })
      .catch((error) => {
        console.error('Failed to generate font images:', error);
      })
      .finally(() => {
        setIsGenerating(false);
      });
  };

  return (
    <main class='grid min-h-0 flex-1 grid-cols-12 grid-rows-1 gap-4 px-4 pb-4'>
      <div class='col-span-3 flex flex-col gap-3'>
        <form onSubmit={handleSubmit} class='flex w-full items-center gap-3'>
          <TextField class='flex-1'>
            <TextFieldInput
              type='text'
              name='sample-text'
              id='sample-text'
              value={sampleText()}
              onInput={(e) => setSampleText(e.currentTarget.value)}
              placeholder='A quick brown fox jumps over the lazy dog'
            />
          </TextField>
          <Button
            type='submit'
            disabled={isGenerating()}
            class='size-10'
            variant='outline'
          >
            {isGenerating() ? (
              <LoaderIcon class='animate-spin' />
            ) : (
              <ArrowRightIcon />
            )}
          </Button>
        </form>
        <ul class='flex flex-col items-start gap-4 overflow-scroll rounded-md border bg-muted/10 px-6 py-4'>
          <For each={fonts() || []}>
            {(item) => (
              <li class='flex flex-col items-start gap-0'>
                <div class='sticky left-0 overflow-hidden text-ellipsis text-nowrap break-all text-sm font-light text-muted-foreground'>
                  {item}
                </div>
                <img
                  src={convertFileSrc(
                    `${homeDirPath() || ''}/Library/Application Support/FontCluster/${item.replace(/\s/g, '_').replace(/\//g, '_')}.png`,
                  )}
                  alt={`Font preview for ${item}`}
                  class='block size-auto h-10 max-h-none max-w-none'
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
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
