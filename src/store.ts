import { createStore } from 'solid-js/store';
import { createMemo, createRoot } from 'solid-js';
import Fuse from 'fuse.js';
import {
  type FontItem,
  type FontWeight,
  type FontItemRecord,
  type LassoProcessResult,
  type SessionConfig,
} from './types/font';
import { DEFAULT_SESSION_CONFIG } from './constants/session';
import type { PluginConnection } from './lib/plugin-bridge';

export interface AppState {
  session: SessionConfig;
  sessionDirectory: string;
  fonts: {
    data: Record<string, FontItem>;
    readonly displayData: Record<string, FontItem>;
    readonly filteredKeys: Set<string>;
  };
  ui: {
    selectedFontKey: string | null;
    hoveredFontKey: string | null;
    sentFontItemKey: string | null;
    lassoResult: LassoProcessResult | null;
    isLassoProcessing: boolean;
    isSessionLoading: boolean;
    readonly selectedFont: FontItem | null;
    readonly selectedFontFamily: string | null;
    searchQuery: string;
    listPreviewText: string;
    activeGraphWeights: FontWeight[];
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
  fonts: {
    data: {},
    get displayData(): FontItemRecord {
      return displayFontItemRecordMemo();
    },
    get filteredKeys(): Set<string> {
      return filteredKeysMemo();
    },
  },
  ui: {
    selectedFontKey: null,
    hoveredFontKey: null,
    sentFontItemKey: null,
    lassoResult: null,
    isLassoProcessing: false,
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
  },
  plugins: {
    connections: [],
    get isConnected(): boolean {
      return this.connections.length > 0;
    },
  },
});

export const displayFontItemRecordMemo = createRoot(() => {
  const memo = createMemo(() => {
    const result = appState.ui.lassoResult;
    if (!result) return appState.fonts.data;

    const displayData: FontItemRecord = {};
    for (const safeName of result.safeNames) {
      const item = appState.fonts.data[safeName];
      const positioning = result.positioningBySafeName[safeName];
      if (!item || !positioning) continue;

      displayData[safeName] = {
        meta: item.meta,
        computed: {
          ...item.computed,
          positioning,
        },
      };
    }
    return displayData;
  });
  return memo;
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
        return item ? activeWeights.has(item.meta.weight as FontWeight) : false;
      }),
    );
  });
  return memo;
});
