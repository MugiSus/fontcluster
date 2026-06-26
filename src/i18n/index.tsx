/**
 * i18n provider.
 *
 * The selected language is owned by {@link I18nProvider}. The effective locale
 * is derived from that selection and, for `system`, from the OS locale exposed
 * by Tauri's official OS plugin.
 */
import {
  type Accessor,
  type ParentProps,
  createContext,
  createMemo,
  createResource,
  createSignal,
  useContext,
} from 'solid-js';
import { locale as getSystemLocale } from '@tauri-apps/plugin-os';
import * as i18n from '@solid-primitives/i18n';
import { makePersisted } from '@solid-primitives/storage';
import { en } from './en';
import { ja } from './ja';

export type Locale = 'en' | 'ja';
export type LanguageSelection = Locale | 'system';
export type Dictionary = typeof en;

const dictionaries: Record<Locale, Dictionary> = { en, ja };
const LANGUAGE_STORAGE_KEY = 'fontcluster:language';

const isLanguageSelection = (value: unknown): value is LanguageSelection =>
  value === 'system' || value === 'en' || value === 'ja';

interface I18nContextValue {
  /** Object-shaped translator for UI call sites. */
  t: i18n.ChainedTranslator<Dictionary>;
  /** The active locale. Reactive — read inside JSX to update on change. */
  locale: Accessor<Locale>;
  /** The selected language option. */
  language: Accessor<LanguageSelection>;
  /** Set the active language option. */
  setLanguage: (next: LanguageSelection) => void;
}

const I18nContext = createContext<I18nContextValue>();

export function I18nProvider(props: ParentProps) {
  // The selection is owned by this signal; makePersisted mirrors it to
  // localStorage (matching the theme manager) without duplicating the source of
  // truth. An unknown stored value falls back to `system`.
  const [language, setLanguage] = makePersisted(
    // makePersisted owns this signal and returns the same [get, set] tuple,
    // which we destructure above; the rule can't see through the wrapper.
    // eslint-disable-next-line solid/reactivity
    createSignal<LanguageSelection>('system'),
    {
      name: LANGUAGE_STORAGE_KEY,
      // Persist the bare selection string (not JSON) so values stay
      // human-readable and compatible with the prior localStorage format.
      serialize: (value) => value,
      deserialize: (stored) =>
        isLanguageSelection(stored) ? stored : 'system',
    },
  );

  const [systemLocale] = createResource<Locale>(async () => {
    const tag = await getSystemLocale().catch((error) => {
      console.error('Failed to get system locale:', error);
      return null;
    });

    return tag?.toLowerCase().startsWith('ja') ? 'ja' : 'en';
  });

  const locale = createMemo<Locale>(() => {
    const selected = language();
    return selected === 'system' ? (systemLocale() ?? 'en') : selected;
  });

  const dictionary = createMemo(() => i18n.flatten(dictionaries[locale()]));

  // translator() stores this accessor and calls it lazily; reactivity is
  // preserved at each t() call site (which reads the memo inside its own
  // tracking scope), so the rule's "used outside a tracked scope" check is a
  // false positive here.
  // eslint-disable-next-line solid/reactivity
  const translate = i18n.translator(dictionary, i18n.resolveTemplate);
  const t = i18n.chainedTranslator(
    en,
    translate as unknown as i18n.Translator<Dictionary>,
  );

  return (
    <I18nContext.Provider value={{ t, locale, language, setLanguage }}>
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
