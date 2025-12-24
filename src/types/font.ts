export type FontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

export interface PacmapOptions {
  mn_phases: number;
  nn_phases: number;
  fp_phases: number;
  learning_rate: number;
}

export interface HogOptions {
  orientations: number;
  cell_side: number;
}

export interface ImageOptions {
  width: number;
  height: number;
  font_size: number;
}

export interface AlgorithmConfig {
  image: ImageOptions | null;
  hog: HogOptions | null;
  pacmap: PacmapOptions | null;
}

export interface SessionConfig {
  session_id: string;
  preview_text: string;
  date: string;
  has_images: boolean;
  has_vectors: boolean;
  has_compressed: boolean;
  has_clusters: boolean;
  clusters_amount: number;
  samples_amount: number;
  weights: number[];
  algorithm?: AlgorithmConfig;
}

export interface ComputedData {
  vector: number[]; // [x, y] 2D coordinates from PaCMAP
  k: number; // Cluster assignment from GMM
}

export interface FontConfig {
  safe_name: string;
  font_name: string;
  family_name: string;
  weight: number;
  weights: string[];
  computed?: ComputedData; // Optional, present after compression and clustering
}

// Unified type using FontConfig with computed data
export type FontConfigRecord = Record<string, FontConfig>;
