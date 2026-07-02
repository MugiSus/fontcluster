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
