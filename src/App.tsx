import { For, createResource, createSignal } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { Button } from './components/ui/button';
import { homeDir } from '@tauri-apps/api/path';

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

  const generateFontImages = () => {
    setIsGenerating(true);
    invoke<string>('generate_font_images')
      .catch((error) => {
        console.error('Failed to generate font images:', error);
      })
      .finally(() => {
        setIsGenerating(false);
      });
  };

  return (
    <main class='grid min-h-0 flex-1 grid-cols-12 grid-rows-1 gap-4 px-4 pb-4'>
      <div class='col-span-3 flex flex-col gap-2'>
        <Button
          onClick={generateFontImages}
          disabled={isGenerating()}
          class=''
          variant='outline'
        >
          {isGenerating() ? 'Generating...' : 'Generate Font Images'}
        </Button>
        <ul class='flex flex-col items-start gap-4 overflow-scroll rounded-md border bg-muted/10 px-6 py-4'>
          <For each={fonts() || []}>
            {(item) => (
              <li class='flex flex-col items-start gap-0'>
                <div class='overflow-hidden text-ellipsis text-nowrap break-all text-sm font-light text-muted-foreground'>
                  {item}
                </div>
                <img
                  src={convertFileSrc(
                    `${homeDirPath() || ''}/Library/Application Support/FontCluster/${item.replace(/\s/g, '_').replace(/\//g, '_')}.png`,
                  )}
                  alt={`Font preview for ${item}`}
                  class='mt-2'
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
