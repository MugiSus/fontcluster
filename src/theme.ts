/**
 * Theme (color-mode) selection ownership.
 *
 * Kobalte's `ColorModeProvider` only exposes the *resolved* mode (`light` /
 * `dark`) — never whether the user picked `system`. This module owns the
 * *configured* selection in a single persisted signal and hands Kobalte a
 * storage-manager adapter backed by that signal, so the configured mode has one
 * authoritative, reactive source instead of being trapped inside Kobalte.
 */
import { createSignal } from 'solid-js';
import { makePersisted } from '@solid-primitives/storage';
import type { ColorModeStorageManager, ConfigColorMode } from '@kobalte/core';

const THEME_STORAGE_KEY = 'vite-ui-theme';

const isConfigColorMode = (value: unknown): value is ConfigColorMode =>
  value === 'light' || value === 'dark' || value === 'system';

const [themeMode, setThemeMode] = makePersisted(
  // makePersisted owns this signal and returns the same [get, set] tuple,
  // which we destructure above; the rule can't see through the wrapper.
  // eslint-disable-next-line solid/reactivity
  createSignal<ConfigColorMode>('system'),
  {
    name: THEME_STORAGE_KEY,
    // Persist the bare mode string (not JSON) to stay compatible with the
    // format Kobalte's own localStorage manager previously wrote.
    serialize: (value) => value,
    deserialize: (stored) => (isConfigColorMode(stored) ? stored : 'system'),
  },
);

/** The configured color-mode selection (`light` | `dark` | `system`). */
export { themeMode };

/**
 * Storage-manager adapter for `ColorModeProvider`. Kobalte owns the resolved
 * mode and writes the configured value here on every change; this signal is the
 * single persisted source of truth that the UI reads for the active selection.
 */
export const themeStorageManager: ColorModeStorageManager = {
  type: 'localStorage',
  get: (fallback) => themeMode() ?? fallback,
  set: (value) => setThemeMode(value),
};
