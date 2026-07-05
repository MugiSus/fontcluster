import type { FontWeight } from './font';

export type ClusteringMethod =
  | 'single'
  | 'complete'
  | 'average'
  | 'weighted'
  | 'ward'
  | 'centroid'
  | 'median';

export interface ClusteringOptions {
  method: ClusteringMethod;
  preprocessing_dimensions: number;
  distance_threshold: number;
  target_cluster_count: number;
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

export type ProcessStatus = 'empty' | 'rendered' | 'analyzed' | 'clustered';

export interface ClusterStat {
  size: number;
  /** Centroid in the normalized PCA space the clustering ran in. */
  centroid: number[];
  /** Largest internal merge height within this cluster; 0 for singletons. */
  diameter: number;
  /** Palette slot to draw this cluster in, assigned by the backend so
   *  ring-adjacent clusters never share one. Null only in stats persisted
   *  before this field existed. */
  color_index: number | null;
}

export interface ClusteringStats {
  /** Per-cluster stats, ordered by cluster id (matches ClusteringData.k). */
  clusters: ClusterStat[];
  /** Linkage height at which the dendrogram was cut; 0 if no merges applied. */
  cut_height: number;
  /** Dissimilarity of every merge in the full dendrogram, in linkage order. */
  merge_heights: number[];
}

/**
 * One merge step of the full clustering dendrogram.
 *
 * `left`/`right` follow the usual linkage-matrix convention: an index below
 * the leaf count refers to a leaf of {@link DendrogramData.ids}; an index at
 * or above it refers to the cluster created by merge step `index - leaf count`.
 */
export interface DendrogramMerge {
  left: number;
  right: number;
  /** Dissimilarity at which the two clusters merged, in the normalized PCA
   *  space the clustering ran in. */
  height: number;
  /** Leaf index of the merged cluster's representative: of the two children's
   *  representatives, the one closer to the merged centroid (an incremental
   *  medoid approximation). */
  representative: number;
}

/**
 * The full dendrogram of a clustering run (`dendrogram.json` in the session
 * directory), delivered alongside the session payload.
 */
export interface DendrogramData {
  /** Font safe names in leaf order; leaf `i` of the merge tree is `ids[i]`. */
  ids: string[];
  /** Every merge in linkage order (ascending dissimilarity). */
  merges: DendrogramMerge[];
}

export interface SessionProgressSection {
  numerator: number;
  denominator: number;
}

export interface SessionProgress {
  rendering: SessionProgressSection;
  analysis: SessionProgressSection;
  clustering: SessionProgressSection;
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
