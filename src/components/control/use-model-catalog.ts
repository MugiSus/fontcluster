import { createMemo, createResource, createSignal } from 'solid-js';
import { downloadModel, listModels } from '@/lib/models';

/** Backend-owned availability and an explicit download action for the control UI. */
export function useModelCatalog() {
  const [catalog, { refetch }] = createResource(listModels);
  const [isDownloading, setIsDownloading] = createSignal(false);
  const warning = createMemo(() => {
    const error = catalog.error;
    if (error) return error instanceof Error ? error.message : String(error);
    return catalog()?.warning ?? null;
  });

  const download = async (modelId: string) => {
    if (isDownloading()) return;
    setIsDownloading(true);
    try {
      await downloadModel(modelId);
    } finally {
      setIsDownloading(false);
      void refetch();
    }
  };

  return { catalog, refetch, warning, download, isDownloading };
}
