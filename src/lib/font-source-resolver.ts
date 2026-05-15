import { appState } from '../store';

const GOOGLE_FONTS_DIRECTORY_NAME = 'google_fonts';

export function resolveGoogleFontFilePath(
  familyName: string,
  weight: number,
): string | null {
  if (!appState.session.directory) return null;

  const fileName = `${familyName.replaceAll(' ', '_')}_Weight${weight}.ttf`;
  return `${appState.session.directory}/${GOOGLE_FONTS_DIRECTORY_NAME}/${fileName}`;
}
