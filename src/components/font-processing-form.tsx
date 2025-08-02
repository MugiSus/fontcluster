import { createSignal, onMount } from 'solid-js';
import { listen } from '@tauri-apps/api/event';
import { Button } from './ui/button';
import { TextField, TextFieldInput, TextFieldLabel } from './ui/text-field';
import { ArrowRightIcon, LoaderCircleIcon } from 'lucide-solid';
import { WeightSelector } from './weight-selector';
import { type FontWeight } from '../types/font';
import { Label } from './ui/label';

export type ProcessingStatus =
  | 'idle'
  | 'generating'
  | 'vectorizing'
  | 'compressing'
  | 'clustering';

interface FontProcessingFormProps {
  sampleText: string;
  selectedWeights: FontWeight[];
  onSelectedWeightsChange: (weights: FontWeight[]) => void;
  onSubmit: (text: string, weights: FontWeight[]) => void;
}

export function FontProcessingForm(props: FontProcessingFormProps) {
  const [processingStatus, setProcessingStatus] =
    createSignal<ProcessingStatus>('idle');
  const [progressLabelNumerator, setProgressLabelNumerator] = createSignal(0);
  const [progressLabelDenominator, setProgressLabelDenominator] =
    createSignal(0);

  // Listen for processing events
  onMount(() => {
    listen('font_generation_complete', () => {
      setProcessingStatus('vectorizing');
    });

    listen('vectorization_complete', () => {
      setProcessingStatus('compressing');
    });

    listen('compression_complete', () => {
      setProcessingStatus('clustering');
    });

    listen('clustering_complete', () => {
      // setProcessingStatus('idle');
    });

    listen('all_jobs_complete', () => {
      setProcessingStatus('idle');
    });

    // Progress tracking event listeners
    listen('progress_numerator_reset', (event: { payload: number }) => {
      setProgressLabelNumerator(event.payload);
    });

    listen('progress_denominator_reset', (event: { payload: number }) => {
      setProgressLabelDenominator(event.payload);
    });

    listen('progress_numerator_increment', () => {
      setProgressLabelNumerator((prev: number) => prev + 1);
    });

    listen('progress_denominator_set', (event: { payload: number }) => {
      setProgressLabelDenominator(event.payload);
    });

    listen('progress_denominator_decrement', () => {
      setProgressLabelDenominator((prev: number) => prev - 1);
    });
  });

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const text = formData.get('preview-text') as string;

    // Get selected font weights
    const selectedWeights = formData.get('weights') as string;
    const selectedWeightsArray = selectedWeights
      .split(',')
      .map(Number) as FontWeight[];

    props.onSubmit(
      text || 'Hamburgevons',
      selectedWeightsArray.length > 0 ? selectedWeightsArray : [400],
    );

    setProcessingStatus('generating');
  };

  const isProcessing = () => processingStatus() !== 'idle';

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
          placeholder='Hamburgevons'
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
        {processingStatus() === 'generating' ? (
          <>
            Generating fonts image... (
            {Math.trunc(
              (progressLabelNumerator() / progressLabelDenominator()) * 100,
            ) || 0}
            %)
            <LoaderCircleIcon class='absolute right-3 origin-center animate-spin' />
          </>
        ) : processingStatus() === 'vectorizing' ? (
          <>
            Vectorizing Images... (
            {Math.trunc(
              (progressLabelNumerator() / progressLabelDenominator()) * 100,
            ) || 0}
            %)
            <LoaderCircleIcon class='absolute right-3 origin-center animate-spin' />
          </>
        ) : processingStatus() === 'compressing' ? (
          <>
            Compressing Vectors...
            <LoaderCircleIcon class='absolute right-3 origin-center animate-spin' />
          </>
        ) : processingStatus() === 'clustering' ? (
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
