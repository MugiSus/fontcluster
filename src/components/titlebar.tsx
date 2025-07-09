import { ModeToggle } from './mode-toggle';

export function Titlebar() {
  return (
    <header
      data-tauri-drag-region
      class='sticky top-0 z-50 flex h-8 min-h-8 w-full select-none items-center justify-center'
    >
      <h1 data-tauri-drag-region class='mt-[3px] text-sm tracking-widest'>
        FontCluster
      </h1>
      <ModeToggle class='fixed right-1 top-1 mr-px size-6 rounded-full' />
    </header>
  );
}
