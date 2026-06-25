import type {
  AlgorithmConfig,
  ClusteringOptions,
  RenderingOptions,
  SessionConfig,
} from '@/types/font';

export const DEFAULT_RENDERING_CONFIG: RenderingOptions = {
  text: 'A',
  weights: [400],
  font_set: 'google_fonts_popular300',
  font_size: 224,
};

export const DEFAULT_CLUSTERING_CONFIG: ClusteringOptions = {
  method: 'average',
  preprocessing_dimensions: 8,
  distance_threshold: 0.5,
  target_cluster_count: 0,
};

export const DEFAULT_ALGORITHM_CONFIG: AlgorithmConfig = {
  rendering: DEFAULT_RENDERING_CONFIG,
  clustering: DEFAULT_CLUSTERING_CONFIG,
};

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  app_version: '0.5.0',
  modified_app_version: '0.5.0',
  session_id: '',
  created_at: new Date().toISOString(),
  modified_at: new Date().toISOString(),
  status: {
    process_status: 'empty',
    clusters_amount: 0,
    samples_amount: 0,
    progress: {
      rendering: { numerator: 0, denominator: 1 },
      analysis: { numerator: 0, denominator: 1 },
      clustering: { numerator: 0, denominator: 1 },
      position: { numerator: 0, denominator: 1 },
    },
  },
  discovered_fonts: {},
  algorithm: DEFAULT_ALGORITHM_CONFIG,
};
