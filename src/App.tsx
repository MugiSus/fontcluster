import { createSignal } from "solid-js";
import logo from "./assets/logo.svg";
import { invoke } from "@tauri-apps/api/core";

function App() {
  const [greetMsg, setGreetMsg] = createSignal("");
  const [name, setName] = createSignal("");

  async function greet() {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    setGreetMsg(await invoke("greet", { name: name() }));
  }

  return (
    <main class="m-0 pt-[10vh] flex flex-col justify-center text-center font-sans text-base leading-6 font-normal text-neutral-900 bg-neutral-100 dark:text-neutral-100 dark:bg-neutral-800">
      <h1 class="text-center">Welcome to Tauri + Solid</h1>

      <div class="flex justify-center">
        <a href="https://vitejs.dev" target="_blank" class="font-medium text-link-blue no-underline hover:text-link-hover dark:hover:text-tauri-cyan">
          <img src="/vite.svg" class="h-24 p-6 will-change-[filter] transition-[filter] duration-750 hover:drop-shadow-vite" alt="Vite logo" />
        </a>
        <a href="https://tauri.app" target="_blank" class="font-medium text-link-blue no-underline hover:text-link-hover dark:hover:text-tauri-cyan">
          <img src="/tauri.svg" class="h-24 p-6 will-change-[filter] transition-[filter] duration-750 hover:drop-shadow-tauri" alt="Tauri logo" />
        </a>
        <a href="https://solidjs.com" target="_blank" class="font-medium text-link-blue no-underline hover:text-link-hover dark:hover:text-tauri-cyan">
          <img src={logo} class="h-24 p-6 will-change-[filter] transition-[filter] duration-750 hover:drop-shadow-solid" alt="Solid logo" />
        </a>
      </div>
      <p>Click on the Tauri, Vite, and Solid logos to learn more.</p>

      <form
        class="flex justify-center"
        onSubmit={(e) => {
          e.preventDefault();
          greet();
        }}
      >
        <input
          id="greet-input"
          class="mr-1 rounded-lg border border-transparent px-5 py-2.5 text-base font-medium font-sans text-neutral-900 bg-white transition-colors duration-[0.25s] shadow-[0_2px_2px_rgba(0,0,0,0.2)] outline-none dark:text-white dark:bg-button-bg-dark"
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder="Enter a name..."
        />
        <button type="submit" class="cursor-pointer rounded-lg border border-transparent px-5 py-2.5 text-base font-medium font-sans text-neutral-900 bg-white transition-colors duration-[0.25s] shadow-[0_2px_2px_rgba(0,0,0,0.2)] outline-none hover:border-button-hover active:border-button-hover active:bg-button-active-light dark:text-white dark:bg-button-bg-dark dark:active:bg-button-active-dark">Greet</button>
      </form>
      <p>{greetMsg()}</p>
    </main>
  );
}

export default App;
