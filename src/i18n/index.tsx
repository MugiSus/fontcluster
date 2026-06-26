/**
 * i18n provider.
 *
 * The active locale is a single signal owned by {@link I18nProvider} (the
 * single source of truth); `localStorage` is only a persistence mirror written
 * through `setLocale`/`useSystemLocale`. Components read the translator via
 * {@link useI18n}; switching locale updates every `t(...)` read inside a
 * tracking scope (JSX, effects) automatically.
 *
 * Non-component services (`actions.ts`, `lib/updater.ts`) run with no owner on
 * the stack, so they cannot call {@link useI18n}. They instead receive the
 * translator as a {@link Translate} argument from their caller, which always
 * has access to it. Toast copy is a plain string snapshot, so this is just
 * passing a function — no reactivity crosses the boundary.
 */
import {
  type Accessor,
  type ParentProps,
  createContext,
  createMemo,
  createSignal,
  onMount,
  useContext,
} from 'solid-js';
import * as i18n from '@solid-primitives/i18n';
import { en } from './en';
import { ja } from './ja';

export type Locale = 'en' | 'ja';
export type Dictionary = typeof en;
export type TranslationKey = keyof i18n.Flatten<Dictionary>;
/** Type of the `t` function, for services that receive it as an argument. */
export type Translate = i18n.Translator<i18n.Flatten<Dictionary>>;

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

interface I18nContextValue {
  /** Translate a dictionary key, optionally resolving `{{placeholder}}` args. */
  t: Translate;
  /** The active locale. Reactive — read inside JSX to update on change. */
  locale: Accessor<Locale>;
  /** Set and persist the user's explicit language choice. */
  setLocale: (next: Locale) => void;
  /** Clear the explicit preference and follow the system locale instead. */
  useSystemLocale: () => Promise<void>;
}

const I18nContext = createContext<I18nContextValue>();

export function I18nProvider(props: ParentProps) {
  // Synchronous best guess to avoid a flash of the wrong language before the
  // async system locale (a Tauri round-trip) resolves. An explicit stored
  // choice always wins.
  const initialLocale: Locale =
    readStoredLocale() ?? normalizeLocale(navigator.language) ?? 'en';

  const [locale, setLocaleSignal] = createSignal<Locale>(initialLocale);
  const dictionary = createMemo(() => i18n.flatten(dictionaries[locale()]));
  // translator() stores this accessor and calls it lazily; reactivity is
  // preserved at each t() call site (which reads the memo inside its own
  // tracking scope), so the rule's "used outside a tracked scope" check is a
  // false positive here.
  // eslint-disable-next-line solid/reactivity
  const t = i18n.translator(dictionary, i18n.resolveTemplate);

  const setLocale = (next: Locale) => {
    setLocaleSignal(next);
    persistLocale(next);
  };

  // Resolve the OS locale via the Tauri OS plugin and apply it unless the user
  // has an explicit stored preference. `force` ignores the stored preference.
  const syncFromSystem = async (force = false) => {
    if (!force && readStoredLocale()) return;
    try {
      const { locale: getOsLocale } = await import('@tauri-apps/plugin-os');
      const system = normalizeLocale(await getOsLocale());
      if (system) setLocaleSignal(system);
    } catch (error) {
      console.error('Failed to detect system locale:', error);
    }
  };

  const useSystemLocale = async () => {
    persistLocale(null);
    await syncFromSystem(true);
  };

  onMount(() => void syncFromSystem());

  return (
    <I18nContext.Provider value={{ t, locale, setLocale, useSystemLocale }}>
      {props.children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an <I18nProvider>');
  }
  return context;
}
