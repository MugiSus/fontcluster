import { reconcile } from 'solid-js/store';
import { appState, setAppState } from '@/store';
import { getConnectedPlugins, sendFontToPlugin } from '@/lib/plugin-bridge';
import { type FontItem } from '@/types/font';

const setSentFontItemKey = (key: string | null) =>
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

/**
 * Syncs the connected-plugin list from the backend into the store. This store
 * slice is the single source of truth for plugin connectivity; the app-events
 * hook is the polling owner.
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
