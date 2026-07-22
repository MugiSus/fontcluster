/**
 * Installation state determined by the backend model directory.
 * Frontend-only catalog states such as loading or unknown are intentionally
 * excluded from this transport type.
 */
export type ModelAvailability = 'available' | 'not_downloaded';

/** Metadata for one selectable analysis model. */
export interface ModelCatalogEntry {
  /** Stable release tag and on-disk directory name. */
  id: string;
  /** Human-readable label from the model manifest. */
  name: string;
  /** Model parameter count, when declared by the publisher. */
  parameterCount: number | null;
  /** Total bytes of the required release assets; zero for a local-only row. */
  downloadSize: number;
  /** Backend-derived local installation state. */
  availability: ModelAvailability;
}

/**
 * Offline-capable catalog returned by the backend.
 *
 * Installed entries can be present alongside a warning when remote release
 * metadata could not be read. Consumers should render those entries and
 * expose the warning as a recoverable catalog problem.
 */
export interface ModelCatalogResponse {
  models: ModelCatalogEntry[];
  /** Recoverable remote-catalog warning, or `null` for a complete response. */
  warning: string | null;
}
