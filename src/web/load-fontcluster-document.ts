import { unzip, type Unzipped } from 'fflate';
import {
  type ComputedData,
  type FontItem,
  type FontItemRecord,
  type FontMetadata,
} from '@/types/font';
import { type DendrogramData, type SessionConfig } from '@/types/session';

const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 8_192;
const MAX_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
const SAMPLE_ENTRY_PATTERN =
  /^samples\/([^/]+)\/(?:meta\.json|computed\.json|sample\.png)$/;

export interface LoadedFontClusterDocument {
  sessionKey: string;
  config: SessionConfig;
  fonts: FontItemRecord;
  dendrogram: DendrogramData;
  sampleImageUrl: (safeName: string) => string | undefined;
  dispose: () => void;
}

export async function loadFontClusterDocument(
  url: string,
): Promise<LoadedFontClusterDocument> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch fontcluster document (${response.status} ${response.statusText})`,
    );
  }

  const contentLength = response.headers.get('content-length');
  if (
    contentLength !== null &&
    Number.isFinite(Number(contentLength)) &&
    Number(contentLength) > MAX_ARCHIVE_BYTES
  ) {
    throw new Error('Fontcluster document exceeds the 32 MiB archive limit');
  }

  const archiveBytes = new Uint8Array(await response.arrayBuffer());
  if (archiveBytes.byteLength > MAX_ARCHIVE_BYTES) {
    throw new Error('Fontcluster document exceeds the 32 MiB archive limit');
  }

  const entries = await new Promise<Unzipped>((resolve, reject) => {
    let entryCount = 0;
    let uncompressedBytes = 0;
    let archiveLimitError: Error | undefined;

    unzip(
      archiveBytes,
      {
        filter: (entry) => {
          entryCount += 1;
          if (entryCount > MAX_ARCHIVE_ENTRIES) {
            archiveLimitError ??= new Error(
              `Fontcluster document exceeds the ${MAX_ARCHIVE_ENTRIES.toLocaleString()} entry limit`,
            );
            return false;
          }

          const isSelected =
            entry.name === 'config.json' ||
            entry.name === 'dendrogram.json' ||
            SAMPLE_ENTRY_PATTERN.test(entry.name);
          if (!isSelected) return false;

          uncompressedBytes += entry.originalSize;
          if (uncompressedBytes > MAX_UNCOMPRESSED_BYTES) {
            archiveLimitError ??= new Error(
              'Fontcluster document exceeds the 64 MiB uncompressed data limit',
            );
            return false;
          }
          return true;
        },
      },
      (error, unzipped) => {
        if (archiveLimitError) {
          reject(archiveLimitError);
        } else if (error) {
          reject(error);
        } else {
          resolve(unzipped);
        }
      },
    );
  });

  const imageUrls = new Map<string, string>();
  try {
    const decoder = new TextDecoder();
    const parseJson = <T>(path: string): T => {
      const entry = entries[path];
      if (!entry) {
        throw new Error(`Fontcluster document is missing ${path}`);
      }
      try {
        return JSON.parse(decoder.decode(entry)) as T;
      } catch (error) {
        throw new Error(`Fontcluster document contains invalid ${path}`, {
          cause: error,
        });
      }
    };

    const config = parseJson<SessionConfig>('config.json');
    if (
      typeof config?.session_id !== 'string' ||
      typeof config.modified_at !== 'string' ||
      config.status?.process_status !== 'clustered'
    ) {
      throw new Error(
        'Fontcluster document must contain a completed clustered session',
      );
    }

    const dendrogram = parseJson<DendrogramData>('dendrogram.json');
    const leafCount = dendrogram?.ids?.length ?? 0;
    if (
      !Array.isArray(dendrogram?.ids) ||
      leafCount === 0 ||
      !dendrogram.ids.every((safeName) => typeof safeName === 'string') ||
      new Set(dendrogram.ids).size !== dendrogram.ids.length ||
      !Array.isArray(dendrogram.merges) ||
      dendrogram.merges.length !== leafCount - 1 ||
      !dendrogram.merges.every((merge, mergeIndex) => {
        const createdNodeIndex = leafCount + mergeIndex;
        return (
          Number.isInteger(merge.left) &&
          merge.left >= 0 &&
          merge.left < createdNodeIndex &&
          Number.isInteger(merge.right) &&
          merge.right >= 0 &&
          merge.right < createdNodeIndex &&
          merge.left !== merge.right &&
          Number.isFinite(merge.height) &&
          merge.height >= 0 &&
          Number.isInteger(merge.representative) &&
          merge.representative >= 0 &&
          merge.representative < leafCount
        );
      })
    ) {
      throw new Error('Fontcluster document contains an invalid dendrogram');
    }

    const fontEntries: [string, FontItem][] = [];
    for (const safeName of dendrogram.ids) {
      const meta = parseJson<FontMetadata>(`samples/${safeName}/meta.json`);
      const computed = parseJson<ComputedData>(
        `samples/${safeName}/computed.json`,
      );
      const sample = entries[`samples/${safeName}/sample.png`];
      if (meta?.safe_name !== safeName) {
        throw new Error(
          `Fontcluster document metadata does not match ${safeName}`,
        );
      }
      const clustering = computed?.clustering;
      if (
        !clustering ||
        !Number.isInteger(clustering.k) ||
        clustering.k < 0 ||
        !Number.isFinite(clustering.join_height) ||
        !Number.isInteger(clustering.color_index) ||
        clustering.color_index < 0 ||
        (clustering.two !== undefined &&
          (!Array.isArray(clustering.two) ||
            clustering.two.length !== 2 ||
            !clustering.two.every(Number.isFinite)))
      ) {
        throw new Error(
          `Fontcluster document contains invalid clustered data for ${safeName}`,
        );
      }
      if (!sample) {
        throw new Error(
          `Fontcluster document is missing samples/${safeName}/sample.png`,
        );
      }

      fontEntries.push([safeName, { meta, computed }]);
      imageUrls.set(
        safeName,
        URL.createObjectURL(new Blob([sample], { type: 'image/png' })),
      );
    }

    return {
      sessionKey: `${config.session_id}:${config.modified_at}`,
      config,
      fonts: Object.fromEntries(fontEntries),
      dendrogram,
      sampleImageUrl: (safeName) => imageUrls.get(safeName),
      dispose: () => {
        for (const imageUrl of imageUrls.values()) {
          URL.revokeObjectURL(imageUrl);
        }
        imageUrls.clear();
      },
    };
  } catch (error) {
    for (const imageUrl of imageUrls.values()) {
      URL.revokeObjectURL(imageUrl);
    }
    throw error;
  }
}
