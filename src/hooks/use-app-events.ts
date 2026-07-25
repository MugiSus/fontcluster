import { onCleanup, onMount } from 'solid-js';
import { listen } from '@tauri-apps/api/event';
import { relaunch } from '@tauri-apps/plugin-process';
import { check } from '@tauri-apps/plugin-updater';
import { toast } from 'solid-sonner';
import { loadLatestSession, setCurrentSessionId } from '@/commands/session';
import { refreshPluginConnections } from '@/commands/plugins';
import { useI18n } from '@/i18n';
import { selectionHistory } from '@/selection-history';

/**
 * Registers application-wide backend event subscriptions at the app root.
 *
 * Model download events update one indefinite toast per session/model pair:
 * start and progress reuse its ID, completion replaces it with a finite
 * success toast, and cancellation removes it. A download failure only removes
 * the progress toast because the action that awaited the job owns the final
 * localized error. The tracking map supports cancellation cleanup; it is not
 * a second source of truth for model availability.
 */
export function useAppEvents() {
  const { t } = useI18n();
  const activeModelDownloads = new Map<string, string>();

  const handleAppUpdateCheck = async (options?: { isManual?: boolean }) => {
    try {
      if (options?.isManual)
        toast.info(t.updater.toasts.checking(), {
          duration: 3000,
        });

      const update = await check();

      if (update) {
        toast.info(t.updater.toasts.available({ version: update.version }), {
          description: t.updater.toasts.downloading(),
          duration: 3000,
        });

        await update.downloadAndInstall();
        toast.success(t.updater.toasts.installed(), {
          description: t.updater.toasts.applyOnLaunch(),
          action: {
            label: t.updater.toasts.restart(),
            onClick: async () => {
              await relaunch();
            },
          },
          duration: Infinity,
        });

        return;
      }

      if (options?.isManual)
        toast.info(t.updater.toasts.upToDate(), {
          duration: 3000,
        });
    } catch (error) {
      console.error('Failed to check for updates:', error);

      if (options?.isManual) {
        toast.error(t.updater.toasts.failed(), {
          description: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  onMount(() => {
    const listenWithCleanup = <T>(
      event: string,
      handler: (event: { payload: T }) => void,
    ) => {
      const unlistenPromise = listen(event, handler);

      onCleanup(async () => {
        const cleanup = await unlistenPromise;
        cleanup();
      });
    };

    loadLatestSession();

    refreshPluginConnections();
    const pluginPollId = window.setInterval(refreshPluginConnections, 1000);
    onCleanup(() => window.clearInterval(pluginPollId));

    listenWithCleanup<string>('clustering_complete', (event) => {
      console.log('Clustering completed for session:', event.payload);
    });

    listenWithCleanup<{
      sessionId: string;
      modelId: string;
      totalBytes: number;
    }>('model_download_started', (event) => {
      const toastId = `model-download-${event.payload.sessionId}-${event.payload.modelId}`;
      activeModelDownloads.set(toastId, event.payload.sessionId);
      toast.loading(
        t.jobs.toasts.modelDownloadStarted({ model: event.payload.modelId }),
        { id: toastId, duration: Infinity },
      );
    });

    listenWithCleanup<{
      sessionId: string;
      modelId: string;
      downloadedBytes: number;
      totalBytes: number;
    }>('model_download_progress', (event) => {
      const percent = event.payload.totalBytes
        ? Math.min(
            100,
            Math.round(
              (event.payload.downloadedBytes / event.payload.totalBytes) * 100,
            ),
          )
        : 0;
      toast.loading(
        t.jobs.toasts.modelDownloadStarted({ model: event.payload.modelId }),
        {
          id: `model-download-${event.payload.sessionId}-${event.payload.modelId}`,
          description: t.jobs.toasts.modelDownloadProgress({
            percent: String(percent),
          }),
          duration: Infinity,
        },
      );
    });

    listenWithCleanup<{
      sessionId: string;
      modelId: string;
      totalBytes: number;
    }>('model_download_completed', (event) => {
      const toastId = `model-download-${event.payload.sessionId}-${event.payload.modelId}`;
      activeModelDownloads.delete(toastId);
      toast.dismiss(toastId);
      toast.success(
        t.jobs.toasts.modelDownloadCompleted({
          model: event.payload.modelId,
        }),
        { duration: 5000 },
      );
    });

    listenWithCleanup<{ sessionId: string; modelId: string }>(
      'model_download_failed',
      (event) => {
        const toastId = `model-download-${event.payload.sessionId}-${event.payload.modelId}`;
        activeModelDownloads.delete(toastId);
        toast.dismiss(toastId);
      },
    );

    listenWithCleanup<string | null>('jobs_cancelled', (event) => {
      for (const [toastId, sessionId] of activeModelDownloads) {
        if (event.payload !== null && event.payload !== sessionId) continue;
        toast.dismiss(toastId);
        activeModelDownloads.delete(toastId);
      }
    });

    listenWithCleanup<string>('all_jobs_complete', (event) => {
      console.log(
        'All jobs completed successfully for session:',
        event.payload,
      );
      toast.success(t.jobs.toasts.completed(), {
        id: `job-complete-${event.payload}`,
        action: {
          label: t.jobs.toasts.view(),
          onClick: () => setCurrentSessionId(event.payload),
        },
        duration: 30000,
      });
    });

    listenWithCleanup('refresh-requested', () => {
      window.location.reload();
    });

    listenWithCleanup('check-update-requested', () => {
      handleAppUpdateCheck({ isManual: true });
    });

    listenWithCleanup('undo-history-requested', () => {
      selectionHistory.undo();
    });

    listenWithCleanup('redo-history-requested', () => {
      selectionHistory.redo();
    });

    handleAppUpdateCheck();
  });
}
