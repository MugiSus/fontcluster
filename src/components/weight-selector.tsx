import { createSignal, For, Show } from 'solid-js';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
import { type FontWeight, WEIGHT_LABELS } from '../types/font';
import { WeightIcon } from 'lucide-solid';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

interface WeightSelectorProps {
  weights: FontWeight[];
  defaultValue?: FontWeight[];
  name?: string;
  onChange?: (weights: FontWeight[]) => void;
  isVertical?: boolean;
  isCompact?: boolean;
  isBare?: boolean;
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
  const handleChange = (values: string[]) => {
    const weights = values
      .map(Number)
      .toSorted((a, b) => a - b) as FontWeight[];
    setSelectedWeights(weights);
    props.onChange?.(weights);
  };

  return (
    <ToggleGroup
      multiple
      defaultValue={computeSelectedFromDefaults().map(String)}
      onChange={handleChange}
      class={cn(
        'items-stretch',
        props.isVertical ? 'flex-col' : 'flex-row',
        props.isBare ? 'gap-0.5' : 'gap-0.5 overflow-hidden bg-background',
      )}
    >
      <input
        type='hidden'
        name={props.name || 'weights'}
        value={selectedWeights().join(',')}
      />
      <Show when={!props.isCompact}>
        <div class='flex size-8 items-center justify-center'>
          <WeightIcon class='size-3 text-muted-foreground' />
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
                  'group relative size-8 pt-0.5 text-xs text-muted-foreground',
                  props.isBare ? 'rounded-full' : 'grow rounded px-0',
                )}
                style={{ 'font-weight': weight }}
                disabled={!isSelectable()}
              >
                {WEIGHT_LABELS[weight].short}
                <div class='absolute top-1 size-1 rounded-full bg-transparent transition-colors group-data-[pressed]:bg-foreground' />
              </TooltipTrigger>
              <TooltipContent>{WEIGHT_LABELS[weight].full}</TooltipContent>
            </Tooltip>
          );
        }}
      </For>
    </ToggleGroup>
  );
}
