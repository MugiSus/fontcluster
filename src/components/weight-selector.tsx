import { For, Show } from 'solid-js';
import { Button } from './ui/button';
import { type FontWeight, WEIGHT_LABELS } from '../types/font';
import { WeightIcon } from 'lucide-solid';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

interface WeightSelectorProps {
  weights: FontWeight[];
  selectedWeights: FontWeight[];
  name?: string;
  onWeightChange: (weights: FontWeight[]) => void;
  isVertical?: boolean;
  isCompact?: boolean;
}

export function WeightSelector(props: WeightSelectorProps) {
  const handleWeightToggle = (weight: FontWeight) => {
    const currentWeights = props.selectedWeights;
    const newWeights = currentWeights.includes(weight)
      ? currentWeights.filter((w) => w !== weight)
      : [...currentWeights, weight];
    props.onWeightChange(newWeights);
  };

  return (
    <div
      class={cn(
        'grid w-full items-center overflow-hidden rounded-md border bg-background shadow-sm',
        props.isVertical
          ? props.isCompact
            ? 'grid-rows-9'
            : 'grid-rows-10'
          : props.isCompact
            ? 'grid-cols-9'
            : 'grid-cols-10',
      )}
    >
      <input
        type='hidden'
        name={props.name || 'weights'}
        value={props.selectedWeights.join(',')}
      />
      <Show when={!props.isCompact}>
        <div class='flex items-center justify-center'>
          <WeightIcon class='size-3 text-muted-foreground' />
        </div>
      </Show>
      <For each={[100, 200, 300, 400, 500, 600, 700, 800, 900] as FontWeight[]}>
        {(weight) => {
          const isSelected = () => props.selectedWeights.includes(weight);
          const isSelectable = () => props.weights.includes(weight);

          return (
            <Tooltip>
              <TooltipTrigger
                as={Button<'button'>}
                type='button'
                variant={isSelected() ? 'default' : 'ghost'}
                size='sm'
                class='h-8 rounded-none px-2 shadow-none'
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
