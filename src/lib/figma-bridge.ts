import { invoke } from '@tauri-apps/api/core';
import type { FontMetadata } from '@/types/font';

export interface FigmaFontPayload {
  source: 'fontcluster';
  version: 1;
  safeName: string;
  fontName: string;
  familyName: string;
  familyNames: Record<string, string>;
  preferredFamilyNames: Record<string, string>;
  weight: number;
  weights: string[];
}

export function createFigmaFontPayload(
  metadata: FontMetadata,
): FigmaFontPayload {
  return {
    source: 'fontcluster',
    version: 1,
    safeName: metadata.safe_name,
    fontName: metadata.font_name,
    familyName: metadata.family_name,
    familyNames: metadata.family_names,
    preferredFamilyNames: metadata.preferred_family_names,
    weight: metadata.weight,
    weights: metadata.weights,
  };
}

export function sendFontToFigma(metadata: FontMetadata): Promise<number> {
  return invoke<number>('send_font_to_figma', {
    payload: createFigmaFontPayload(metadata),
  });
}
