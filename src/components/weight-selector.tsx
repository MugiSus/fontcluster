import { For } from 'solid-js';
import { Button } from './ui/button';
import { type FontWeight } from '../types/font';

interface WeightSelectorProps {
  weights: FontWeight[];
  selectedWeights: FontWeight[];
  name?: string;
  onWeightChange: (weights: FontWeight[]) => void;
  isVertical?: boolean;
}

export function WeightSelector(props: WeightSelectorProps) {
  const weightLabels: Record<FontWeight, string> = {
    100: 'UL',
    200: 'EL',
    300: 'L',
    400: 'R',
    500: 'M',
    600: 'DB',
    700: 'B',
    800: 'EB',
    900: 'UB',
  };

  const handleWeightToggle = (weight: FontWeight) => {
    const currentWeights = props.selectedWeights;
    const newWeights = currentWeights.includes(weight)
      ? currentWeights.filter((w) => w !== weight)
      : [...currentWeights, weight];
    props.onWeightChange(newWeights);
  };

  return (
    <div
      class={`grid w-full items-center gap-px overflow-hidden rounded border bg-background/25 ${props.isVertical ? 'grid-rows-9' : 'grid-cols-9'}`}
    >
      <input
        type='hidden'
        name={props.name || 'weights'}
        value={props.selectedWeights.join(',')}
      />
      <For each={[100, 200, 300, 400, 500, 600, 700, 800, 900] as FontWeight[]}>
        {(weight) => {
          const isSelected = () => props.selectedWeights.includes(weight);
          const isSelectable = () => props.weights.includes(weight);

          return (
            <Button
              type='button'
              variant={isSelected() ? 'default' : 'ghost'}
              size='sm'
              class='h-8 flex-1 rounded-none'
              style={{ 'font-weight': weight }}
              onClick={() => handleWeightToggle(weight)}
              data-checked={isSelected()}
              disabled={!isSelectable()}
            >
              {weightLabels[weight] || weight}
            </Button>
          );
        }}
      </For>
    </div>
  );
}
