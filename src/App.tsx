import { invoke } from '@tauri-apps/api/core';
import { createSignal } from 'solid-js';
import { Button } from './components/ui/button';
import { TextField, TextFieldInput } from './components/ui/text-field';
import { ModeToggle } from './components/mode-toggle';
import { ArrowRight } from 'lucide-solid';

function App() {
  const [greetMessage, setGreetMessage] = createSignal('');
  const [name, setName] = createSignal('');

  const greet = async () => {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    setGreetMessage(await invoke('greet', { name: name() }));
  };

  return (
    <main class='flex min-h-screen flex-col justify-center gap-4 bg-background text-center'>
      <h1
        data-tauri-drag-region
        class='fixed top-0 flex w-full select-none items-center justify-center p-2 text-xs tracking-widest'
      >
        FontCluster
      </h1>
      <div class='fixed right-2 top-2'>
        <ModeToggle />
      </div>

      <form
        class='flex justify-center gap-2'
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
        <Button type='submit' class='flex gap-0 pr-3'>
          Greet
          <ArrowRight class='ml-2 size-4' />
        </Button>
      </form>
      <p>{greetMessage()}</p>
    </main>
  );
}

export default App;
