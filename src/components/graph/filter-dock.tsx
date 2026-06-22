import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  Show,
} from 'solid-js';
import { SearchIcon, XIcon } from 'lucide-solid';
import { appState } from '../../store';
import { setSelectedFontKey } from '../../actions';
import { cn } from '../../lib/utils';
import { type FontWeight } from '../../types/font';
import { useFilteredFontMetadataKeys } from '../../hooks/use-filtered-font-metadata-keys';
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

  const [inputValue, setInputValue] = createSignal(appState.ui.searchQuery);
  const isFiltered = createMemo(() => appState.ui.searchQuery.length > 0);

  let dockElement: HTMLDivElement | undefined;
  let inputElement: HTMLInputElement | undefined;

  const handleQueryChange = (value: string) => {
    setInputValue(value);
    onQueryChange(value);
  };

  const handleClear = () => {
    setInputValue('');
    onQueryChange('');
    inputElement?.focus();
  };

  // Focus the field on open, and disable interaction/focus while hidden so the
  // off-screen dock never traps tab order behind the canvas.
  createEffect(() => {
    if (dockElement) {
      dockElement.inert = !props.open;
    }
    if (props.open) {
      queueMicrotask(() => inputElement?.focus());
    }
  });

  // Dismiss on outside click or Escape, ignoring the toolbar toggle button.
  createEffect(() => {
    if (!props.open) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (
        !dockElement?.contains(target) &&
        !target.closest('[data-filter-toggle]')
      ) {
        props.onClose();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        props.onClose();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    onCleanup(() => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    });
  });

  return (
    <div
      ref={dockElement}
      class={cn(
        'pointer-events-none absolute bottom-2 left-1/2 z-20 -translate-x-1/2 transition-[opacity,transform] duration-200 ease-out',
        props.open ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
      )}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div
        class={cn(
          'flex items-center gap-1 rounded-full border border-border/25 bg-background/75 p-1 shadow backdrop-blur-md',
          props.open ? 'pointer-events-auto' : 'pointer-events-none',
        )}
      >
        <div class='relative flex items-center'>
          <Show
            when={isFiltered()}
            fallback={
              <SearchIcon class='pointer-events-none absolute left-3 size-4 text-muted-foreground' />
            }
          >
            <button
              type='button'
              onClick={handleClear}
              aria-label='Clear'
              class='absolute left-1.5 flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'
            >
              <XIcon class='size-3.5' />
            </button>
          </Show>
          <input
            ref={inputElement}
            type='text'
            placeholder='Font name, Designer, Foundry, etc...'
            class='h-8 w-64 rounded-full bg-transparent pl-10 pr-3 text-sm font-medium outline-none placeholder:text-xs placeholder:font-normal placeholder:text-muted-foreground'
            value={inputValue()}
            onInput={(event) => handleQueryChange(event.currentTarget.value)}
            spellcheck={false}
          />
        </div>

        <Show
          when={props.weights.length > 1 ? props.weights.join(',') : false}
          keyed
        >
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
