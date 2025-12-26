import { createSignal, onMount, Show, createEffect } from 'solid-js';
import { listen } from '@tauri-apps/api/event';
import { Button } from './ui/button';
import { TextField, TextFieldInput, TextFieldLabel } from './ui/text-field';
import {
  ArrowRightIcon,
  ChevronDownIcon,
  StepForwardIcon,
  LoaderCircleIcon,
  PauseIcon,
} from 'lucide-solid';
import { WeightSelector } from './weight-selector';
import {
  type FontWeight,
  type AlgorithmConfig,
  type ProcessStatus,
} from '../types/font';
import { cn } from '@/lib/utils';

interface FontProcessingFormProps {
  sampleText: string;
  selectedWeights: FontWeight[];
  algorithm?: AlgorithmConfig | null | undefined;
  initialStatus?: ProcessStatus | undefined;
  sessionId?: string | undefined;
  onSelectedWeightsChange: (weights: FontWeight[]) => void;
  onSubmit: (
    text: string,
    weights: FontWeight[],
    algorithm: AlgorithmConfig,
    sessionId?: string,
    overrideStatus?: ProcessStatus,
  ) => Promise<void>;
  onStop?: () => Promise<void>;
}

export function FontProcessingForm(props: FontProcessingFormProps) {
  const [progressLabelNumerator, setProgressLabelNumerator] = createSignal(0);
  const [progressLabelDenominator, setProgressLabelDenominator] =
    createSignal(0);
  const [isProcessing, setIsProcessing] = createSignal<boolean>(false);
  const [processStatus, setProcessStatus] =
    createSignal<ProcessStatus>('empty');

  // Sync initial status when props change
  createEffect(() => {
    if (props.initialStatus) {
      setProcessStatus(props.initialStatus);
    }
  });

  // Progress tracking and status update event listeners
  onMount(() => {
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

    listen('font_generation_complete', () => {
      setProcessStatus('generated');
    });

    listen('vectorization_complete', () => {
      setProcessStatus('vectorized');
    });

    listen('compression_complete', () => {
      setProcessStatus('compressed');
    });

    listen('clustering_complete', () => {
      setProcessStatus('clustered');
    });
  });

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    handleRun();
  };

  const handleRun = async (targetStatus?: ProcessStatus) => {
    const form = document.querySelector('form');
    if (!form) return;

    // Determine if we should start a fresh session or continue/rerun an existing one
    const isRerun = targetStatus !== undefined;
    const isFinished = processStatus() === 'clustered';
    const shouldStartNewSession = !isRerun && (isFinished || !props.sessionId);

    setIsProcessing(true);

    if (isRerun) {
      setProcessStatus(targetStatus);
    } else if (shouldStartNewSession) {
      setProcessStatus('empty');
    }

    const formData = new FormData(form);
    const text = formData.get('preview-text') as string;

    // Get selected font weights
    const selectedWeights = formData.get('weights') as string;
    const selectedWeightsArray = (
      selectedWeights ? selectedWeights.split(',').map(Number) : []
    ) as FontWeight[];

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

    try {
      await props.onSubmit(
        text || 'Hamburgevons',
        selectedWeightsArray.length > 0 ? selectedWeightsArray : [400],
        algorithm,
        !shouldStartNewSession ? props.sessionId : undefined,
        targetStatus ?? undefined,
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      class='flex min-h-0 flex-1 flex-col items-stretch gap-1'
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
      <details
        class='group flex min-h-0 w-full grow flex-col overflow-y-auto'
        open
      >
        <summary class='flex cursor-pointer list-none items-center gap-1 py-1 text-[10px] font-medium uppercase text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden'>
          Algorithm options (Advanced)
          <ChevronDownIcon class='mb-0.5 ml-1 size-3 transition-transform group-open:rotate-180' />
        </summary>
        <div class='min-h-0 flex-1 grow space-y-3 overflow-y-scroll rounded-md border p-2 text-muted-foreground'>
          <div class='group/section space-y-1.5'>
            <div class='flex items-center gap-1'>
              <div class='text-[10px] font-medium uppercase tracking-wider text-muted-foreground'>
                Image Generation
              </div>
              <Button
                variant='ghost'
                size='icon'
                class='invisible mb-px size-4 text-xs group-hover/section:visible'
                onClick={() => handleRun('empty')}
              >
                <StepForwardIcon class='size-3 max-h-3' />
              </Button>
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

          <div class='group/section space-y-1.5'>
            <div class='flex items-center gap-1'>
              <div class='text-[10px] font-medium uppercase tracking-wider text-muted-foreground'>
                HOG Feature Extraction
              </div>
              <Button
                variant='ghost'
                size='icon'
                class='invisible mb-px size-4 text-xs group-hover/section:visible'
                onClick={() => handleRun('generated')}
              >
                <StepForwardIcon class='size-3 max-h-3' />
              </Button>
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

          <div class='group/section space-y-1.5'>
            <div class='flex items-center gap-1'>
              <div class='text-[10px] font-medium uppercase tracking-wider text-muted-foreground'>
                PaCMAP (D-Reduction)
              </div>
              <Button
                variant='ghost'
                size='icon'
                class='invisible mb-px size-4 text-xs group-hover/section:visible'
                onClick={() => handleRun('vectorized')}
              >
                <StepForwardIcon class='size-3 max-h-3' />
              </Button>
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

          <div class='group/section space-y-1.5'>
            <div class='flex items-center gap-1'>
              <div class='text-[10px] font-medium uppercase tracking-wider text-muted-foreground'>
                HDBSCAN (Clustering)
              </div>
              <Button
                variant='ghost'
                size='icon'
                class='invisible mb-px size-4 text-xs group-hover/section:visible'
                onClick={() => handleRun('compressed')}
              >
                <StepForwardIcon class='size-3 max-h-3' />
              </Button>
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

      <div class='flex flex-col gap-1.5'>
        <div class='flex items-center gap-1'>
          <Button
            type='submit'
            disabled={isProcessing()}
            variant='default'
            size='sm'
            class='relative flex flex-1 items-center gap-2 rounded-full text-sm tabular-nums'
          >
            {isProcessing() && processStatus() === 'empty'
              ? `Generating... (${progressLabelNumerator()}/${progressLabelDenominator()})`
              : isProcessing() && processStatus() === 'generated'
                ? `Vectorizing... (${progressLabelNumerator()}/${progressLabelDenominator()})`
                : isProcessing() && processStatus() === 'vectorized'
                  ? 'Compressing...'
                  : isProcessing() && processStatus() === 'compressed'
                    ? 'Clustering...'
                    : processStatus() === 'clustered'
                      ? 'Run'
                      : 'Continue'}
            <Show
              when={isProcessing()}
              fallback={<ArrowRightIcon class='absolute right-3' />}
            >
              <LoaderCircleIcon class='absolute right-3 origin-center animate-spin' />
            </Show>
          </Button>

          <Show when={isProcessing()}>
            <Button
              type='button'
              variant='ghost'
              size='icon'
              class='size-9 shrink-0 rounded-full text-destructive hover:bg-destructive/20 hover:text-destructive'
              onClick={() => props.onStop?.()}
              title='Stop Run'
            >
              <PauseIcon class='size-3' />
            </Button>
          </Show>
        </div>

        <div class='grid grid-cols-4 gap-1'>
          <div
            class={cn(
              'h-1 rounded bg-muted-foreground/30 transition-colors',
              processStatus() === 'empty' && 'animate-pulse bg-foreground',
              (processStatus() === 'generated' ||
                processStatus() === 'vectorized' ||
                processStatus() === 'compressed') &&
                'bg-muted-foreground',
            )}
          />
          <div
            class={cn(
              'h-1 rounded bg-muted-foreground/30 transition-colors',
              processStatus() === 'generated' && 'animate-pulse bg-foreground',
              (processStatus() === 'vectorized' ||
                processStatus() === 'compressed') &&
                'bg-muted-foreground',
            )}
          />
          <div
            class={cn(
              'h-1 rounded bg-muted-foreground/30 transition-colors',
              processStatus() === 'vectorized' && 'animate-pulse bg-foreground',
              processStatus() === 'compressed' && 'bg-muted-foreground',
            )}
          />
          <div
            class={cn(
              'h-1 rounded bg-muted-foreground/30 transition-colors',
              processStatus() === 'compressed' && 'animate-pulse bg-foreground',
            )}
          />
        </div>
      </div>
    </form>
  );
}
