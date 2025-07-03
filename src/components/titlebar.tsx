import { ModeToggle } from './mode-toggle';

export function Titlebar() {
  return (
    <header
      data-tauri-drag-region
      class='flex h-8 w-full select-none items-center justify-center border-b'
    >
      <h1 data-tauri-drag-region class='mt-0.5 text-xs tracking-widest'>
        FontCluster
      </h1>
      <ModeToggle class='fixed right-1 top-1 mr-px' />
    </header>
  );
}
