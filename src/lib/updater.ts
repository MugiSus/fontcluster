import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { toast } from 'solid-sonner';
import type { Translate } from '@/i18n';

interface CheckForUpdatesOptions {
  isManual?: boolean;
}

export async function checkForAppUpdates(
  t: Translate,
  options?: CheckForUpdatesOptions,
) {
  try {
    if (options?.isManual)
      toast.info(t('updater.checking'), {
        duration: 3000,
      });

    const update = await check();

    if (update) {
      toast.info(t('updater.available', { version: update.version }), {
        description: t('updater.downloading'),
        duration: 3000,
      });

      await update.downloadAndInstall();
      toast.success(t('updater.installed'), {
        description: t('updater.applyOnLaunch'),
        action: {
          label: t('updater.restart'),
          onClick: async () => {
            await relaunch();
          },
        },
        duration: Infinity,
      });

      return true;
    }

    if (options?.isManual)
      toast.info(t('updater.upToDate'), {
        duration: 3000,
      });

    return false;
  } catch (error) {
    console.error('Failed to check for updates:', error);

    if (options?.isManual) {
      toast.error(t('updater.failed'), {
        description: error instanceof Error ? error.message : String(error),
      });
    }

    return false;
  }
}
