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
      class='flex w-full flex-col items-stretch gap-3'
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
      <fieldset class='grid grid-cols-11 place-items-stretch items-center gap-0'>
        <div class='flex justify-center font-thin'>F</div>
        <For each={[100, 200, 300, 400, 500, 600, 700, 800, 900]}>
          {(weight) => (
            <div class='flex size-auto flex-col items-center justify-center'>
              <input
                type='checkbox'
                id={`font-weight-${weight}`}
                name='font-weights'
                value={weight}
                class='peer sr-only'
                onChange={(event) => {
                  const currentWeights = props.checkedWeights;
                  const newWeights = event.currentTarget.checked
                    ? [...currentWeights, weight]
                    : currentWeights.filter((w) => w !== weight);
                  props.onCheckedWeightsChange(newWeights);
                }}
                checked={props.checkedWeights.includes(weight)}
              />
              <Label
                class='size-full cursor-pointer py-2 text-center opacity-20 peer-checked:opacity-100'
                for={`font-weight-${weight}`}
                style={{ 'font-weight': weight }}
              >
                {weight}
              </Label>
            </div>
          )}
        </For>
        <div class='flex justify-center font-black'>F</div>
      </fieldset>
      <Button
        type='submit'
        disabled={isProcessing()}
        variant='outline'
        class='flex items-center gap-2'
      >
        {props.isGenerating ? (
          <>
            Generating fonts image... ({props.progressLabelNumerator}/
            {props.progressLabelDenominator})
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
