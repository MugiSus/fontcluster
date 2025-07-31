import { For } from 'solid-js';
import { Button } from './ui/button';
import { type FontWeight } from '../types/font';

interface WeightSelectorProps {
  weights: FontWeight[];
  selectedWeights: FontWeight[];
  onWeightChange: (weights: FontWeight[]) => void;
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
      class='grid w-full items-center gap-px overflow-hidden rounded border bg-background/50'
      style={{
        'grid-template-columns': `repeat(${props.weights.length}, minmax(0, 1fr))`,
      }}
    >
      <For each={props.weights}>
        {(weight) => {
          const isSelected = () => props.selectedWeights.includes(weight);

          return (
            <Button
              type='button'
              variant={isSelected() ? 'default' : 'ghost'}
              size='sm'
              class='h-8 flex-1 rounded-none'
              style={{ 'font-weight': weight }}
              onClick={() => handleWeightToggle(weight)}
              data-checked={isSelected()}
            >
              {weightLabels[weight] || weight}
            </Button>
          );
        }}
      </For>
    </div>
  );
}
