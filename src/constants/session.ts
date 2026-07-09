import type {
  AlgorithmConfig,
  ClusteringOptions,
  RenderingOptions,
  SessionConfig,
} from '@/types/session';

export const DEFAULT_RENDERING_CONFIG: RenderingOptions = {
  text: 'A',
  weights: [400],
  font_set: 'google_fonts_popular300',
  font_size: 224,
};

export const DEFAULT_CLUSTERING_CONFIG: ClusteringOptions = {
  method: 'complete',
  preprocessing_dimensions: 16,
  distance_threshold: 0.5,
  target_cluster_count: 0,
  emphasis: {},
};

/**
 * The 37 O'Donovan crowdsourced font attributes (the set FontCLIP adopts),
 * as offered in the clustering emphasis controls. The eight most typographically
 * telling ones lead; the remaining 29 follow in the dataset's own order. Each
 * name must match a key in the model's `attribute_directions.json`.
 */
export const EMPHASIS_ATTRIBUTES = [
  'serif',
  'cursive',
  'italic',
  'formal',
  'delicate',
  'playful',
  'legible',
  'thin',
  'angular',
  'artistic',
  'attention-grabbing',
  'attractive',
  'bad',
  'boring',
  'calm',
  'capitals',
  'charming',
  'clumsy',
  'complex',
  'disorderly',
  'display',
  'dramatic',
  'fresh',
  'friendly',
  'gentle',
  'graceful',
  'happy',
  'modern',
  'monospace',
  'pretentious',
  'sharp',
  'sloppy',
  'soft',
  'strong',
  'technical',
  'warm',
  'wide',
] as const;

export type EmphasisAttribute = (typeof EMPHASIS_ATTRIBUTES)[number];

export const DEFAULT_ALGORITHM_CONFIG: AlgorithmConfig = {
  rendering: DEFAULT_RENDERING_CONFIG,
  clustering: DEFAULT_CLUSTERING_CONFIG,
};

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  app_version: '0.5.0',
  modified_app_version: '0.5.0',
  session_id: '',
  title: '',
  created_at: new Date().toISOString(),
  modified_at: new Date().toISOString(),
  status: {
    process_status: 'empty',
    clusters_amount: 0,
    samples_amount: 0,
    clustering_stats: { clusters: [], cut_height: 0, merge_heights: [] },
    progress: {
      rendering: { numerator: 0, denominator: 1 },
      analysis: { numerator: 0, denominator: 1 },
      clustering: { numerator: 0, denominator: 1 },
    },
  },
  discovered_fonts: {},
  algorithm: DEFAULT_ALGORITHM_CONFIG,
};
