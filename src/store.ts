import { createStore } from 'solid-js/store';
import { createMemo, createRoot } from 'solid-js';
import Fuse from 'fuse.js';
import {
  type FontItem,
  type FontWeight,
  type FontItemRecord,
} from './types/font';
import { type DendrogramData, type SessionConfig } from './types/session';
import { DEFAULT_SESSION_CONFIG } from './constants/session';
import type { PluginConnection } from './types/plugin';
import { type GraphMode } from './types/graph';

export type { GraphMode } from './types/graph';

export interface AppState {
  session: SessionConfig;
  sessionDirectory: string;
  /** Full clustering dendrogram of the active session; null before a session
   *  is loaded or while switching sessions. */
  dendrogram: DendrogramData | null;
  fonts: {
    data: Record<string, FontItem>;
    readonly displayData: Record<string, FontItem>;
    readonly filteredKeys: Set<string>;
  };
  ui: {
    selectedFontKey: string | null;
    hoveredFontKey: string | null;
    sentFontItemKey: string | null;
    isSessionLoading: boolean;
    readonly selectedFont: FontItem | null;
    readonly selectedFontFamily: string | null;
    searchQuery: string;
    listPreviewText: string;
    activeGraphWeights: FontWeight[];
    visibleGraphClusters: number[];
    /** Active graph layout. Lives in the store because graph layout modules
     *  derive their positions and visibility from the same mode. */
    graphMode: GraphMode;
    /** Dendrogram node index of the selected merge-node sample. Null when the
     *  selection is a plain font (or nothing) — any plain font selection clears it. */
    selectedDendrogramNode: number | null;
  };
  plugins: {
    connections: PluginConnection[];
    readonly isConnected: boolean;
  };
}

const FUSE_OPTIONS = {
  keys: [
    'meta.font_name',
    'meta.family_name',
    'meta.family_names',
    'meta.preferred_family_names',
    'meta.publishers',
    'meta.designers',
    {
      name: 'family_names_list',
      getFn: (item: FontItem) => Object.values(item.meta.family_names),
    },
    {
      name: 'preferred_family_names_list',
      getFn: (item: FontItem) =>
        Object.values(item.meta.preferred_family_names),
    },
    {
      name: 'publishers_list',
      getFn: (item: FontItem) => Object.values(item.meta.publishers),
    },
    {
      name: 'designers_list',
      getFn: (item: FontItem) => Object.values(item.meta.designers),
    },
  ],
  threshold: 0.25,
};

// Define the store with explicit type to avoid circular inference errors
export const [appState, setAppState] = createStore<AppState>({
  session: DEFAULT_SESSION_CONFIG,
  sessionDirectory: '',
  dendrogram: null,
  fonts: {
    data: {},
    get displayData(): FontItemRecord {
      return this.data;
    },
    get filteredKeys(): Set<string> {
      return filteredKeysMemo();
    },
  },
  ui: {
    selectedFontKey: null,
    hoveredFontKey: null,
    sentFontItemKey: null,
    isSessionLoading: false,
    get selectedFont(): FontItem | null {
      const key = this.selectedFontKey;
      return key ? appState.fonts.displayData[key] || null : null;
    },
    get selectedFontFamily(): string | null {
      return this.selectedFont?.meta.family_name || null;
    },
    searchQuery: '',
    listPreviewText: '',
    activeGraphWeights: [400],
    visibleGraphClusters: [],
    graphMode: 'radial-tree',
    selectedDendrogramNode: null,
  },
  plugins: {
    connections: [],
    get isConnected(): boolean {
      return this.connections.length > 0;
    },
  },
});

export const fuse = createRoot(() => {
  const memo = createMemo(() => {
    const fonts = Object.values(appState.fonts.displayData);
    return new Fuse(fonts, FUSE_OPTIONS);
  });
  return memo;
});

export const filteredKeysMemo = createRoot(() => {
  const memo = createMemo(() => {
    const q = appState.ui.searchQuery;
    const data = appState.fonts.displayData;
    const activeWeights = new Set(appState.ui.activeGraphWeights);
    const visibleClusters = new Set(appState.ui.visibleGraphClusters);
    const keys = Object.keys(data);
    if (keys.length === 0) return new Set<string>();
    if (activeWeights.size === 0) return new Set<string>();

    const queryMatchedKeys = q
      ? fuse()
          .search(q)
          .map((r) => r.item.meta.safe_name)
      : keys;

    return new Set(
      queryMatchedKeys.filter((key) => {
        const item = data[key];
        if (!item) return false;
        if (!activeWeights.has(item.meta.weight as FontWeight)) return false;
        // No selection means "show every cluster"; otherwise keep only the
        // fonts whose cluster is one of the selected ones.
        if (visibleClusters.size > 0) {
          const clusterId = item.computed?.clustering?.k;
          if (clusterId === undefined || !visibleClusters.has(clusterId)) {
            return false;
          }
        }
        return true;
      }),
    );
  });
  return memo;
});
