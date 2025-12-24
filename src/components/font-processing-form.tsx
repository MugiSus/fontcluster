import { createSignal, onMount } from 'solid-js';
import { listen } from '@tauri-apps/api/event';
import { Button } from './ui/button';
import { TextField, TextFieldInput, TextFieldLabel } from './ui/text-field';
import { ArrowRightIcon, LoaderCircleIcon } from 'lucide-solid';
import { WeightSelector } from './weight-selector';
import { type FontWeight, type AlgorithmConfig } from '../types/font';

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
  onSubmit: (
    text: string,
    weights: FontWeight[],
    algorithm: AlgorithmConfig,
  ) => void;
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

    const algorithm: AlgorithmConfig = {
      pacmap: {
        attraction: Number(formData.get('pacmap-attraction')),
        local_structure: Number(formData.get('pacmap-local-structure')),
        global_structure_phases: Number(formData.get('pacmap-global-phases')),
        learning_rate: Number(formData.get('pacmap-learning-rate')),
      },
    };

    props.onSubmit(
      text || 'Hamburgevons',
      selectedWeightsArray.length > 0 ? selectedWeightsArray : [400],
      algorithm,
    );

    setProcessingStatus('generating');
  };

  const isProcessing = () => processingStatus() !== 'idle';

  return (
    <form
      onSubmit={handleSubmit}
      class='flex w-full flex-col items-stretch gap-1.5'
    >
      <TextField class='grid w-full items-center gap-1 pt-1'>
        <TextFieldLabel for='preview-text' class='text-xs'>
          Preview Text
        </TextFieldLabel>
        <TextFieldInput
          type='text'
          name='preview-text'
          id='preview-text'
          value={props.sampleText}
          placeholder='Hamburgevons'
          spellcheck='false'
        />
      </TextField>
      <WeightSelector
        weights={[100, 200, 300, 400, 500, 600, 700, 800, 900]}
        selectedWeights={props.selectedWeights}
        onWeightChange={props.onSelectedWeightsChange}
      />
      <details class='text-xs text-muted-foreground'>
        <summary class='cursor-pointer py-1 hover:text-foreground'>
          PACMAP options
        </summary>
        <div class='mt-1 grid grid-cols-2 gap-2 rounded-md border p-2'>
          <TextField class='gap-0.5'>
            <TextFieldLabel class='text-[10px]'>Attraction</TextFieldLabel>
            <TextFieldInput
              type='number'
              name='pacmap-attraction'
              value='200'
              step='10'
              class='h-7 text-xs'
            />
          </TextField>
          <TextField class='gap-0.5'>
            <TextFieldLabel class='text-[10px]'>Local structure</TextFieldLabel>
            <TextFieldInput
              type='number'
              name='pacmap-local-structure'
              value='100'
              step='10'
              class='h-7 text-xs'
            />
          </TextField>
          <TextField class='gap-0.5'>
            <TextFieldLabel class='text-[10px]'>Global phases</TextFieldLabel>
            <TextFieldInput
              type='number'
              name='pacmap-global-phases'
              value='400'
              step='10'
              class='h-7 text-xs'
            />
          </TextField>
          <TextField class='gap-0.5'>
            <TextFieldLabel class='text-[10px]'>Learning rate</TextFieldLabel>
            <TextFieldInput
              type='number'
              name='pacmap-learning-rate'
              value='1.0'
              step='0.1'
              class='h-7 text-xs'
            />
          </TextField>
        </div>
      </details>
      <Button
        type='submit'
        disabled={isProcessing()}
        variant='default'
        class='relative flex items-center gap-2 pb-1.5'
      >
        {processingStatus() === 'generating' ? (
          <>
            Generating images... (
            {Math.trunc(
              (progressLabelNumerator() / progressLabelDenominator()) * 100,
            ) || 0}
            %)
            <LoaderCircleIcon class='absolute right-3 origin-center animate-spin' />
          </>
        ) : processingStatus() === 'vectorizing' ? (
          <>
            Vectorizing images... (
            {Math.trunc(
              (progressLabelNumerator() / progressLabelDenominator()) * 100,
            ) || 0}
            %)
            <LoaderCircleIcon class='absolute right-3 origin-center animate-spin' />
          </>
        ) : processingStatus() === 'compressing' ? (
          <>
            Compressing vectors...
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
