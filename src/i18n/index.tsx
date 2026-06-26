/**
 * i18n provider.
 *
 * The active locale is a single signal owned by {@link I18nProvider} (the
 * single source of truth). Components read the translator via {@link useI18n};
 * switching locale updates every `t.some.key()` read inside a tracking scope
 * (JSX, effects) automatically.
 */
import {
  type Accessor,
  type ParentProps,
  createContext,
  createMemo,
  createSignal,
  useContext,
} from 'solid-js';
import * as i18n from '@solid-primitives/i18n';
import { en } from './en';
import { ja } from './ja';

export type Locale = 'en' | 'ja';
export type Dictionary = typeof en;

const dictionaries: Record<Locale, Dictionary> = { en, ja };

interface I18nContextValue {
  /** Object-shaped translator for UI call sites. */
  t: i18n.ChainedTranslator<Dictionary>;
  /** The active locale. Reactive — read inside JSX to update on change. */
  locale: Accessor<Locale>;
  /** Set the active language. */
  setLocale: (next: Locale) => void;
}

const I18nContext = createContext<I18nContextValue>();

export function I18nProvider(props: ParentProps) {
  const [locale, setLocale] = createSignal<Locale>('en');
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
    <I18nContext.Provider value={{ t, locale, setLocale }}>
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
