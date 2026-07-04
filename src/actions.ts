import { batch, onCleanup, onMount } from 'solid-js';
import { reconcile } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { relaunch } from '@tauri-apps/plugin-process';
import { check } from '@tauri-apps/plugin-updater';
import { toast } from 'solid-sonner';
import { useI18n } from '@/i18n';
import { appState, setAppState } from './store';
import { getConnectedPlugins, sendFontToPlugin } from './lib/plugin-bridge';
import { selectionHistory } from './selection-history';
import {
  type FontItem,
  type FontItemRecord,
  type FontWeight,
  type LassoProcessResult,
} from './types/font';
import {
  type SessionConfig,
  type AlgorithmConfig,
  type DendrogramData,
  type ProcessStatus,
} from './types/session';

// --- Session loading ---

/**
 * Loads a session by id: pulls its config, sample directory and font items
 * from the backend and atomically swaps them into the store. The active
 * session is identified by `appState.session.session_id`, so there is no
 * separate "requested id" to keep in sync.
 */
export const loadSession = async (id: string) => {
  if (!id) return;
  setAppState('ui', 'isSessionLoading', true);
  try {
    const { config, directory, fonts, dendrogram } = await invoke<{
      config: SessionConfig;
      directory: string;
      fonts: FontItemRecord;
      dendrogram: DendrogramData | null;
    }>('load_session', { sessionId: id });

    batch(() => {
      setAppState('session', {
        ...config,
        status: {
          ...config.status,
          samples_amount: Object.keys(fonts).length,
        },
      });
      setAppState('sessionDirectory', directory || '');
      setAppState('dendrogram', dendrogram ?? null);
      setAppState('fonts', 'data', reconcile(fonts));
    });
  } catch (error) {
    console.error('Failed to load session:', error);
  } finally {
    setAppState('ui', 'isSessionLoading', false);
  }
};

/** Reloads the currently active session (e.g. after a job mutates it). */
export const refreshSession = () => loadSession(appState.session.session_id);

// Actions

export const setSelectedFontKey = (key: string | null) => {
  batch(() => {
    setAppState('ui', 'selectedFontKey', key);
    // A plain font selection supersedes any merge-node sample selection.
    setAppState('ui', 'selectedDendrogramNode', null);
  });
  selectionHistory.commitDebounced();
};

/**
 * Selects a dendrogram merge node's exemplar sample: the represented font
 * becomes the selected font, and the node index drives the dendrogram's
 * subtree highlight until a plain selection replaces it.
 */
export const setSelectedDendrogramNodeSample = (
  nodeIndex: number,
  key: string,
) => {
  batch(() => {
    setAppState('ui', 'selectedFontKey', key);
    setAppState('ui', 'selectedDendrogramNode', nodeIndex);
  });
  selectionHistory.commitDebounced();
};

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

export const setActiveGraphWeights = (weights: FontWeight[]) =>
  setAppState('ui', 'activeGraphWeights', weights);

export const setVisibleGraphClusters = (clusterIds: number[]) =>
  setAppState('ui', 'visibleGraphClusters', clusterIds);

export const setShowDendrogram = (shown: boolean) =>
  setAppState('ui', 'showDendrogram', shown);

export const clearLassoResult = () => {
  batch(() => {
    setAppState('ui', 'lassoResult', null);
    setAppState('ui', 'isLassoProcessing', false);
  });
  selectionHistory.commit();
};

export const setCurrentSessionId = async (id: string) => {
  const isSessionSwitch = appState.session.session_id !== id;
  batch(() => {
    setAppState('ui', 'lassoResult', null);
    setAppState('ui', 'isLassoProcessing', false);
    if (isSessionSwitch) {
      setAppState('ui', 'selectedFontKey', null);
      setAppState('ui', 'selectedDendrogramNode', null);
      setAppState('ui', 'hoveredFontKey', null);
      setAppState('ui', 'sentFontItemKey', null);
      setAppState('sessionDirectory', '');
      setAppState('dendrogram', null);
      setAppState('fonts', 'data', reconcile({}));
    }
  });
  selectionHistory.reset();
  await loadSession(id);
};

export const processLassoSelection = async (safeNames: string[]) => {
  if (safeNames.length === 0 || appState.ui.isLassoProcessing) return;

  const sessionId = appState.session.session_id;
  setAppState('ui', 'isLassoProcessing', true);
  try {
    const result = await invoke<LassoProcessResult>('lasso_selected_process', {
      safeNames,
    });
    if (appState.session.session_id !== sessionId) return;

    batch(() => {
      setAppState('ui', 'lassoResult', result);

      const selectedFontKey = appState.ui.selectedFontKey;
      const shouldKeepSelection =
        !!selectedFontKey && result.safeNames.includes(selectedFontKey);
      setAppState(
        'ui',
        'selectedFontKey',
        shouldKeepSelection ? selectedFontKey : null,
      );
      if (!shouldKeepSelection) {
        setAppState('ui', 'selectedDendrogramNode', null);
      }
    });
    selectionHistory.commit();
  } finally {
    setAppState('ui', 'isLassoProcessing', false);
  }
};

export const runProcessingJobs = async (
  algorithm: Partial<AlgorithmConfig>,
  sessionId?: string,
  overrideStatus?: ProcessStatus,
) => {
  batch(() => {
    setAppState('ui', 'lassoResult', null);
    setAppState('ui', 'isLassoProcessing', false);
  });
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

    listenWithCleanup<string>('positioning_complete', (event) => {
      console.log('Positioning completed for session:', event.payload);
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
        duration: 20000,
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
