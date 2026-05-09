import { createStore } from 'solid-js/store';
import { createMemo, createRoot } from 'solid-js';
import Fuse from 'fuse.js';
import {
  type FontItem,
  type SessionConfig,
  type FontWeight,
} from './types/font';

export interface AppState {
  session: {
    id: string;
    config: SessionConfig;
    directory: string;
  };
  fonts: {
    data: Record<string, FontItem>;
    readonly filteredKeys: Set<string>;
  };
  ui: {
    selectedFontKey: string | null;
    readonly selectedFont: FontItem | null;
    readonly selectedFontFamily: string | null;
    selectedWeights: FontWeight[];
    searchQuery: string;
    sampleText: string;
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

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  app_version: '0.5.0',
  modified_app_version: '0.5.0',
  session_id: '',
  preview_text: 'A',
  created_at: new Date().toISOString(),
  modified_at: new Date().toISOString(),
  status: {
    process_status: 'empty',
    clusters_amount: 0,
    samples_amount: 0,
    progress: {
      download: { numerator: 0, denominator: 1 },
      discovery: { numerator: 0, denominator: 1 },
      generation: { numerator: 0, denominator: 1 },
      vectorization: { numerator: 0, denominator: 1 },
      clustering: { numerator: 0, denominator: 1 },
      position: { numerator: 0, denominator: 1 },
    },
  },
  weights: [400],
  discovered_fonts: {},
  algorithm: {
    discovery: { font_set: 'google_fonts_popular300' },
    image: { font_size: 224 },
    clustering: {
      preprocessing_dimensions: 4,
      distance_threshold: 0.6,
      target_cluster_count: 0,
    },
  },
};

// Define the store with explicit type to avoid circular inference errors
export const [appState, setAppState] = createStore<AppState>({
  session: {
    id: '',
    config: DEFAULT_SESSION_CONFIG,
    directory: '',
  },
  fonts: {
    data: {},
    get filteredKeys(): Set<string> {
      return filteredKeysMemo();
    },
  },
  ui: {
    selectedFontKey: null,
    get selectedFont(): FontItem | null {
      const key = this.selectedFontKey;
      return key ? appState.fonts.data[key] || null : null;
    },
    get selectedFontFamily(): string | null {
      return this.selectedFont?.meta.family_name || null;
    },
    selectedWeights: [400],
    searchQuery: '',
    sampleText: 'A',
  },
});

export const fuse = createRoot(() => {
  const memo = createMemo(() => {
    const fonts = Object.values(appState.fonts.data);
    return new Fuse(fonts, FUSE_OPTIONS);
  });
  return memo;
});

export const filteredKeysMemo = createRoot(() => {
  const memo = createMemo(() => {
    const q = appState.ui.searchQuery;
    const data = appState.fonts.data;
    const keys = Object.keys(data);
    if (keys.length === 0) return new Set<string>();

    if (!q) {
      return new Set<string>(keys);
    }

    const result = fuse()
      .search(q)
      .map((r) => r.item.meta.safe_name);
    return new Set<string>(result);
  });
  return memo;
});
