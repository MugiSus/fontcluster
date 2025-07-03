import { invoke } from '@tauri-apps/api/core';
import { createSignal } from 'solid-js';
import { Button } from './components/ui/button';
import { TextField, TextFieldInput } from './components/ui/text-field';
import { ArrowRight } from 'lucide-solid';

function App() {
  const [greetMessage, setGreetMessage] = createSignal('');
  const [name, setName] = createSignal('');

  const greet = async () => {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    setGreetMessage(await invoke('greet', { name: name() }));
  };

  return (
    <main class='flex flex-1 flex-col items-stretch justify-center gap-4 p-8'>
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

      {greetMessage() && <p>{greetMessage()}</p>}
    </main>
  );
}

export default App;
