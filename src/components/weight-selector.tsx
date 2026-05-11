import { createSignal, For, Show } from 'solid-js';
import { Button } from './ui/button';
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
}

export function WeightSelector(props: WeightSelectorProps) {
  const initialSelectedWeights = () => {
    const defaultValue = props.defaultValue ?? ([400] as FontWeight[]);
    const selectableWeights = new Set(props.weights);
    return defaultValue.filter((weight) => selectableWeights.has(weight));
  };
  const [selectedWeights, setSelectedWeights] = createSignal(
    initialSelectedWeights(),
  );

  const handleWeightToggle = (weight: FontWeight) => {
    const currentWeights = selectedWeights();
    const newWeights = currentWeights.includes(weight)
      ? currentWeights.filter((w) => w !== weight)
      : [...currentWeights, weight];
    setSelectedWeights(newWeights);
    props.onChange?.(newWeights);
  };

  return (
    <div
      class={cn(
        'flex items-stretch overflow-hidden rounded-md border bg-background',
        props.isVertical ? 'flex-col' : 'flex-row',
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
      <For each={props.weights.toSorted()}>
        {(weight) => {
          const isSelected = () => selectedWeights().includes(weight);
          const isSelectable = () => props.weights.includes(weight);

          return (
            <Tooltip placement={props.isVertical ? 'left' : 'bottom'}>
              <TooltipTrigger
                as={Button<'button'>}
                type='button'
                variant={isSelected() ? 'default' : 'ghost'}
                size='sm'
                class='relative size-8 grow rounded-none px-2 shadow-none'
                style={{ 'font-weight': weight }}
                onClick={() => handleWeightToggle(weight)}
                data-checked={isSelected()}
                disabled={!isSelectable()}
              >
                {WEIGHT_LABELS[weight].short}
              </TooltipTrigger>
              <TooltipContent>{WEIGHT_LABELS[weight].full}</TooltipContent>
            </Tooltip>
          );
        }}
      </For>
    </div>
  );
}
