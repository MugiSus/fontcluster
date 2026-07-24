import { createSignal, For, Show } from 'solid-js';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
import { type FontWeight, WEIGHT_LABELS } from '@/types/font';
import { WeightIcon } from 'lucide-solid';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

interface WeightSelectorProps {
  weights: FontWeight[];
  defaultValue?: FontWeight[];
  name?: string;
  onChange?: (weights: FontWeight[]) => void;
  isChanged?: boolean;
  isVertical?: boolean;
  isCompact?: boolean;
  isBare?: boolean;
  /** Allow a multi-weight subset; defaults to single-select (0 or 1). */
  isMultiple?: boolean;
  showUnavailableWeights?: boolean;
}

export function WeightSelector(props: WeightSelectorProps) {
  const computeSelectedFromDefaults = (): FontWeight[] => {
    const defaultValue = props.defaultValue ?? ([400] as FontWeight[]);
    const selectableWeights = new Set(props.weights);
    return defaultValue.filter((weight) => selectableWeights.has(weight));
  };
  const [selectedWeights, setSelectedWeights] = createSignal(
    computeSelectedFromDefaults(),
  );
  const displayedWeights = () =>
    props.showUnavailableWeights
      ? (Object.keys(WEIGHT_LABELS).map(Number) as FontWeight[])
      : props.weights;

  // ToggleGroup owns the selection; we mirror it into a signal so the hidden
  // input can serialize it for form submit and so onChange can surface numbers.
  const applySelection = (weights: FontWeight[]) => {
    setSelectedWeights(weights);
    props.onChange?.(weights);
  };
  // Single mode fires string|null, multiple fires string[]; normalize both.
  const handleChange = (value: string | string[] | null) =>
    applySelection(
      (Array.isArray(value) ? value : value ? [value] : [])
        .map(Number)
        .toSorted((a, b) => a - b) as FontWeight[],
    );

  const groupClass = () =>
    cn(
      'items-stretch',
      props.isVertical ? 'flex-col' : 'flex-row',
      props.isBare ? 'gap-0.5' : 'gap-0.5 overflow-hidden bg-background',
    );

  // The toggles are identical in both modes; only ToggleGroup's value shape
  // (single string|null vs multiple string[]) differs, so we branch just the
  // group wrapper and share this item list.
  const items = () => (
    <>
      <input
        type='hidden'
        name={props.name || 'weights'}
        value={selectedWeights().join(',')}
      />
      <Show when={!props.isCompact}>
        <div class='flex size-8 items-center justify-center'>
          <WeightIcon
            class='size-3 text-muted-foreground'
            classList={{ '!text-primary': props.isChanged }}
          />
        </div>
      </Show>
      <For each={displayedWeights().toSorted()}>
        {(weight) => {
          const isSelectable = () => props.weights.includes(weight);

          return (
            <Tooltip placement={props.isVertical ? 'left' : 'bottom'}>
              <TooltipTrigger
                as={ToggleGroupItem<'button'>}
                value={String(weight)}
                type='button'
                class={cn(
                  'size-8 pt-0.5 text-xs text-muted-foreground hover:text-foreground',
                  props.isBare ? 'rounded-full' : 'grow rounded px-0',
                  props.isChanged && '!text-primary',
                )}
                style={{ 'font-weight': weight }}
                disabled={!isSelectable()}
              >
                {WEIGHT_LABELS[weight].short}
              </TooltipTrigger>
              <TooltipContent>{WEIGHT_LABELS[weight].full}</TooltipContent>
            </Tooltip>
          );
        }}
      </For>
    </>
  );

  return (
    <Show
      when={props.isMultiple}
      fallback={
        // Single mode is a start-empty filter, so it takes no defaultValue.
        <ToggleGroup
          showDot
          dotSide={props.isVertical ? 'right' : 'top'}
          onChange={handleChange}
          class={groupClass()}
        >
          {items()}
        </ToggleGroup>
      }
    >
      <ToggleGroup
        multiple
        showDot
        dotSide={props.isVertical ? 'right' : 'top'}
        defaultValue={computeSelectedFromDefaults().map(String)}
        onChange={handleChange}
        class={groupClass()}
      >
        {items()}
      </ToggleGroup>
    </Show>
  );
}
