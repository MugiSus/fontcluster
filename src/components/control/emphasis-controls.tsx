import { For } from 'solid-js';
import { ChevronRightIcon } from 'lucide-solid';

import { useI18n } from '@/i18n';
import { appState } from '@/store';
import { EMPHASIS_ATTRIBUTES } from '@/constants/session';
import { NumberProperty } from './number-property';

type EmphasisControlsProps = {
  /** Disables every attribute input (mirrors the "enable emphasis" switch). */
  disabled?: boolean;
};

/**
 * Collapsible list of the 37 O'Donovan attribute-emphasis inputs (-4..4).
 *
 * Presentational: each input's value is read from the enclosing `<form>` on
 * submit (see `parseClusteringConfig`), so this only seeds defaults from the
 * session and renders. Collapsed by default so the long list stays out of the
 * way of the primary clustering parameters.
 */
export function EmphasisControls(props: EmphasisControlsProps) {
  const { t } = useI18n();

  return (
    <details class='group/emphasis'>
      <summary class='flex cursor-pointer select-none list-none items-center gap-1 py-1.5 text-xs font-semibold capitalize text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden'>
        <ChevronRightIcon class='size-3.5 transition-transform group-open/emphasis:rotate-90' />
        {t.controlPanel.emphasis.title()}
      </summary>
      <div class='flex flex-col'>
        <For each={EMPHASIS_ATTRIBUTES}>
          {(attribute) => (
            <NumberProperty
              label={t.controlPanel.emphasis.attributes[attribute]()}
              name={`clustering-emphasis-${attribute}`}
              defaultValue={
                appState.session.algorithm.clustering.emphasis?.[attribute] ?? 0
              }
              disabled={props.disabled}
              step={1}
              minValue={-4}
              maxValue={4}
            />
          )}
        </For>
      </div>
    </details>
  );
}
