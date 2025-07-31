import { For } from 'solid-js';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { type FontWeight } from '../types/font';

interface WeightSelectorProps {
  weights: FontWeight[];
  selectedWeights: FontWeight[];
  onWeightChange: (weights: FontWeight[]) => void;
}

export function WeightSelector(props: WeightSelectorProps) {
  const weightLabels = ['UL', 'EL', 'L', 'R', 'M', 'DB', 'B', 'EB', 'UB'];

  const handleWeightToggle = (weight: FontWeight) => {
    console.log('Weight toggle clicked:', weight);
    console.log('Current weights:', props.selectedWeights);
    const currentWeights = props.selectedWeights;
    const newWeights = currentWeights.includes(weight)
      ? currentWeights.filter((w) => w !== weight)
      : [...currentWeights, weight];
    console.log('New weights:', newWeights);
    props.onWeightChange(newWeights);
  };

  return (
    <div class='flex w-full flex-col gap-2'>
      <Label class='text-sm font-medium'>Weights</Label>
      <div class='flex w-full items-center gap-px overflow-hidden rounded border'>
        <For each={props.weights}>
          {(weight) => {
            const weightIndex = Math.floor(weight / 100) - 1;
            const isSelected = props.selectedWeights.includes(weight);

            return (
              <Button
                type='button'
                variant={isSelected ? 'default' : 'ghost'}
                size='sm'
                class='h-8 flex-1 rounded-none'
                style={{ 'font-weight': weight }}
                onClick={() => handleWeightToggle(weight)}
                data-checked={isSelected}
              >
                {weightLabels[weightIndex] || weight}
              </Button>
            );
          }}
        </For>
      </div>
    </div>
  );
}
