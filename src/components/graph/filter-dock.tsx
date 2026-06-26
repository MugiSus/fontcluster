import { createEffect, createMemo, createSignal, Show } from 'solid-js';
import { SearchIcon, XIcon } from 'lucide-solid';
import { t } from '@/i18n';
import { appState } from '../../store';
import { setSelectedFontKey } from '../../actions';
import { cn } from '../../lib/utils';
import { type FontWeight } from '../../types/font';
import { useFilteredFontMetadataKeys } from '../../hooks/use-filtered-font-metadata-keys';
import { useDismiss } from '../../hooks/use-dismiss';
import { WeightSelector } from '../weight-selector';

interface GraphFilterDockProps {
  isOpen: boolean;
  weights: FontWeight[];
  onWeightsChange: (weights: FontWeight[]) => void;
  onClose: () => void;
}

export function GraphFilterDock(props: GraphFilterDockProps) {
  const { onQueryChange } = useFilteredFontMetadataKeys({
    onFontSelect: (key) => setSelectedFontKey(key),
  });

  const [query, setQuery] = createSignal(appState.ui.searchQuery);
  const isFiltered = createMemo(() => appState.ui.searchQuery.length > 0);

  let inputElement: HTMLInputElement | undefined;

  const dismissRef = useDismiss({
    enabled: () => props.isOpen,
    onDismiss: () => props.onClose(),
    ignoreSelector: '[data-filter-toggle]',
  });

  const updateQuery = (value: string) => {
    setQuery(value);
    onQueryChange(value);
  };

  // Move focus into the field whenever the dock opens.
  createEffect(() => {
    if (props.isOpen) queueMicrotask(() => inputElement?.focus());
  });

  return (
    <div
      ref={dismissRef}
      inert={!props.isOpen}
      onMouseDown={(event) => event.stopPropagation()}
      class={cn(
        'absolute left-0 right-0 z-20 mx-auto w-max rounded-full border border-border/25 bg-background/50 shadow-md backdrop-blur-md transition-[bottom,opacity] duration-300 ease-out',
        props.isOpen ? 'bottom-4 opacity-100' : 'bottom-0 opacity-0',
      )}
    >
      <div class='flex items-center gap-1 rounded-full p-1 shadow-inner-background'>
        <div class='relative flex items-center'>
          <Show
            when={isFiltered()}
            fallback={
              <SearchIcon class='pointer-events-none absolute left-2 size-4 text-muted-foreground' />
            }
          >
            <button
              type='button'
              aria-label={t('common.clear')}
              onClick={() => {
                updateQuery('');
                inputElement?.focus();
              }}
              class='absolute left-0.5 flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'
            >
              <XIcon class='size-4' />
            </button>
          </Show>
          <input
            ref={inputElement}
            type='text'
            placeholder={t('graph.searchPlaceholder')}
            class='h-8 w-64 bg-transparent pl-9 pr-3 text-sm font-medium outline-none placeholder:text-xs placeholder:font-normal placeholder:text-muted-foreground'
            value={query()}
            onInput={(event) => updateQuery(event.currentTarget.value)}
            spellcheck={false}
          />
        </div>

        <Show when={props.weights.length > 1 && props.weights.join(',')} keyed>
          <div class='mx-0.5 h-5 w-px bg-border/60' />
          <WeightSelector
            isBare
            isCompact
            weights={props.weights}
            defaultValue={[]}
            onChange={(weights) =>
              props.onWeightsChange(
                weights.length > 0 ? weights : props.weights,
              )
            }
          />
        </Show>
      </div>
    </div>
  );
}
