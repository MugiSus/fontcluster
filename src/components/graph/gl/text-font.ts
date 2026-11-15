import geistRegularWoff from '@fontsource/geist/files/geist-latin-400-normal.woff?inline';

// The woff ships inlined as a data URI (a runtime asset fetch is not
// guaranteed to reach troika's in-worker XHR through Tauri's custom
// protocol), converted once to an object URL so each member's worker sync
// message carries a short string rather than the ~40KB data URI.
export const GEIST_FONT_URL = URL.createObjectURL(
  new Blob(
    [
      Uint8Array.from(atob(geistRegularWoff.split(',')[1] ?? ''), (char) =>
        char.charCodeAt(0),
      ),
    ],
    { type: 'font/woff' },
  ),
);
