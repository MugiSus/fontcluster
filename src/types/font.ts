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

export interface PacmapOptions {
  mn_phases: number;
  nn_phases: number;
  fp_phases: number;
  learning_rate: number;
}

export interface HdbscanOptions {
  min_cluster_size: number;
  min_samples: number;
}

export interface ImageOptions {
  font_size: number;
}

export type FontSet =
  | 'system_fonts'
  | 'google_fonts_top100'
  | 'google_fonts_top300'
  | 'google_fonts_top500'
  | 'google_fonts_top1000';

export interface DiscoveryOptions {
  font_set: FontSet;
}

export interface HogOptions {
  orientations: number;
  cell_side: number;
  block_side: number;
  block_stride: number;
  width: number;
  height: number;
}

export interface AlgorithmConfig {
  discovery: DiscoveryOptions | null;
  image: ImageOptions | null;
  hog: HogOptions | null;
  pacmap: PacmapOptions | null;
  hdbscan: HdbscanOptions | null;
}

export type ProcessStatus =
  | 'empty'
  | 'discovered'
  | 'generated'
  | 'vectorized'
  | 'compressed'
  | 'clustered';

export interface SessionConfig {
  app_version: string;
  session_id: string;
  preview_text: string;
  date: string;
  process_status: ProcessStatus;
  clusters_amount: number;
  samples_amount: number;
  weights: number[];
  discovered_fonts: Record<number, string[]>;
  algorithm?: AlgorithmConfig;
}

export interface ComputedData {
  vector: number[]; // [x, y] 2D coordinates from PaCMAP
  k: number; // Cluster assignment from HDBSCAN
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
  computed?: ComputedData; // Optional, present after compression and clustering
}

// Unified type using FontMetadata with computed data
export type FontMetadataRecord = Record<string, FontMetadata>;
