import { Button } from './ui/button';
import { TextField, TextFieldInput, TextFieldLabel } from './ui/text-field';
import { ArrowRightIcon, LoaderCircleIcon } from 'lucide-solid';
import { ProcessingStatus } from '../hooks/use-app-signal';
import { WeightSelector } from './weight-selector';
import { type FontWeight } from '../types/font';
import { Label } from './ui/label';

interface FontProcessingFormProps {
  sampleText: string;
  selectedWeights: FontWeight[];
  processingStatus: ProcessingStatus;
  progressLabelNumerator: number;
  progressLabelDenominator: number;
  onSelectedWeightsChange: (weights: FontWeight[]) => void;
  onSubmit: (text: string, weights: FontWeight[]) => void;
}

export function FontProcessingForm(props: FontProcessingFormProps) {
  const handleSubmit = (e: Event) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const text = formData.get('preview-text') as string;

    // Get selected font weights
    const selectedWeights = props.selectedWeights;

    props.onSubmit(
      text || 'A quick brown fox jumps over the lazy dog',
      selectedWeights.length > 0 ? selectedWeights : [400], // Default to 400 if none selected
    );
  };

  const isProcessing = () => props.processingStatus !== 'idle';

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
          placeholder='A quick brown fox jumps over the lazy dog'
        />
      </TextField>
      <div class='flex w-full flex-col gap-2'>
        <Label class='text-sm font-medium'>Weights</Label>
        <WeightSelector
          weights={[100, 200, 300, 400, 500, 600, 700, 800, 900]}
          selectedWeights={props.selectedWeights}
          onWeightChange={props.onSelectedWeightsChange}
        />
      </div>
      <Button
        type='submit'
        disabled={isProcessing()}
        variant='outline'
        class='relative mt-1 flex items-center gap-2 pb-1.5'
      >
        {props.processingStatus === 'generating' ? (
          <>
            Generating fonts image... (
            {Math.trunc(
              (props.progressLabelNumerator / props.progressLabelDenominator) *
                100,
            )}
            %)
            <LoaderCircleIcon class='absolute right-3 origin-center animate-spin' />
          </>
        ) : props.processingStatus === 'vectorizing' ? (
          <>
            Vectorizing Images...
            <LoaderCircleIcon class='absolute right-3 origin-center animate-spin' />
          </>
        ) : props.processingStatus === 'compressing' ? (
          <>
            Compressing Vectors...
            <LoaderCircleIcon class='absolute right-3 origin-center animate-spin' />
          </>
        ) : props.processingStatus === 'clustering' ? (
          <>
            Clustering...
            <LoaderCircleIcon class='absolute right-3 origin-center animate-spin' />
          </>
        ) : (
          <>
            Cluster with current text
            <ArrowRightIcon class='absolute right-3' />
          </>
        )}
      </Button>
    </form>
  );
}
