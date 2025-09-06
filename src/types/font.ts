export type FontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

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
