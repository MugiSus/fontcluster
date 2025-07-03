import { For } from 'solid-js';

function App() {
  return (
    <main class='grid min-h-0 flex-1 grid-cols-12 grid-rows-1 gap-4 px-4 pb-4'>
      <ul class='col-span-3 flex flex-col items-start gap-4 overflow-scroll rounded-md border bg-muted/10 px-6 py-4'>
        <For each={Array.from({ length: 80 })}>
          {() => (
            <li class='flex flex-col items-start gap-0'>
              <h2 class='text-2xl font-thin'>Chivo</h2>
              <div class='break-all text-sm font-light text-muted-foreground'>
                Lorem ipsum dolor sit amet, consectetur adipiscing elit.
              </div>
            </li>
          )}
        </For>
      </ul>
      <div class='col-span-9 rounded-md border bg-muted/10'>
        <svg class='size-full' viewBox='0 0 800 600' xmlns='http://www.w3.org/2000/svg'>
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
        </svg>
      </div>
    </main>
  );
}

export default App;
