import { createSignal, onCleanup, onMount } from 'solid-js';
import { getCurrentWindow } from '@tauri-apps/api/window';

export function useIsFullscreen() {
  const [isFullscreen, setIsFullscreen] = createSignal(false);
  const appWindow = getCurrentWindow();

  const sync = async () => {
    setIsFullscreen(await appWindow.isFullscreen());
  };

  onMount(async () => {
    await sync();
    const unlisten = await appWindow.onResized(sync);
    onCleanup(unlisten);
  });

  return isFullscreen;
}
