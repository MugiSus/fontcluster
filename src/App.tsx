import { For, createResource } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';

function App() {
  const [fonts] = createResource(async () => {
    try {
      return await invoke<string[]>('get_system_fonts');
    } catch (error) {
      console.error('Failed to get system fonts:', error);
      return [];
    }
  });

  return (
    <main class='grid min-h-0 flex-1 grid-cols-12 grid-rows-1 gap-4 px-4 pb-4'>
      <ul class='col-span-3 flex flex-col items-start gap-4 overflow-scroll rounded-md border bg-muted/10 px-6 py-4'>
        <For each={fonts() || []}>
          {(item) => (
            <li class='flex flex-col items-start gap-0'>
              <h2
                class='break-all text-2xl font-thin'
                style={{
                  'font-family': `"${item}", sans-serif`,
                }}
              >
                {item}
              </h2>
              <div class='break-all text-sm font-light text-muted-foreground'>
                {item} is a system font available on this Mac. Click to preview
                different styles and weights.
              </div>
            </li>
          )}
        </For>
      </ul>
      <div class='col-span-9 rounded-md border bg-muted/10'>
        <svg
          class='size-full'
          viewBox='0 0 800 600'
          xmlns='http://www.w3.org/2000/svg'
        >
          <circle cx='120' cy='80' r='1' fill='white' />
          <circle cx='350' cy='150' r='1' fill='white' />
          <circle cx='600' cy='200' r='1' fill='white' />
          <circle cx='200' cy='300' r='1' fill='white' />
          <circle cx='750' cy='120' r='1' fill='white' />
          <circle cx='450' cy='400' r='1' fill='white' />
          <circle cx='100' cy='500' r='1' fill='white' />
          <circle cx='680' cy='350' r='1' fill='white' />
          <circle cx='300' cy='450' r='1' fill='white' />
          <circle cx='550' cy='80' r='1' fill='white' />
          <circle cx='80' cy='250' r='1' fill='white' />
          <circle cx='400' cy='550' r='1' fill='white' />
          <circle cx='720' cy='480' r='1' fill='white' />
          <circle cx='180' cy='180' r='1' fill='white' />
          <circle cx='500' cy='300' r='1' fill='white' />
          <circle cx='650' cy='450' r='1' fill='white' />
          <circle cx='250' cy='100' r='1' fill='white' />
          <circle cx='480' cy='250' r='1' fill='white' />
          <circle cx='150' cy='400' r='1' fill='white' />
          <circle cx='600' cy='520' r='1' fill='white' />
          <circle cx='320' cy='60' r='1' fill='white' />
          <circle cx='700' cy='180' r='1' fill='white' />
          <circle cx='160' cy='320' r='1' fill='white' />
          <circle cx='580' cy='380' r='1' fill='white' />
          <circle cx='40' cy='420' r='1' fill='white' />
          <circle cx='760' cy='280' r='1' fill='white' />
          <circle cx='380' cy='520' r='1' fill='white' />
          <circle cx='220' cy='150' r='1' fill='white' />
          <circle cx='620' cy='90' r='1' fill='white' />
          <circle cx='140' cy='550' r='1' fill='white' />
          <circle cx='520' cy='210' r='1' fill='white' />
          <circle cx='280' cy='370' r='1' fill='white' />
          <circle cx='60' cy='180' r='1' fill='white' />
          <circle cx='660' cy='310' r='1' fill='white' />
          <circle cx='420' cy='140' r='1' fill='white' />
          <circle cx='740' cy='360' r='1' fill='white' />
          <circle cx='340' cy='480' r='1' fill='white' />
          <circle cx='180' cy='40' r='1' fill='white' />
          <circle cx='540' cy='460' r='1' fill='white' />
          <circle cx='260' cy='220' r='1' fill='white' />
          <circle cx='680' cy='120' r='1' fill='white' />
          <circle cx='120' cy='380' r='1' fill='white' />
          <circle cx='500' cy='50' r='1' fill='white' />
          <circle cx='360' cy='340' r='1' fill='white' />
          <circle cx='780' cy='440' r='1' fill='white' />
          <circle cx='240' cy='500' r='1' fill='white' />
          <circle cx='640' cy='160' r='1' fill='white' />
          <circle cx='100' cy='280' r='1' fill='white' />
          <circle cx='460' cy='320' r='1' fill='white' />
          <circle cx='720' cy='240' r='1' fill='white' />
          <circle cx='320' cy='420' r='1' fill='white' />
          <circle cx='580' cy='110' r='1' fill='white' />
          <circle cx='200' cy='480' r='1' fill='white' />
          <circle cx='520' cy='350' r='1' fill='white' />
          <circle cx='80' cy='150' r='1' fill='white' />
          <circle cx='440' cy='580' r='1' fill='white' />
          <circle cx='300' cy='240' r='1' fill='white' />
          <circle cx='660' cy='400' r='1' fill='white' />
          <circle cx='140' cy='360' r='1' fill='white' />
          <circle cx='560' cy='180' r='1' fill='white' />
          <circle cx='380' cy='460' r='1' fill='white' />
          <circle cx='220' cy='80' r='1' fill='white' />
          <circle cx='600' cy='340' r='1' fill='white' />
          <circle cx='160' cy='520' r='1' fill='white' />
        </svg>
      </div>
    </main>
  );
}

export default App;
