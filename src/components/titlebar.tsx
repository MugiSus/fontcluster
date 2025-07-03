import { ModeToggle } from './mode-toggle';

export function Titlebar() {
  return (
    <header
      data-tauri-drag-region
      class='flex w-full select-none items-center justify-center p-2 text-xs tracking-widest'
    >
      <h1 data-tauri-drag-region>FontCluster</h1>
      <ModeToggle class='fixed right-1 top-1 mr-px' />
    </header>
  );
}
