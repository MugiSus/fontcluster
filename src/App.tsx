import { createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";

function App() {
  const [greetMsg, setGreetMsg] = createSignal("");
  const [name, setName] = createSignal("");

  async function greet() {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    setGreetMsg(await invoke("greet", { name: name() }));
  }

  return (
    <main class="flex flex-col gap-4 justify-center text-center bg-neutral-100 dark:bg-neutral-800 min-h-screen p-4 text-neutral-900 dark:text-neutral-100">
      <h1 class="text-center font-bold text-2xl">Welcome to Tauri + Solid</h1>

      <div class="flex justify-center">
        <a href="https://vitejs.dev" target="_blank" class="font-medium text-blue-500 no-underline hover:text-blue-600 dark:hover:text-cyan-400">
          <img src="/vite.svg" class="h-32 p-6 transition-[filter] duration-700 hover:drop-shadow-[0_0_2rem_#747bff]" alt="Vite logo" />
        </a>
        <a href="https://tauri.app" target="_blank" class="font-medium text-blue-500 no-underline hover:text-blue-600 dark:hover:text-cyan-400">
          <img src="/tauri.svg" class="h-32 p-6 transition-[filter] duration-700 hover:drop-shadow-[0_0_2rem_#24c8db]" alt="Tauri logo" />
        </a>
        <a href="https://solidjs.com" target="_blank" class="font-medium text-blue-500 no-underline hover:text-blue-600 dark:hover:text-cyan-400">
          <img src="/solidjs.svg" class="h-32 p-6 transition-[filter] duration-700 hover:drop-shadow-[0_0_2rem_#2f5d90]" alt="Solid logo" />
        </a>
      </div>

      <p>Click on the Tauri, Vite, and Solid logos to learn more.</p>

      <form
        class="flex justify-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          greet();
        }}
      >
        <input
          id="greet-input"
          class="mr-1 rounded-lg border border-transparent px-5 py-2.5 text-base font-medium font-sans text-neutral-900 bg-white transition-colors duration-200 outline-none dark:text-white dark:bg-neutral-900/60"
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder="Enter a name..."
        />
        <button type="submit" class="cursor-pointer rounded-lg border border-transparent px-5 py-2.5 text-base font-medium font-sans text-neutral-900 bg-white transition-colors duration-200 shadow-[0_2px_2px_rgba(0,0,0,0.2)] outline-none hover:border-blue-600 active:border-blue-600 active:bg-neutral-200 dark:text-white dark:bg-neutral-900/60 dark:active:bg-neutral-900/40">Greet</button>
      </form>
      <p>{greetMsg()}</p>
    </main>
  );
}

export default App;
