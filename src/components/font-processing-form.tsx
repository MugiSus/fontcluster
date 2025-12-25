import { createSignal, onMount, untrack } from 'solid-js';
import { listen } from '@tauri-apps/api/event';
import { Button } from './ui/button';
import { TextField, TextFieldInput, TextFieldLabel } from './ui/text-field';
import {
  ArrowRightIcon,
  ChevronDownIcon,
  LoaderCircleIcon,
} from 'lucide-solid';
import { WeightSelector } from './weight-selector';
import {
  type FontWeight,
  type AlgorithmConfig,
  type ProcessStatus,
} from '../types/font';

interface FontProcessingFormProps {
  sampleText: string;
  selectedWeights: FontWeight[];
  algorithm?: AlgorithmConfig | null | undefined;
  isProcessing?: boolean;
  processStatus?: ProcessStatus | undefined;
  onSelectedWeightsChange: (weights: FontWeight[]) => void;
  onSubmit: (
    text: string,
    weights: FontWeight[],
    algorithm: AlgorithmConfig,
  ) => void;
}

export function FontProcessingForm(props: FontProcessingFormProps) {
  const [progressLabelNumerator, setProgressLabelNumerator] = createSignal(0);
  const [progressLabelDenominator, setProgressLabelDenominator] =
    createSignal(0);

  // Progress tracking event listeners
  onMount(() => {
    listen('progress_numerator_reset', (event: { payload: number }) => {
      untrack(() => setProgressLabelNumerator(event.payload));
    });

    listen('progress_denominator_reset', (event: { payload: number }) => {
      untrack(() => setProgressLabelDenominator(event.payload));
    });

    listen('progress_numerator_increment', () => {
      untrack(() => setProgressLabelNumerator((prev: number) => prev + 1));
    });

    listen('progress_denominator_set', (event: { payload: number }) => {
      untrack(() => setProgressLabelDenominator(event.payload));
    });

    listen('progress_denominator_decrement', () => {
      untrack(() => setProgressLabelDenominator((prev: number) => prev - 1));
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
      hdbscan: {
        min_cluster_size: Number(formData.get('hdbscan-min-cluster-size')),
        min_samples: Number(formData.get('hdbscan-min-samples')),
      },
    };

    props.onSubmit(
      text || 'Hamburgevons',
      selectedWeightsArray.length > 0 ? selectedWeightsArray : [400],
      algorithm,
    );
  };

  const currentStatus = () => {
    const status = props.processStatus;
    if (props.isProcessing) {
      if (status === 'empty') return 'generating';
      if (status === 'generated') return 'vectorizing';
      if (status === 'vectorized') return 'compressing';
      if (status === 'compressed') return 'clustering';
    }
    return status;
  };

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
          placeholder='fonts'
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
      <details class='group w-full'>
        <summary class='flex cursor-pointer list-none items-center py-1 text-[10px] font-medium uppercase text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden'>
          Algorithm options (Advanced)
          <ChevronDownIcon class='mb-0.5 ml-1.5 size-3 transition-transform group-open:rotate-180' />
        </summary>
        <div class='mt-1 max-h-[280px] space-y-3 overflow-y-scroll rounded-md border p-2 text-muted-foreground'>
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
                  value={props.algorithm?.image?.width ?? 320}
                  step='32'
                  class='h-7 text-xs'
                />
              </TextField>
              <TextField class='gap-0.5'>
                <TextFieldLabel class='text-[10px]'>Height</TextFieldLabel>
                <TextFieldInput
                  type='number'
                  name='image-height'
                  value={props.algorithm?.image?.height ?? 80}
                  step='16'
                  class='h-7 text-xs'
                />
              </TextField>
              <TextField class='gap-0.5'>
                <TextFieldLabel class='text-[10px]'>Font Size</TextFieldLabel>
                <TextFieldInput
                  type='number'
                  name='image-font-size'
                  value={props.algorithm?.image?.font_size ?? 64}
                  step='4'
                  class='h-7 text-xs'
                />
              </TextField>
            </div>
          </div>

          <div class='space-y-1.5'>
            <div class='text-[10px] font-medium uppercase tracking-wider text-muted-foreground'>
              HOG Feature Extraction
            </div>
            <div class='grid grid-cols-2 gap-2'>
              <TextField class='gap-0.5'>
                <TextFieldLabel class='text-[10px]'>
                  Orientations
                </TextFieldLabel>
                <TextFieldInput
                  type='number'
                  name='hog-orientations'
                  value={props.algorithm?.hog?.orientations ?? 12}
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
                  value={props.algorithm?.pacmap?.nn_phases ?? 300}
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
                  value={props.algorithm?.pacmap?.fp_phases ?? 200}
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

          <div class='space-y-1.5'>
            <div class='text-[10px] font-medium uppercase tracking-wider text-muted-foreground'>
              HDBSCAN (Clustering)
            </div>
            <div class='grid grid-cols-2 gap-2'>
              <TextField class='gap-0.5'>
                <TextFieldLabel class='text-[10px]'>
                  Min Cluster Size
                </TextFieldLabel>
                <TextFieldInput
                  type='number'
                  name='hdbscan-min-cluster-size'
                  value={props.algorithm?.hdbscan?.min_cluster_size ?? 10}
                  step='1'
                  class='h-7 text-xs'
                />
              </TextField>
              <TextField class='gap-0.5'>
                <TextFieldLabel class='text-[10px]'>Min Samples</TextFieldLabel>
                <TextFieldInput
                  type='number'
                  name='hdbscan-min-samples'
                  value={props.algorithm?.hdbscan?.min_samples ?? 6}
                  step='1'
                  class='h-7 text-xs'
                />
              </TextField>
            </div>
          </div>
        </div>
      </details>
      <Button
        type='submit'
        disabled={props.isProcessing}
        variant='default'
        class='relative flex items-center gap-2 rounded-full pb-1.5'
      >
        {currentStatus() === 'generating' ? (
          <>
            Generating... (
            {Math.trunc(
              (progressLabelNumerator() / progressLabelDenominator()) * 100,
            ) || 0}
            %)
            <LoaderCircleIcon class='absolute right-3 origin-center animate-spin' />
          </>
        ) : currentStatus() === 'vectorizing' ? (
          <>
            Vectorizing... (
            {Math.trunc(
              (progressLabelNumerator() / progressLabelDenominator()) * 100,
            ) || 0}
            %)
            <LoaderCircleIcon class='absolute right-3 origin-center animate-spin' />
          </>
        ) : currentStatus() === 'compressing' ? (
          <>
            Compressing...
            <LoaderCircleIcon class='absolute right-3 origin-center animate-spin' />
          </>
        ) : currentStatus() === 'clustering' ? (
          <>
            Clustering...
            <LoaderCircleIcon class='absolute right-3 origin-center animate-spin' />
          </>
        ) : (
          <>
            Run
            <ArrowRightIcon class='absolute right-3' />
          </>
        )}
      </Button>
    </form>
  );
}
