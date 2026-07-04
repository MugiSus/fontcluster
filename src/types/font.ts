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
  clustering?: ClusteringData | null;
}

export interface FontItem {
  meta: FontMetadata;
  computed?: ComputedData | null;
}

export type FontItemRecord = Record<string, FontItem>;
