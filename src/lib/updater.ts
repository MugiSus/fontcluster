import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { toast } from 'solid-sonner';

export async function checkForAppUpdates(isManual = false) {
  try {
    if (isManual)
      toast.info('Checking for updates...', {
        duration: 3000,
      });

    const update = await check();

    if (update) {
      toast.info(`New version ${update.version} is available!`, {
        description: 'Downloading and installing update...',
        duration: 3000,
      });

      await update.downloadAndInstall();
      toast.success('Update installed!', {
        description: 'Update will be applied on the next launch.',
        action: {
          label: 'Restart',
          onClick: async () => {
            await relaunch();
          },
        },
        duration: Infinity,
      });

      return true;
    }

    if (isManual)
      toast.info("You're using the latest version. All set!", {
        duration: 3000,
      });

    return false;
  } catch (error) {
    console.error('Failed to check for updates:', error);

    if (isManual) {
      toast.error('Failed to check for updates', {
        description: error instanceof Error ? error.message : String(error),
      });
    }

    return false;
  }
}
