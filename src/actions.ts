import { batch, onCleanup, onMount } from 'solid-js';
import { reconcile } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { relaunch } from '@tauri-apps/plugin-process';
import { check } from '@tauri-apps/plugin-updater';
import { toast } from 'solid-sonner';
import { useI18n } from '@/i18n';
import {
  setGraphSessionPayload,
  type GraphSessionPayload,
} from '@/actions/graph';
import { appState, setAppState } from './store';
import { getConnectedPlugins, sendFontToPlugin } from './lib/plugin-bridge';
import { selectionHistory } from './selection-history';
import { type FontItem } from './types/font';
import { type AlgorithmConfig, type ProcessStatus } from './types/session';

export {
  setActiveGraphWeights,
  setGraphMode,
  setSelectedDendrogramNodeSample,
  setSelectedFontKey,
  setVisibleGraphClusters,
} from '@/actions/graph';

// --- Session loading ---

/**
 * Loads a session by id: clears the current display payload, then pulls its
 * config, sample directory and font items from the backend. The active session
 * is identified by `appState.session.session_id`, so there is no separate
 * "requested id" to keep in sync.
 */
export const loadSession = async (id: string) => {
  if (!id) return;
  setAppState('ui', 'isSessionLoading', true);
  batch(() => {
    setAppState('ui', 'selectedDendrogramNode', null);
    setAppState('sessionDirectory', '');
    setAppState('dendrogram', null);
    setAppState('fonts', 'data', reconcile({}));
  });
  try {
    const payload = await invoke<GraphSessionPayload>('load_session', {
      sessionId: id,
    });
    setGraphSessionPayload({
      ...payload,
      directory: payload.directory || '',
      dendrogram: payload.dendrogram ?? null,
    });
  } catch (error) {
    console.error('Failed to load session:', error);
  } finally {
    setAppState('ui', 'isSessionLoading', false);
  }
};

/** Reloads the currently active session (e.g. after a job mutates it). */
export const refreshSession = () => loadSession(appState.session.session_id);

export const setHoveredFontKey = (key: string | null) =>
  setAppState('ui', 'hoveredFontKey', key);

export const setSentFontItemKey = (key: string | null) =>
  setAppState('ui', 'sentFontItemKey', key);

/**
 * Sends a font to the connected plugins and records it as the last sent item.
 * The preview text falls back through the list field, the session render text,
 * then a constant. Shared by the list and the graph's selected-font actions so
 * both surfaces apply fonts identically. Resolves on success / rejects on
 * failure so the calling surface can show its own localized feedback toast.
 */
export const applyFontToPlugins = (item: FontItem) => {
  const previewText =
    appState.ui.listPreviewText ||
    appState.session.algorithm.rendering.text ||
    'FontCluster';
  return sendFontToPlugin(item.meta, previewText).then(() =>
    setSentFontItemKey(item.meta.safe_name),
  );
};

export const setListPreviewText = (text: string) =>
  setAppState('ui', 'listPreviewText', text);

/**
 * Syncs the connected-plugin list from the backend into the store. This store
 * slice is the single source of truth for plugin connectivity; the connections
 * menu and the list icons both read from it. Polling is owned by the app root
 * (see `useAppEvents`), never by a UI component.
 */
export const refreshPluginConnections = async () => {
  try {
    const { plugins } = await getConnectedPlugins();
    setAppState(
      'plugins',
      'connections',
      reconcile(plugins, { key: 'plugin_id' }),
    );
  } catch (error) {
    console.error('Failed to load plugin connections:', error);
    setAppState('plugins', 'connections', []);
  }
};

export const setCurrentSessionId = async (id: string) => {
  const isSessionSwitch = appState.session.session_id !== id;
  if (isSessionSwitch) {
    batch(() => {
      setAppState('ui', 'selectedFontKey', null);
      setAppState('ui', 'selectedDendrogramNode', null);
      setAppState('ui', 'hoveredFontKey', null);
      setAppState('ui', 'sentFontItemKey', null);
    });
  }
  selectionHistory.reset();
  await loadSession(id);
};

/**
 * Persists a session's user-given title (empty clears it back to the
 * sample-text fallback) and mirrors it into the active session's store slice
 * when the renamed session is the one currently loaded. Rejects on failure so
 * the calling surface can show its own localized feedback.
 */
export const updateSessionTitle = async (
  sessionId: string,
  newTitle: string,
) => {
  await invoke('update_session_title', { sessionId, newTitle });
  if (appState.session.session_id === sessionId) {
    setAppState('session', 'title', newTitle);
  }
};

export const runProcessingJobs = async (
  algorithm: Partial<AlgorithmConfig>,
  sessionId?: string,
  overrideStatus?: ProcessStatus,
) => {
  selectionHistory.reset();

  const result = await invoke<string>('run_jobs', {
    algorithm,
    sessionId,
    overrideStatus,
  });
  console.log('Complete pipeline result:', result);
  if (sessionId && sessionId === appState.session.session_id) {
    await refreshSession();
  }
};

export const stopJobs = async (sessionId?: string) => {
  try {
    await invoke('stop_jobs', { sessionId });
  } catch (error) {
    console.error('Failed to stop jobs:', error);
  }
};

// --- Initialization ---

const loadLatestSessionId = async () => {
  try {
    const latestSessionId = await invoke<string | null>(
      'get_latest_session_id',
    );
    if (latestSessionId) {
      console.log('Setting latest session ID on startup:', latestSessionId);
      await setCurrentSessionId(latestSessionId);
    }
  } catch (error) {
    console.error('Failed to get latest session ID:', error);
  }
};

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

    // Load latest session ID on startup
    loadLatestSessionId();

    // Poll connected plugins (single owner of plugin connectivity state)
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

    listenWithCleanup<{ sessionId: string; modelId: string; error: string }>(
      'model_download_failed',
      (event) => {
        const toastId = `model-download-${event.payload.sessionId}-${event.payload.modelId}`;
        activeModelDownloads.delete(toastId);
        toast.dismiss(toastId);
        toast.error(
          t.jobs.toasts.modelDownloadFailed({ model: event.payload.modelId }),
          {
            description: event.payload.error,
            duration: 8000,
          },
        );
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

    // Check for updates automatically on startup
    handleAppUpdateCheck();
  });
}
