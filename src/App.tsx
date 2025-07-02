import { invoke } from '@tauri-apps/api/core';
import { createSignal } from 'solid-js';
import { Button } from './components/button';
import { TextField, TextFieldInput } from './components/text-field';

function App() {
  const [greetMessage, setGreetMessage] = createSignal('');
  const [name, setName] = createSignal('');

  const greet = async () => {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    setGreetMessage(await invoke('greet', { name: name() }));
  };

  return (
    <main class='flex min-h-screen flex-col justify-center gap-4 bg-background bg-neutral-100 p-4 text-center'>
      <div data-tauri-drag-region class='fixed left-0 right-0 top-0 z-50 h-4' />
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
        <TextField class='grid w-full max-w-sm items-center gap-1.5'>
          <TextFieldInput
            type='text'
            id='name'
            placeholder='Enter your name...'
            onChange={(event) => setName(event.currentTarget.value)}
          />
        </TextField>
        <Button type='submit' variant='secondary'>
          Greet
        </Button>
      </form>
      <p>{greetMessage()}</p>
    </main>
  );
}

export default App;
