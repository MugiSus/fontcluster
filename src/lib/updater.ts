import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { toast } from 'solid-sonner';

export async function checkForAppUpdates(isManual = false) {
  try {
    const update = await check();

    if (update) {
      toast.info(`New version ${update.version} is available!`, {
        description: 'Downloading and installing update...',
        duration: 5000,
      });

      await update.downloadAndInstall();
      toast.success('Update installed!', {
        description: 'Update will be applied on the next launch.',
        action: {
          label: 'Restart Now',
          onClick: async () => {
            await relaunch();
          },
        },
        duration: Infinity,
      });

      return true;
    }

    if (isManual) {
      toast.info('You are using the latest version.', {
        duration: 3000,
      });
    }

    toast.success('Update installed!', {
      description: 'Update will be applied on the next launch.',
      action: {
        label: 'Restart Now',
        onClick: async () => {
          await relaunch();
        },
      },
      duration: Infinity,
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
