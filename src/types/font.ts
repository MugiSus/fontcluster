export type FontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

export const WEIGHT_LABELS: Record<
  FontWeight,
  { short: string; full: string }
> = {
  100: { short: 'Th', full: 'Thin' },
  200: { short: 'El', full: 'ExtraLight' },
  300: { short: 'L', full: 'Light' },
  400: { short: 'R', full: 'Regular' },
  500: { short: 'M', full: 'Medium' },
  600: { short: 'S', full: 'SemiBold' },
  700: { short: 'B', full: 'Bold' },
  800: { short: 'Eb', full: 'ExtraBold' },
  900: { short: 'Bl', full: 'Black' },
};

export interface AgglomerativeOptions {
  distance_threshold: number;
  target_cluster_count: number;
}

export interface ImageOptions {
  font_size: number;
}

export type FontSet =
  | 'system_fonts'
  | 'google_fonts_popular100'
  | 'google_fonts_popular200'
  | 'google_fonts_popular300'
  | 'google_fonts_popular500'
  | 'google_fonts_popular1000'
  | 'google_fonts_popular1500'
  | 'google_fonts_all';

export interface DiscoveryOptions {
  font_set: FontSet;
}

export interface AlgorithmConfig {
  discovery: DiscoveryOptions | null;
  image: ImageOptions | null;
  agglomerative: AgglomerativeOptions | null;
}

export type ProcessStatus =
  | 'empty'
  | 'downloaded'
  | 'discovered'
  | 'generated'
  | 'vectorized'
  | 'compressed'
  | 'clustered';

export interface SessionConfig {
  session_id: string;
  preview_text: string;
  created_at: string;
  modified_at: string;
  app_version: string;
  modified_app_version: string;
  process_status: ProcessStatus;
  clusters_amount: number;
  samples_amount: number;
  weights: number[];
  discovered_fonts: Record<number, string[]>;
  algorithm?: AlgorithmConfig;
}

export interface CompressionData {
  position: number[]; // [x, y] 2D coordinates from PCA
}

export interface ClusteringData {
  k: number;
  outlier_score?: number;
  is_outlier: boolean;
}

export interface ComputedData {
  compression: CompressionData;
  clustering?: ClusteringData | null;
}

export interface FontMetadata {
  safe_name: string;
  font_name: string;
  family_name: string;
  family_names: Record<string, string>;
  preferred_family_names: Record<string, string>;
  publishers: Record<string, string>;
  designers: Record<string, string>;
  weight: number;
  weights: string[];
}

export interface FontItem {
  meta: FontMetadata;
  computed?: ComputedData | null;
}

export type FontItemRecord = Record<string, FontItem>;
