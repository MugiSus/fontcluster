export interface FontConfig {
  safe_name: string;
  font_name: string;
  weights: string[];
}

export interface CompressedFontVector {
  config: FontConfig;
  vector: [number, number, number]; // [x, y, k] where k is cluster number
}
