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
  algorithm?: AlgorithmConfig | null | undefined;
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
      image: {
        width: Number(formData.get('image-width')),
        height: Number(formData.get('image-height')),
        font_size: Number(formData.get('image-font-size')),
      },
      hog: {
        orientations: Number(formData.get('hog-orientations')),
        cell_side: Number(formData.get('hog-cell-side')),
      },
      pacmap: {
        mn_phases: Number(formData.get('pacmap-mn-phases')),
        nn_phases: Number(formData.get('pacmap-nn-phases')),
        fp_phases: Number(formData.get('pacmap-fp-phases')),
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
      class='flex w-full flex-col items-stretch gap-1'
    >
      <TextField class='grid w-full items-center gap-1 pt-1'>
        <TextFieldLabel
          for='preview-text'
          class='text-[10px] uppercase text-muted-foreground'
        >
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
      <TextField class='grid w-full items-center gap-1 pt-1'>
        <TextFieldLabel
          for='weights'
          class='text-[10px] uppercase text-muted-foreground'
        >
          Font Weights
        </TextFieldLabel>
        <WeightSelector
          weights={[100, 200, 300, 400, 500, 600, 700, 800, 900]}
          selectedWeights={props.selectedWeights}
          onWeightChange={props.onSelectedWeightsChange}
        />
      </TextField>
      <details class='text-[10px] text-muted-foreground'>
        <summary class='cursor-pointer py-1 font-medium uppercase hover:text-foreground'>
          Algorithm options (Advanced)
        </summary>
        <div class='mt-1 space-y-3 rounded-md border p-2'>
          <div class='space-y-1.5'>
            <div class='text-[10px] font-medium uppercase tracking-wider text-muted-foreground'>
              Image Generation
            </div>
            <div class='grid grid-cols-2 gap-2'>
              <TextField class='gap-0.5'>
                <TextFieldLabel class='text-[10px]'>Width</TextFieldLabel>
                <TextFieldInput
                  type='number'
                  name='image-width'
                  value={props.algorithm?.image?.width ?? 512}
                  step='32'
                  class='h-7 text-xs'
                />
              </TextField>
              <TextField class='gap-0.5'>
                <TextFieldLabel class='text-[10px]'>Height</TextFieldLabel>
                <TextFieldInput
                  type='number'
                  name='image-height'
                  value={props.algorithm?.image?.height ?? 128}
                  step='16'
                  class='h-7 text-xs'
                />
              </TextField>
              <TextField class='gap-0.5'>
                <TextFieldLabel class='text-[10px]'>Font Size</TextFieldLabel>
                <TextFieldInput
                  type='number'
                  name='image-font-size'
                  value={props.algorithm?.image?.font_size ?? 48}
                  step='4'
                  class='h-7 text-xs'
                />
              </TextField>
            </div>
          </div>

          <div class='space-y-1.5'>
            <div class='text-[10px] font-medium uppercase tracking-wider text-muted-foreground'>
              HOG (Feature Extraction)
            </div>
            <div class='grid grid-cols-2 gap-2'>
              <TextField class='gap-0.5'>
                <TextFieldLabel class='text-[10px]'>
                  Orientations
                </TextFieldLabel>
                <TextFieldInput
                  type='number'
                  name='hog-orientations'
                  value={props.algorithm?.hog?.orientations ?? 9}
                  step='1'
                  class='h-7 text-xs'
                />
              </TextField>
              <TextField class='gap-0.5'>
                <TextFieldLabel class='text-[10px]'>Cell Side</TextFieldLabel>
                <TextFieldInput
                  type='number'
                  name='hog-cell-side'
                  value={props.algorithm?.hog?.cell_side ?? 8}
                  step='2'
                  class='h-7 text-xs'
                />
              </TextField>
            </div>
          </div>

          <div class='space-y-1.5'>
            <div class='text-[10px] font-medium uppercase tracking-wider text-muted-foreground'>
              PaCMAP (Dimensionality Reduction)
            </div>
            <div class='grid grid-cols-2 gap-2'>
              <TextField class='gap-0.5'>
                <TextFieldLabel class='text-[10px]'>
                  Global Iterations
                </TextFieldLabel>
                <TextFieldInput
                  type='number'
                  name='pacmap-mn-phases'
                  value={props.algorithm?.pacmap?.mn_phases ?? 100}
                  step='10'
                  class='h-7 text-xs'
                />
              </TextField>
              <TextField class='gap-0.5'>
                <TextFieldLabel class='text-[10px]'>
                  Attraction Iterations
                </TextFieldLabel>
                <TextFieldInput
                  type='number'
                  name='pacmap-nn-phases'
                  value={props.algorithm?.pacmap?.nn_phases ?? 100}
                  step='10'
                  class='h-7 text-xs'
                />
              </TextField>
              <TextField class='gap-0.5'>
                <TextFieldLabel class='text-[10px]'>
                  Repulsion Iterations
                </TextFieldLabel>
                <TextFieldInput
                  type='number'
                  name='pacmap-fp-phases'
                  value={props.algorithm?.pacmap?.fp_phases ?? 150}
                  step='10'
                  class='h-7 text-xs'
                />
              </TextField>
              <TextField class='gap-0.5'>
                <TextFieldLabel class='text-[10px]'>
                  Learning rate
                </TextFieldLabel>
                <TextFieldInput
                  type='number'
                  name='pacmap-learning-rate'
                  value={props.algorithm?.pacmap?.learning_rate ?? 1.0}
                  step='0.1'
                  class='h-7 text-xs'
                />
              </TextField>
            </div>
          </div>
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
