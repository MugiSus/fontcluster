import { Show, createEffect } from 'solid-js';
import { Button } from './ui/button';
import { TextField, TextFieldInput, TextFieldLabel } from './ui/text-field';
import {
  ArrowRightIcon,
  StepForwardIcon,
  LoaderCircleIcon,
  PauseIcon,
  TypeIcon,
} from 'lucide-solid';
import { WeightSelector } from './weight-selector';
import {
  type FontWeight,
  type AlgorithmConfig,
  type ProcessStatus,
  type FontSet,
} from '../types/font';
// ...existing imports
import { cn } from '@/lib/utils';
import { appState, setAppState } from '../store';
import { runProcessingJobs, stopJobs, setSelectedWeights } from '../actions';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { measureText } from '../lib/text-measurer';

export function FontProcessingForm() {
  const handleSubmit = (e: Event) => {
    e.preventDefault();
    handleRun();
  };

  createEffect(() => {
    const metrics = measureText(
      appState.ui.sampleText,
      appState.session.config?.algorithm?.image?.font_size ?? 128,
    );

    if (!appState.session.config?.algorithm?.hog) return;

    const current = appState.session.config.algorithm.hog;
    if (
      current.width !== Math.round(metrics.width) ||
      current.height !== Math.round(metrics.height)
    ) {
      setAppState('session', 'config', 'algorithm', 'hog', {
        ...current,
        width: Math.round(metrics.width),
        height: Math.round(metrics.height),
      });
    }
  });

  const handleRun = async (targetStatus?: ProcessStatus) => {
    const form = document.querySelector('form');
    if (!form) return;

    const isRerun = targetStatus !== undefined;
    const isFinished = appState.session.status === 'clustered';
    const shouldStartNewSession =
      !isRerun && (isFinished || !appState.session.id);

    setAppState('session', 'isProcessing', true);

    if (isRerun) {
      setAppState('session', 'status', targetStatus);
    } else if (shouldStartNewSession) {
      setAppState('session', 'status', 'empty');
    }

    const formData = new FormData(form);
    const text = formData.get('preview-text') as string;

    const selectedWeightsString = formData.get('weights') as string;
    const selectedWeightsArray = (
      selectedWeightsString ? selectedWeightsString.split(',').map(Number) : []
    ) as FontWeight[];

    const algorithm: AlgorithmConfig = {
      discovery: {
        font_set: (appState.session.config?.algorithm?.discovery?.font_set ??
          'google_fonts_popular300') as FontSet,
      },
      image: {
        font_size: Number(formData.get('image-font-size')),
      },
      hog: {
        orientations: Number(formData.get('hog-orientations')),
        cell_side: Number(formData.get('hog-cell-side')),
        block_side: Number(formData.get('hog-block-side')),
        block_stride: Number(formData.get('hog-block-stride')),
        width: Number(formData.get('hog-width')),
        height: Number(formData.get('hog-height')),
      },
      pacmap: {
        mn_phases: Number(formData.get('pacmap-mn-phases')),
        nn_phases: Number(formData.get('pacmap-nn-phases')),
        fp_phases: Number(formData.get('pacmap-fp-phases')),
        learning_rate: Number(formData.get('pacmap-learning-rate')),
        n_neighbors: Number(formData.get('pacmap-n-neighbors')) || 32,
      },
      hdbscan: {
        min_cluster_size: Number(formData.get('hdbscan-min-cluster-size')),
        min_samples: Number(formData.get('hdbscan-min-samples')),
      },
    };

    try {
      await runProcessingJobs(
        text || 'font',
        selectedWeightsArray.length > 0 ? selectedWeightsArray : [400],
        algorithm,
        !shouldStartNewSession ? appState.session.id : undefined,
        targetStatus ?? undefined,
      );
    } finally {
      setAppState('session', 'isProcessing', false);
    }
  };

  return (
    <form onSubmit={handleSubmit} class='flex h-full min-h-0 flex-1 flex-col'>
      <div class='flex flex-col gap-2 border-b p-4'>
        <TextField class='relative grid w-full items-center gap-1'>
          <TextFieldLabel
            for='preview-text'
            class='absolute inset-y-0 left-2 flex items-center gap-2'
          >
            <TypeIcon class='mb-0.5 size-3 text-primary' />
            Text
          </TextFieldLabel>
          <TextFieldInput
            type='text'
            name='preview-text'
            id='preview-text'
            value={appState.ui.sampleText}
            onInput={(e) =>
              setAppState('ui', 'sampleText', e.currentTarget.value)
            }
            placeholder='Preview Text...'
            spellcheck='false'
            class='h-9 text-base'
          />
        </TextField>
        <TextField class='grid w-full items-center gap-1'>
          <WeightSelector
            weights={[100, 200, 300, 400, 500, 600, 700, 800, 900]}
            selectedWeights={appState.ui.selectedWeights}
            onWeightChange={setSelectedWeights}
            isCompact
          />
        </TextField>
      </div>

      <div class='flex min-h-0 flex-1 grow flex-col gap-1 space-y-3 overflow-y-scroll p-4'>
        <div class='group/section space-y-1.5'>
          <div class='flex items-center gap-1'>
            <div class='text-xs font-medium'>Discovery</div>
            <Tooltip>
              <TooltipTrigger
                as={Button<'button'>}
                variant='ghost'
                size='icon'
                disabled={appState.session.isProcessing}
                class='invisible mb-px size-4 text-xs group-hover/section:visible'
                onClick={() => handleRun('empty')}
              >
                <StepForwardIcon class='size-3 max-h-3' />
              </TooltipTrigger>
              <TooltipContent>Run from this step</TooltipContent>
            </Tooltip>
          </div>
          <div class='grid grid-cols-1 gap-2'>
            <TextField class='relative mr-1 gap-0.5'>
              <TextFieldLabel class='absolute inset-y-0 left-2 flex items-center'>
                From
              </TextFieldLabel>
              <select
                class='flex h-8 w-full rounded-md border border-none border-input bg-background px-3 py-2 text-right text-sm shadow-sm transition-colors [text-align-last:right] file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground hover:bg-muted/50 focus-visible:border-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50'
                value={
                  appState.session.config?.algorithm?.discovery?.font_set ??
                  'google_fonts_popular300'
                }
                onChange={(e) =>
                  setAppState(
                    'session',
                    'config',
                    'algorithm', // algorithm
                    'discovery', // discovery
                    {
                      font_set: e.currentTarget.value as FontSet,
                    },
                  )
                }
              >
                <option value='system_fonts'>Installed Fonts</option>
                <hr />
                <option value='google_fonts_popular100'>
                  Google Fonts Top 100
                </option>
                <option value='google_fonts_popular200'>
                  Google Fonts Top 200
                </option>
                <option value='google_fonts_popular300'>
                  Google Fonts Top 300
                </option>
                <option value='google_fonts_popular500'>
                  Google Fonts Top 500
                </option>
                <option value='google_fonts_popular1000'>
                  Google Fonts Top 1000
                </option>
              </select>
            </TextField>
          </div>
        </div>

        <div class='group/section flex flex-col gap-2'>
          <div class='flex items-center gap-1'>
            <div class='text-xs font-medium'>Image Generation</div>
            <Tooltip>
              <TooltipTrigger
                as={Button<'button'>}
                variant='ghost'
                size='icon'
                disabled={appState.session.isProcessing}
                class='invisible mb-px size-4 text-xs group-hover/section:visible'
                onClick={() => handleRun('discovered')}
              >
                <StepForwardIcon class='size-3 max-h-3' />
              </TooltipTrigger>
              <TooltipContent>Run from this step</TooltipContent>
            </Tooltip>
          </div>
          <div class='flex flex-col gap-0.5'>
            <TextField class='relative'>
              <TextFieldLabel class='absolute inset-y-0 left-2 flex items-center'>
                Font Size
              </TextFieldLabel>
              <TextFieldInput
                type='number'
                name='image-font-size'
                value={
                  appState.session.config?.algorithm?.image?.font_size ?? 128
                }
                step='1'
                min='1'
              />
            </TextField>
          </div>
        </div>

        <div class='group/section flex flex-col gap-2'>
          <div class='flex items-center gap-1'>
            <div class='text-xs font-medium'>HOG (Vectorization)</div>
            <Tooltip>
              <TooltipTrigger
                as={Button<'button'>}
                variant='ghost'
                size='icon'
                disabled={appState.session.isProcessing}
                class='invisible mb-px size-4 text-xs group-hover/section:visible'
                onClick={() => handleRun('generated')}
              >
                <StepForwardIcon class='size-3 max-h-3' />
              </TooltipTrigger>
              <TooltipContent>Run from this step</TooltipContent>
            </Tooltip>
          </div>
          <div class='flex flex-col gap-0.5'>
            <TextField class='relative'>
              <TextFieldLabel class='absolute inset-y-0 left-2 flex items-center'>
                Orientations
              </TextFieldLabel>
              <TextFieldInput
                type='number'
                name='hog-orientations'
                value={
                  appState.session.config?.algorithm?.hog?.orientations ?? 12
                }
                step='1'
                min='1'
              />
            </TextField>
            <TextField class='relative'>
              <TextFieldLabel class='absolute inset-y-0 left-2 flex items-center'>
                Cell Side
              </TextFieldLabel>
              <TextFieldInput
                type='number'
                name='hog-cell-side'
                value={appState.session.config?.algorithm?.hog?.cell_side ?? 16}
                step='1'
                min='1'
              />
            </TextField>
            <TextField class='relative'>
              <TextFieldLabel class='absolute inset-y-0 left-2 flex items-center'>
                Block Side
              </TextFieldLabel>
              <TextFieldInput
                type='number'
                name='hog-block-side'
                value={appState.session.config?.algorithm?.hog?.block_side ?? 2}
                step='1'
                min='1'
              />
            </TextField>
            <TextField class='relative'>
              <TextFieldLabel class='absolute inset-y-0 left-2 flex items-center'>
                Block Stride
              </TextFieldLabel>
              <TextFieldInput
                type='number'
                name='hog-block-stride'
                value={
                  appState.session.config?.algorithm?.hog?.block_stride ?? 2
                }
                step='1'
                min='1'
              />
            </TextField>
            <TextField class='relative'>
              <TextFieldLabel class='absolute inset-y-0 left-2 flex items-center'>
                Width
              </TextFieldLabel>
              <TextFieldInput
                type='number'
                name='hog-width'
                value={appState.session.config?.algorithm?.hog?.width ?? 128}
                step='1'
                min='1'
              />
            </TextField>
            <TextField class='relative'>
              <TextFieldLabel class='absolute inset-y-0 left-2 flex items-center'>
                Height
              </TextFieldLabel>
              <TextFieldInput
                type='number'
                name='hog-height'
                value={appState.session.config?.algorithm?.hog?.height ?? 64}
                step='1'
                min='1'
              />
            </TextField>
          </div>
        </div>

        <div class='group/section flex flex-col gap-2'>
          <div class='flex items-center gap-1'>
            <div class='text-xs font-medium'>PaCMAP (D-Reduction)</div>
            <Tooltip>
              <TooltipTrigger
                as={Button<'button'>}
                variant='ghost'
                size='icon'
                disabled={appState.session.isProcessing}
                class='invisible mb-px size-4 text-xs group-hover/section:visible'
                onClick={() => handleRun('vectorized')}
              >
                <StepForwardIcon class='size-3 max-h-3' />
              </TooltipTrigger>
              <TooltipContent>Run from this step</TooltipContent>
            </Tooltip>
          </div>
          <div class='flex flex-col gap-0.5'>
            <TextField class='relative'>
              <TextFieldLabel class='absolute inset-y-0 left-2 flex items-center'>
                Global Iterations
              </TextFieldLabel>
              <TextFieldInput
                type='number'
                name='pacmap-mn-phases'
                value={
                  appState.session.config?.algorithm?.pacmap?.mn_phases ?? 100
                }
                step='10'
                min='0'
              />
            </TextField>
            <TextField class='relative'>
              <TextFieldLabel class='absolute inset-y-0 left-2 flex items-center'>
                Attraction Iterations
              </TextFieldLabel>
              <TextFieldInput
                type='number'
                name='pacmap-nn-phases'
                value={
                  appState.session.config?.algorithm?.pacmap?.nn_phases ?? 100
                }
                step='10'
                min='0'
              />
            </TextField>
            <TextField class='relative'>
              <TextFieldLabel class='absolute inset-y-0 left-2 flex items-center'>
                Repulsion Iterations
              </TextFieldLabel>
              <TextFieldInput
                type='number'
                name='pacmap-fp-phases'
                value={
                  appState.session.config?.algorithm?.pacmap?.fp_phases ?? 100
                }
                step='10'
                min='0'
              />
            </TextField>
            <TextField class='relative'>
              <TextFieldLabel class='absolute inset-y-0 left-2 flex items-center'>
                Learning rate
              </TextFieldLabel>
              <TextFieldInput
                type='number'
                name='pacmap-learning-rate'
                value={
                  appState.session.config?.algorithm?.pacmap?.learning_rate ??
                  1.0
                }
                step='0.1'
              />
            </TextField>
            <TextField class='relative'>
              <TextFieldLabel class='absolute inset-y-0 left-2 flex items-center'>
                Neighbors
              </TextFieldLabel>
              <TextFieldInput
                type='number'
                name='pacmap-n-neighbors'
                value={
                  appState.session.config?.algorithm?.pacmap?.n_neighbors ?? 32
                }
                step='1'
                min='1'
              />
            </TextField>
          </div>
        </div>

        <div class='group/section flex flex-col gap-2'>
          <div class='flex items-center gap-1'>
            <div class='text-xs font-medium'>HDBSCAN (Clustering)</div>
            <Tooltip>
              <TooltipTrigger
                as={Button<'button'>}
                variant='ghost'
                size='icon'
                disabled={appState.session.isProcessing}
                class='invisible mb-px size-4 text-xs group-hover/section:visible'
                onClick={() => handleRun('compressed')}
              >
                <StepForwardIcon class='size-3 max-h-3' />
              </TooltipTrigger>
              <TooltipContent>Run from this step</TooltipContent>
            </Tooltip>
          </div>
          <div class='flex flex-col gap-0.5'>
            <TextField class='relative'>
              <TextFieldLabel class='absolute inset-y-0 left-2 flex items-center'>
                Min Cluster Size
              </TextFieldLabel>
              <TextFieldInput
                type='number'
                name='hdbscan-min-cluster-size'
                value={
                  appState.session.config?.algorithm?.hdbscan
                    ?.min_cluster_size ?? 12
                }
                step='1'
                min='0'
              />
            </TextField>
            <TextField class='relative'>
              <TextFieldLabel class='absolute inset-y-0 left-2 flex items-center'>
                Min Samples
              </TextFieldLabel>
              <TextFieldInput
                type='number'
                name='hdbscan-min-samples'
                value={
                  appState.session.config?.algorithm?.hdbscan?.min_samples ?? 12
                }
                step='1'
                min='0'
              />
            </TextField>
          </div>
        </div>
      </div>

      <div class='flex flex-col border-t p-4 py-3'>
        <div class='flex items-center gap-1 py-1 pb-1.5'>
          <Tooltip>
            <TooltipTrigger
              as={Button<'button'>}
              type='submit'
              disabled={appState.session.isProcessing}
              variant='default'
              size='sm'
              class='relative flex flex-1 items-center gap-2 rounded-full text-sm tabular-nums hover:shadow-lg hover:shadow-primary/25'
            >
              {appState.session.isProcessing
                ? 'Processing...'
                : appState.session.status === 'clustered'
                  ? 'Run'
                  : 'Continue'}
              <Show
                when={appState.session.isProcessing}
                fallback={<ArrowRightIcon class='absolute right-3' />}
              >
                <LoaderCircleIcon class='absolute right-3 origin-center animate-spin' />
              </Show>
            </TooltipTrigger>
            <TooltipContent>
              {appState.session.status === 'clustered'
                ? 'Create new and run'
                : 'Continue'}
            </TooltipContent>
          </Tooltip>

          <Show when={appState.session.isProcessing}>
            <Button
              type='button'
              variant='ghost'
              size='icon'
              class='size-9 shrink-0 rounded-full text-destructive hover:bg-destructive/20 hover:text-destructive'
              onClick={() => stopJobs()}
              title='Stop Run'
            >
              <PauseIcon class='size-3' />
            </Button>
          </Show>
        </div>

        <div class='flex flex-col gap-0.5'>
          <div class='grid grid-cols-5 gap-1'>
            <div
              class='h-1 overflow-hidden rounded-full bg-primary/30'
              style={{
                '--progress':
                  appState.session.isProcessing &&
                  appState.session.status === 'empty'
                    ? `${(appState.progress.numerator / appState.progress.denominator || 0) * 100}%`
                    : '0%',
              }}
            >
              <div
                class={cn(
                  'h-full w-0 rounded-full bg-primary',
                  appState.session.isProcessing &&
                    appState.session.status === 'empty' &&
                    'w-[var(--progress)] animate-pulse',
                  (appState.session.status === 'discovered' ||
                    appState.session.status === 'generated' ||
                    appState.session.status === 'vectorized' ||
                    appState.session.status === 'compressed' ||
                    appState.session.status === 'clustered') &&
                    'w-full',
                )}
              />
            </div>
            <div
              class='h-1 overflow-hidden rounded-full bg-primary/30'
              style={{
                '--progress':
                  appState.session.isProcessing &&
                  appState.session.status === 'discovered'
                    ? `${(appState.progress.numerator / appState.progress.denominator || 0) * 100}%`
                    : '0%',
              }}
            >
              <div
                class={cn(
                  'h-full w-0 rounded-full bg-primary',
                  appState.session.isProcessing &&
                    appState.session.status === 'discovered' &&
                    'w-[var(--progress)] animate-pulse',
                  (appState.session.status === 'generated' ||
                    appState.session.status === 'vectorized' ||
                    appState.session.status === 'compressed' ||
                    appState.session.status === 'clustered') &&
                    'w-full',
                )}
              />
            </div>
            <div
              class='h-1 overflow-hidden rounded-full bg-primary/30'
              style={{
                '--progress':
                  appState.session.isProcessing &&
                  appState.session.status === 'generated'
                    ? `${(appState.progress.numerator / appState.progress.denominator || 0) * 100}%`
                    : '0%',
              }}
            >
              <div
                class={cn(
                  'h-full w-0 rounded-full bg-primary',
                  appState.session.isProcessing &&
                    appState.session.status === 'generated' &&
                    'w-[var(--progress)] animate-pulse',
                  (appState.session.status === 'vectorized' ||
                    appState.session.status === 'compressed' ||
                    appState.session.status === 'clustered') &&
                    'w-full',
                )}
              />
            </div>
            <div class='h-1 overflow-hidden rounded-full bg-primary/30'>
              <div
                class={cn(
                  'h-full w-0 rounded-full bg-primary',
                  (appState.session.status === 'compressed' ||
                    appState.session.status === 'clustered') &&
                    'w-full',
                  appState.session.isProcessing &&
                    appState.session.status === 'vectorized' &&
                    'w-full animate-pulse transition-[width] duration-1000',
                )}
              />
            </div>
            <div class='h-1 overflow-hidden rounded-full bg-primary/30'>
              <div
                class={cn(
                  'h-full w-0 rounded-full bg-primary',
                  appState.session.status === 'clustered' && 'w-full',
                  appState.session.isProcessing &&
                    appState.session.status === 'compressed' &&
                    'w-full animate-pulse transition-[width] duration-1000',
                )}
              />
            </div>
          </div>

          <div
            class={cn(
              'flex items-end justify-between text-xs font-medium text-muted-foreground',
              appState.session.isProcessing && 'animate-pulse',
            )}
          >
            <span>
              {!appState.session.isProcessing
                ? 'Completed'
                : appState.session.status === 'empty'
                  ? 'Step 1: Discovering'
                  : appState.session.status === 'discovered'
                    ? 'Step 2: Generating'
                    : appState.session.status === 'generated'
                      ? 'Step 3: Vectorizing'
                      : appState.session.status === 'vectorized'
                        ? 'Step 4: Compressing'
                        : appState.session.status === 'compressed'
                          ? 'Step 5: Clustering'
                          : ''}
            </span>
            <Show
              when={
                appState.session.isProcessing &&
                (appState.session.status === 'empty' ||
                  appState.session.status === 'discovered' ||
                  appState.session.status === 'generated')
              }
              fallback={
                <span class='tabular-nums'>
                  {Object.keys(appState.fonts.data).length} Fonts
                </span>
              }
            >
              <span class='tabular-nums'>
                {appState.progress.numerator}/{appState.progress.denominator}{' '}
                Fonts
              </span>
            </Show>
          </div>
        </div>
      </div>
    </form>
  );
}
