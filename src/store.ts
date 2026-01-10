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
    config: SessionConfig | null;
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
  threshold: 0.4,
};

// Define the store with explicit type to avoid circular inference errors
export const [appState, setAppState] = createStore<AppState>({
  session: {
    id: '',
    config: null,
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
      const q = appState.ui.searchQuery;
      const data = this.data;
      if (Object.keys(data).length === 0) return new Set<string>();

      if (!q) {
        return new Set<string>(Object.keys(data));
      }

      // Use the memoized fuse instance
      const result = fuse()
        .search(q)
        .map((r) => r.item.safe_name);
      return new Set<string>(result);
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
