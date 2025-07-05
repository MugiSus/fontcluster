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
              <div class='break-all text-sm font-light text-muted-foreground'>
                {item}
              </div>
              <h2
                class='break-all text-2xl font-normal leading-tight'
                style={{
                  'font-family': `"${item}", sans-serif`,
                }}
              >
                {item}
              </h2>
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
          {/* <For each={fonts() || []}>
            {() => {
              const x = Math.random() * 800;
              const y = Math.random() * 600;
              return <circle cx={x} cy={y} r='1' class='fill-foreground' />;
            }}
          </For> */}
        </svg>
      </div>
    </main>
  );
}

export default App;
