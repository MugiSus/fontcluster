import { invoke } from '@tauri-apps/api/core';
import { createSignal } from 'solid-js';

function App() {
  const [greetMessage, setGreetMessage] = createSignal('');
  const [name, setName] = createSignal('');

  async function greet() {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    setGreetMessage(await invoke('greet', { name: name() }));
  }

  return (
    <main class='flex min-h-screen flex-col justify-center gap-4 bg-neutral-100 p-4 text-center text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100'>
      <h1 class='text-center text-2xl font-bold'>Welcome to Tauri + Solid</h1>

      <div class='flex justify-center'>
        <a
          href='https://vitejs.dev'
          target='_blank'
          class='font-medium text-blue-500 no-underline hover:text-blue-600 dark:hover:text-cyan-400'
        >
          <img
            src='/vite.svg'
            class='h-32 p-6 transition-[filter] duration-700 hover:drop-shadow-[0_0_2rem_#747bff]'
            alt='Vite logo'
          />
        </a>
        <a
          href='https://tauri.app'
          target='_blank'
          class='font-medium text-blue-500 no-underline hover:text-blue-600 dark:hover:text-cyan-400'
        >
          <img
            src='/tauri.svg'
            class='h-32 p-6 transition-[filter] duration-700 hover:drop-shadow-[0_0_2rem_#24c8db]'
            alt='Tauri logo'
          />
        </a>
        <a
          href='https://solidjs.com'
          target='_blank'
          class='font-medium text-blue-500 no-underline hover:text-blue-600 dark:hover:text-cyan-400'
        >
          <img
            src='/solidjs.svg'
            class='h-32 p-6 transition-[filter] duration-700 hover:drop-shadow-[0_0_2rem_#2f5d90]'
            alt='Solid logo'
          />
        </a>
      </div>

      <p>Click on the Tauri, Vite, and Solid logos to learn more.</p>

      <form
        class='flex justify-center gap-1'
        onSubmit={(event) => {
          event.preventDefault();
          greet();
        }}
      >
        <input
          id='greet-input'
          class='mr-1 rounded-lg border border-transparent bg-white px-5 py-2.5 font-sans text-base font-medium text-neutral-900 transition-colors duration-200 outline-none dark:bg-neutral-900/60 dark:text-white'
          onChange={(event) => setName(event.currentTarget.value)}
          placeholder='Enter a name...'
        />
        <button
          type='submit'
          class='cursor-pointer rounded-lg border border-transparent bg-white px-5 py-2.5 font-sans text-base font-medium text-neutral-900 shadow-[0_2px_2px_rgba(0,0,0,0.2)] transition-colors duration-200 outline-none hover:border-blue-600 active:border-blue-600 active:bg-neutral-200 dark:bg-neutral-900/60 dark:text-white dark:active:bg-neutral-900/40'
        >
          Greet
        </button>
      </form>
      <p>{greetMessage()}</p>
    </main>
  );
}

export default App;
