import { invoke } from '@tauri-apps/api/core';
import type { ModelCatalogResponse } from '@/types/model';

/**
 * Reads the backend-owned model catalog and local installation status.
 *
 * The command may return installed entries together with a recoverable remote
 * catalog warning. This adapter performs no frontend caching or installation;
 * Solid resources decide when to refetch, and processing jobs own downloads.
 */
export const listModels = () => invoke<ModelCatalogResponse>('list_models');
