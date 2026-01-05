import { createStore } from 'solid-js/store';
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
    filteredKeys: Set<string>;
  };
  ui: {
    selectedFont: FontMetadata | null;
    selectedWeights: FontWeight[];
    searchQuery: string;
    sampleText: string;
  };
}

const initialState: AppState = {
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
    map: new Map(),
    filteredKeys: new Set(),
  },
  ui: {
    selectedFont: null,
    selectedWeights: [400],
    searchQuery: '',
    sampleText: 'Hamburgevons',
  },
};

export const [appState, setAppState] = createStore<AppState>(initialState);
