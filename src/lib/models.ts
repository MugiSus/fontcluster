import { invoke } from '@tauri-apps/api/core';
import type { ModelCatalogResponse } from '@/types/model';

/** Reads the backend-owned model catalog and local installation status. */
export const listModels = () => invoke<ModelCatalogResponse>('list_models');
