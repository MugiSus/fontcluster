export type ModelAvailability = 'available' | 'not_downloaded';

export interface ModelCatalogEntry {
  id: string;
  name: string;
  description: string;
  downloadSize: number;
  availability: ModelAvailability;
}

export interface ModelCatalogResponse {
  models: ModelCatalogEntry[];
  warning: string | null;
}
