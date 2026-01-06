import { createStore } from 'solid-js/store';
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
    map: Map<string, FontMetadata>;
    readonly filteredKeys: Set<string>;
  };
  ui: {
    selectedFont: FontMetadata | null;
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
    map: new Map<string, FontMetadata>(),
    get filteredKeys(): Set<string> {
      const q = appState.ui.searchQuery;
      const fontsMap = this.map;
      if (fontsMap.size === 0) return new Set<string>();

      if (!q) {
        return new Set<string>(fontsMap.keys());
      }

      const fonts = Array.from(fontsMap.values());
      const fuse = new Fuse(fonts, FUSE_OPTIONS);
      const result = fuse.search(q).map((r) => r.item.safe_name);
      return new Set<string>(result);
    },
  },
  ui: {
    selectedFont: null,
    selectedWeights: [400],
    searchQuery: '',
    sampleText: 'Hamburgevons',
  },
});
