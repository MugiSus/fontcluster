import { For } from 'solid-js';

function App() {
  return (
    <main class='grid h-[688px] flex-1 grid-cols-12 grid-rows-1 gap-4 px-4 pb-4'>
      <ul class='col-span-3 flex flex-col items-start gap-4 overflow-scroll rounded-md border bg-muted/10 px-6 py-4'>
        <For each={Array.from({ length: 40 })}>
          {() => (
            <li class='flex flex-col items-start gap-0.5'>
              <h2 class='text-2xl font-light'>Chivo</h2>
              <div class='break-all text-sm text-muted-foreground'>
                Lorem ipsum dolor sit amet, consectetur adipiscing elit.
              </div>
            </li>
          )}
        </For>
      </ul>
      <div class='col-span-9 rounded-md border bg-muted/10' />
    </main>
  );
}

export default App;
