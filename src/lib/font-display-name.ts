import type { FontMetadata } from '@/types/font';

/** Derives a localized display name without changing the font's identity. */
export function getFontDisplayName(font: FontMetadata, locale: string): string {
  const languageKeys =
    locale === 'ja'
      ? ['ja-JP', 'ja', '1041', 'en-US', 'en', '1033']
      : ['en-US', 'en', '1033'];
  const [family, style] = [
    font.preferred_family_names,
    font.preferred_style_names,
  ].map(
    (names) =>
      languageKeys.map((key) => names?.[key]?.trim()).find(Boolean) ??
      Object.values(names ?? {})
        .find((name) => name.trim())
        ?.trim(),
  );
  if (!family) return font.font_name;
  return [family, style || font.style_name?.trim()].filter(Boolean).join(' ');
}
