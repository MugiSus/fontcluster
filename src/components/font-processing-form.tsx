import { For } from 'solid-js';
import { Button } from './ui/button';
import { TextField, TextFieldInput, TextFieldLabel } from './ui/text-field';
import { ArrowRightIcon, LoaderCircleIcon } from 'lucide-solid';
import { Label } from './ui/label';

interface FontProcessingFormProps {
  sampleText: string;
  checkedWeights: number[];
  isGenerating: boolean;
  isVectorizing: boolean;
  isCompressing: boolean;
  isClustering: boolean;
  progressLabelNumerator: number;
  progressLabelDenominator: number;
  onCheckedWeightsChange: (weights: number[]) => void;
  onSampleTextChange: (text: string) => void;
  onSubmit: (text: string, weights: number[]) => void;
}

export function FontProcessingForm(props: FontProcessingFormProps) {
  const handleSubmit = (e: Event) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const text = formData.get('preview-text') as string;

    // Get selected font weights
    const weightInputs = formData.getAll('font-weights') as string[];
    const selectedWeights = weightInputs.map((w) => parseInt(w, 10));

    props.onSubmit(
      text || 'A quick brown fox jumps over the lazy dog',
      selectedWeights.length > 0 ? selectedWeights : [400], // Default to 400 if none selected
    );
  };

  const isProcessing = () =>
    props.isGenerating ||
    props.isVectorizing ||
    props.isCompressing ||
    props.isClustering;

  return (
    <form
      onSubmit={handleSubmit}
      class='flex w-full flex-col items-stretch gap-2'
    >
      <TextField class='grid w-full items-center gap-2 pt-1'>
        <TextFieldLabel for='preview-text'>Preview Text</TextFieldLabel>
        <TextFieldInput
          type='text'
          name='preview-text'
          id='preview-text'
          value={props.sampleText}
          onInput={(e) => props.onSampleTextChange(e.currentTarget.value)}
          placeholder='A quick brown fox jumps over the lazy dog'
        />
      </TextField>
      <div class='flex w-full flex-col gap-2'>
        <Label class='text-sm font-medium'>Weights</Label>
        <div class='flex w-full items-center gap-px overflow-hidden rounded border'>
          <For each={[100, 200, 300, 400, 500, 600, 700, 800, 900]}>
            {(weight, index) => (
              <Button
                type='button'
                variant={
                  props.checkedWeights.includes(weight) ? 'default' : 'ghost'
                }
                size='sm'
                class='h-8 flex-1 rounded-none'
                style={{ 'font-weight': weight }}
                onClick={() => {
                  const currentWeights = props.checkedWeights;
                  const newWeights = currentWeights.includes(weight)
                    ? currentWeights.filter((w) => w !== weight)
                    : [...currentWeights, weight];
                  props.onCheckedWeightsChange(newWeights);
                }}
              >
                {['UL', 'EL', 'L', 'R', 'M', 'DB', 'B', 'EB', 'UB'][index()]}
              </Button>
            )}
          </For>
        </div>
      </div>
      <Button
        type='submit'
        disabled={isProcessing()}
        variant='outline'
        class='mt-1 flex items-center gap-2'
      >
        {props.isGenerating ? (
          <>
            Generating fonts image... (
            {Math.trunc(
              (props.progressLabelNumerator / props.progressLabelDenominator) *
                1000,
            ) / 10}
            %)
            <LoaderCircleIcon class='origin-center animate-spin' />
          </>
        ) : props.isVectorizing ? (
          <>
            Vectorizing Images...
            <LoaderCircleIcon class='origin-center animate-spin' />
          </>
        ) : props.isCompressing ? (
          <>
            Compressing Vectors...
            <LoaderCircleIcon class='origin-center animate-spin' />
          </>
        ) : props.isClustering ? (
          <>
            Clustering...
            <LoaderCircleIcon class='origin-center animate-spin' />
          </>
        ) : (
          <>
            Cluster with current text
            <ArrowRightIcon />
          </>
        )}
      </Button>
    </form>
  );
}
