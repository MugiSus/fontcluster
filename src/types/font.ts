export type FontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

export interface SessionInfo {
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

export interface FontConfig {
  safe_name: string;
  font_name: string;
  family_name: string;
  weight: number;
  weights: string[];
}

export interface FontVectorData {
  x: number;
  y: number;
  k: number;
  config: FontConfig;
}

export type CompressedFontVectorMap = Record<string, FontVectorData>;

// Legacy interface for backward compatibility
export interface CompressedFontVector {
  config: FontConfig;
  vector: [number, number, number]; // [x, y, k] where k is cluster number
}
