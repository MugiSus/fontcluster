export type FontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

export const WEIGHT_LABELS: Record<
  FontWeight,
  { short: string; full: string }
> = {
  100: { short: 'Th', full: 'Thin' },
  200: { short: 'El', full: 'Extralight' },
  300: { short: 'L', full: 'Light' },
  400: { short: 'R', full: 'Regular' },
  500: { short: 'M', full: 'Medium' },
  600: { short: 'S', full: 'Semibold' },
  700: { short: 'B', full: 'Bold' },
  800: { short: 'Eb', full: 'Extrabold' },
  900: { short: 'Bl', full: 'Black' },
};

export interface ClusteringOptions {
  method: ClusteringMethod;
  preprocessing_dimensions: number;
  distance_threshold: number;
  target_cluster_count: number;
}

export type ClusteringMethod =
  | 'single'
  | 'complete'
  | 'average'
  | 'weighted'
  | 'ward'
  | 'centroid'
  | 'median';

export type FontSet =
  | 'system_fonts'
  | 'google_fonts_popular100'
  | 'google_fonts_popular200'
  | 'google_fonts_popular300'
  | 'google_fonts_popular500'
  | 'google_fonts_popular1000'
  | 'google_fonts_popular1500'
  | 'google_fonts_all';

export interface RenderingOptions {
  text: string;
  weights: FontWeight[];
  font_set: FontSet;
  font_size: number;
}

export interface AlgorithmConfig {
  rendering: RenderingOptions;
  clustering: ClusteringOptions;
}

export type ProcessStatus =
  | 'empty'
  | 'rendered'
  | 'analyzed'
  | 'positioned'
  | 'clustered';

export interface ClusterStat {
  size: number;
  /** Centroid in the normalized PCA space the clustering ran in. */
  centroid: number[];
  /** Largest internal merge height within this cluster; 0 for singletons. */
  diameter: number;
}

export interface ClusteringStats {
  /** Per-cluster stats, ordered by cluster id (matches ClusteringData.k). */
  clusters: ClusterStat[];
  /** Linkage height at which the dendrogram was cut; 0 if no merges applied. */
  cut_height: number;
  /** Dissimilarity of every merge in the full dendrogram, in linkage order. */
  merge_heights: number[];
}

export interface ProcessingStatus {
  process_status: ProcessStatus;
  clusters_amount: number;
  samples_amount: number;
  clustering_stats: ClusteringStats;
  progress: SessionProgress;
}

export interface SessionConfig {
  session_id: string;
  created_at: string;
  modified_at: string;
  app_version: string;
  modified_app_version: string;
  status: ProcessingStatus;
  discovered_fonts: Record<number, string[]>;
  algorithm: AlgorithmConfig;
}

export interface SessionProgressSection {
  numerator: number;
  denominator: number;
}

export interface SessionProgress {
  rendering: SessionProgressSection;
  analysis: SessionProgressSection;
  clustering: SessionProgressSection;
  position: SessionProgressSection;
}

export interface PositioningData {
  position: number[]; // [x, y] 2D coordinates from the preference projector
}

export interface ClusteringData {
  k: number;
  /**
   * Linkage height at which this font first merged into a larger node, in the
   * normalized PCA space the clustering ran in. Higher = more of an outlier.
   */
  join_height: number;
}

export interface ComputedData {
  rendered_text?: string | null;
  positioning?: PositioningData | null;
  clustering?: ClusteringData | null;
}

export interface LassoProcessResult {
  safeNames: string[];
  positioningBySafeName: Record<string, PositioningData>;
}

export type FontSource = 'system' | 'google_fonts';

export interface FontMetadata {
  source: FontSource;
  safe_name: string;
  font_name: string;
  family_name: string;
  family_names: Record<string, string>;
  preferred_family_names: Record<string, string>;
  style_name?: string;
  style_names?: Record<string, string>;
  preferred_style_names?: Record<string, string>;
  publishers: Record<string, string>;
  designers: Record<string, string>;
  copyright?: string | null;
  trademark?: string | null;
  version?: string | null;
  postscript_name?: string | null;
  description?: string | null;
  vendor_url?: string | null;
  designer_url?: string | null;
  sample_text?: string | null;
  weight: number;
  weights: string[];
  font_index: number;
}

export interface FontItem {
  meta: FontMetadata;
  computed?: ComputedData | null;
}

export type FontItemRecord = Record<string, FontItem>;
