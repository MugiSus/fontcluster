import { createEffect, createMemo, createSignal, Show } from 'solid-js';
import { SearchIcon, XIcon } from 'lucide-solid';
import { appState } from '../../store';
import { setSelectedFontKey } from '../../actions';
import { cn } from '../../lib/utils';
import { type FontWeight } from '../../types/font';
import { useFilteredFontMetadataKeys } from '../../hooks/use-filtered-font-metadata-keys';
import { useDismiss } from '../../hooks/use-dismiss';
import { WeightSelector } from '../weight-selector';

interface GraphFilterDockProps {
  open: boolean;
  weights: FontWeight[];
  activeWeights: FontWeight[];
  onWeightsChange: (weights: FontWeight[]) => void;
  onClose: () => void;
}

export function GraphFilterDock(props: GraphFilterDockProps) {
  const { onQueryChange } = useFilteredFontMetadataKeys({
    onFontSelect: (key) => setSelectedFontKey(key),
  });

  const [query, setQuery] = createSignal(appState.ui.searchQuery);
  const isFiltered = createMemo(() => appState.ui.searchQuery.length > 0);
  const hasWeightOptions = createMemo(() => props.weights.length > 1);

  let inputElement: HTMLInputElement | undefined;

  const dismissRef = useDismiss({
    enabled: () => props.open,
    onDismiss: () => props.onClose(),
    ignoreSelector: '[data-filter-toggle]',
  });

  const updateQuery = (value: string) => {
    setQuery(value);
    onQueryChange(value);
  };

  // Move focus into the field whenever the dock opens.
  createEffect(() => {
    if (props.open) queueMicrotask(() => inputElement?.focus());
  });

  return (
    <div
      ref={dismissRef}
      inert={!props.open}
      onMouseDown={(event) => event.stopPropagation()}
      class={cn(
        'absolute left-0 right-0 z-20 mx-auto w-max transition-[bottom,opacity] duration-300 ease-out',
        props.open ? 'bottom-4 opacity-100' : 'bottom-0 opacity-0',
      )}
    >
      <div class='shadow-inner-background flex items-center gap-1 rounded-full border border-border/25 bg-background/50 p-1 shadow-md backdrop-blur-md'>
        <div class='relative flex items-center'>
          <Show
            when={isFiltered()}
            fallback={
              <SearchIcon class='pointer-events-none absolute left-2 size-4 text-muted-foreground' />
            }
          >
            <button
              type='button'
              aria-label='Clear'
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
            placeholder='Font name, Designer, Foundry, etc...'
            class='h-8 w-64 bg-transparent pl-9 pr-3 text-sm font-medium outline-none placeholder:text-xs placeholder:font-normal placeholder:text-muted-foreground'
            value={query()}
            onInput={(event) => updateQuery(event.currentTarget.value)}
            spellcheck={false}
          />
        </div>

        <Show when={hasWeightOptions()}>
          <div class='mx-0.5 h-5 w-px bg-border/60' />
          <WeightSelector
            isBare
            isCompact
            weights={props.weights}
            defaultValue={props.activeWeights}
            onChange={props.onWeightsChange}
            showUnavailableWeights
          />
        </Show>
      </div>
    </div>
  );
}
