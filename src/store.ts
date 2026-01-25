import { createStore } from 'solid-js/store';
import { createMemo, createRoot } from 'solid-js';
import Fuse from 'fuse.js';
import {
  FontMetadata,
  SessionConfig,
  FontWeight,
  ProcessStatus,
} from './types/font';

export interface AppState {
  session: {
    id: string;
    config: SessionConfig;
    directory: string;
    status: ProcessStatus;
    isProcessing: boolean;
  };
  progress: {
    numerator: number;
    denominator: number;
  };
  fonts: {
    data: Record<string, FontMetadata>;
    readonly filteredKeys: Set<string>;
  };
  ui: {
    selectedFontKey: string | null;
    readonly selectedFont: FontMetadata | null;
    readonly selectedFontFamily: string | null;
    selectedWeights: FontWeight[];
    searchQuery: string;
    sampleText: string;
  };
}

const FUSE_OPTIONS = {
  keys: [
    'font_name',
    'family_name',
    'family_names',
    'preferred_family_names',
    'publishers',
    'designers',
    {
      name: 'family_names_list',
      getFn: (item: FontMetadata) => Object.values(item.family_names),
    },
    {
      name: 'preferred_family_names_list',
      getFn: (item: FontMetadata) => Object.values(item.preferred_family_names),
    },
    {
      name: 'publishers_list',
      getFn: (item: FontMetadata) => Object.values(item.publishers),
    },
    {
      name: 'designers_list',
      getFn: (item: FontMetadata) => Object.values(item.designers),
    },
  ],
  threshold: 0.25,
};

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  app_version: '0.3.0',
  session_id: '',
  preview_text: 'ü',
  date: new Date().toISOString(),
  process_status: 'empty',
  clusters_amount: 0,
  samples_amount: 0,
  weights: [400],
  discovered_fonts: {},
  algorithm: {
    discovery: { font_set: 'google_fonts_popular300' },
    image: { font_size: 128 },
    hog: {
      orientations: 12,
      cell_side: 16,
      block_side: 2,
      block_stride: 2,
      width: 128,
      height: 64,
    },
    pacmap: {
      mn_phases: 100,
      nn_phases: 100,
      fp_phases: 100,
      learning_rate: 1.0,
      n_neighbors: 10,
    },
    hdbscan: { min_cluster_size: 16, min_samples: 16 },
  },
};

// Define the store with explicit type to avoid circular inference errors
export const [appState, setAppState] = createStore<AppState>({
  session: {
    id: '',
    config: DEFAULT_SESSION_CONFIG,
    directory: '',
    status: 'empty',
    isProcessing: false,
  },
  progress: {
    numerator: 0,
    denominator: 0,
  },
  fonts: {
    data: {},
    get filteredKeys(): Set<string> {
      return filteredKeysMemo();
    },
  },
  ui: {
    selectedFontKey: null,
    get selectedFont(): FontMetadata | null {
      const key = this.selectedFontKey;
      return key ? appState.fonts.data[key] || null : null;
    },
    get selectedFontFamily(): string | null {
      return this.selectedFont?.family_name || null;
    },
    selectedWeights: [400],
    searchQuery: '',
    sampleText: 'ü',
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
      .map((r) => r.item.safe_name);
    return new Set<string>(result);
  });
  return memo;
});
