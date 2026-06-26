/**
 * i18n owner module.
 *
 * The active locale is a single signal owned here (the single source of truth);
 * `localStorage` is only a persistence mirror written through this module's API.
 * The reactive graph lives in a long-lived {@link createRoot} so the dictionary
 * memo and translator survive for the whole app without leaking.
 *
 * `t` is a module-level singleton intentionally: toasts are fired from plain
 * service functions (`actions.ts`, `lib/updater.ts`) that live outside the
 * component tree, where a context-based translator would be unreachable.
 * Reading `t(...)` inside JSX still tracks the locale signal and updates
 * reactively; reading it from a service is a one-shot, non-tracked lookup.
 */
import { createMemo, createRoot, createSignal, type Accessor } from 'solid-js';
import * as i18n from '@solid-primitives/i18n';
import { en } from './en';
import { ja } from './ja';

export type Locale = 'en' | 'ja';
export type Dictionary = typeof en;
export type TranslationKey = keyof i18n.Flatten<Dictionary>;

const SUPPORTED_LOCALES = ['en', 'ja'] as const;
const STORAGE_KEY = 'fontcluster:locale';

const dictionaries: Record<Locale, Dictionary> = { en, ja };

/** Map a BCP-47 tag (e.g. `ja-JP`) onto a supported locale, or null. */
function normalizeLocale(tag: string | null | undefined): Locale | null {
  if (!tag) return null;
  const lower = tag.toLowerCase();
  return (
    SUPPORTED_LOCALES.find((supported) => lower.startsWith(supported)) ?? null
  );
}

function readStoredLocale(): Locale | null {
  try {
    return normalizeLocale(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function persistLocale(next: Locale | null) {
  try {
    if (next) localStorage.setItem(STORAGE_KEY, next);
    else localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to persist locale preference:', error);
  }
}

// Synchronous best guess to avoid a flash of the wrong language before the
// async system locale (which needs a Tauri round-trip) resolves. An explicit
// stored choice always wins.
const initialLocale: Locale =
  readStoredLocale() ?? normalizeLocale(navigator.language) ?? 'en';

const root = createRoot(() => {
  const [locale, setLocaleSignal] = createSignal<Locale>(initialLocale);
  const dictionary = createMemo(() => i18n.flatten(dictionaries[locale()]));
  // translator() stores this accessor and calls it lazily; reactivity is
  // preserved at each t() call site (which reads the memo inside its own
  // tracking scope), so the rule's "used outside a tracked scope" check is a
  // false positive here.
  // eslint-disable-next-line solid/reactivity
  const translate = i18n.translator(dictionary, i18n.resolveTemplate);
  return { locale, setLocaleSignal, translate };
});

/** The active locale. Reactive — read inside JSX to update on change. */
export const locale: Accessor<Locale> = root.locale;

/** Translate a dictionary key, optionally resolving `{{placeholder}}` args. */
export const t = root.translate;

/** Whether the user has an explicit, persisted language preference. */
export function hasStoredLocale(): boolean {
  return readStoredLocale() !== null;
}

/** Set and persist the user's explicit language choice. */
export function setLocale(next: Locale) {
  root.setLocaleSignal(next);
  persistLocale(next);
}

/**
 * Resolve the OS locale (BCP-47) via the Tauri OS plugin and apply it unless
 * the user has an explicit stored preference. `force` ignores the stored
 * preference (used right after clearing it).
 */
export async function syncLocaleFromSystem(force = false) {
  if (!force && hasStoredLocale()) return;
  try {
    const { locale: getOsLocale } = await import('@tauri-apps/plugin-os');
    const system = normalizeLocale(await getOsLocale());
    if (system) root.setLocaleSignal(system);
  } catch (error) {
    console.error('Failed to detect system locale:', error);
  }
}

/** Clear the explicit preference and follow the system locale instead. */
export async function useSystemLocale() {
  persistLocale(null);
  await syncLocaleFromSystem(true);
}
