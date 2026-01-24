import { Show, createEffect } from 'solid-js';
import { Button } from './ui/button';
import { openUrl } from '@tauri-apps/plugin-opener';
import { TextField, TextFieldInput, TextFieldLabel } from './ui/text-field';
import {
  ArrowRightIcon,
  StepForwardIcon,
  LoaderCircleIcon,
  PauseIcon,
  TypeIcon,
  FlaskConicalIcon,
  WeightIcon,
  ChevronDownIcon,
} from 'lucide-solid';
import { WeightSelector } from './weight-selector';
import {
  type FontWeight,
  type AlgorithmConfig,
  type ProcessStatus,
} from '../types/font';
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
    <form
      onSubmit={handleSubmit}
      class='flex min-h-0 flex-1 flex-col items-stretch gap-2 pl-2'
    >
      <TextField class='relative grid w-full items-center gap-1.5'>
        <TextFieldLabel
          for='preview-text'
          class='flex items-center gap-1.5 text-xs uppercase'
        >
          <TypeIcon class='mb-0.5 size-3 text-primary' />
          Preview Text
        </TextFieldLabel>
        <TypeIcon class='absolute left-3 top-8 mt-0.5 size-4 text-muted-foreground' />
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
          class='pl-9 pt-[9px]'
        />
      </TextField>
      <TextField class='grid w-full items-center gap-1.5'>
        <TextFieldLabel
          for='weights'
          class='flex items-center gap-1.5 text-xs uppercase'
        >
          <WeightIcon class='mb-0.5 size-3 text-primary' />
          Font Weights
        </TextFieldLabel>
        <WeightSelector
          weights={[100, 200, 300, 400, 500, 600, 700, 800, 900]}
          selectedWeights={appState.ui.selectedWeights}
          onWeightChange={setSelectedWeights}
          isCompact
        />
      </TextField>

      <section class='flex min-h-0 flex-col gap-1.5'>
        <input
          type='checkbox'
          id='advanced-options'
          class='peer sr-only'
          checked
        />
        <label
          class='flex cursor-pointer items-center gap-1 text-xxs font-medium uppercase text-muted-foreground transition-colors duration-100 hover:text-foreground'
          for='advanced-options'
        >
          <FlaskConicalIcon class='mb-0.5 size-3 text-primary' />
          Algorithm options (Advanced)
          <ChevronDownIcon class='mb-0.5 size-3 transition-transform duration-200 [.peer:checked~label_&]:rotate-180' />
        </label>
        <div class='hidden min-h-0 flex-1 grow space-y-3 overflow-y-scroll rounded-md border bg-muted p-2 text-muted-foreground shadow-sm peer-checked:block'>
          <div class='group/section space-y-1.5'>
            <div class='flex items-center gap-1'>
              <div class='text-xxs font-medium uppercase tracking-wider text-muted-foreground'>
                Image Generation
              </div>
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
            <div class='grid grid-cols-2 gap-2'>
              <TextField class='gap-0.5'>
                <TextFieldLabel class='text-xxs'>Font Size</TextFieldLabel>
                <TextFieldInput
                  type='number'
                  name='image-font-size'
                  value={
                    appState.session.config?.algorithm?.image?.font_size ?? 128
                  }
                  onInput={(e) =>
                    setAppState(
                      'session',
                      'config',
                      'algorithm',
                      'image',
                      'font_size',
                      Number(e.currentTarget.value),
                    )
                  }
                  step='4'
                  min='0'
                  class='h-7 text-xs'
                />
              </TextField>
              <div />
            </div>
          </div>

          <div class='group/section space-y-1.5'>
            <div class='flex items-center gap-1'>
              <div class='text-xxs font-medium uppercase tracking-wider text-muted-foreground'>
                HOG (Vectorization)
              </div>
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
            <div class='grid grid-cols-2 gap-2'>
              <TextField class='gap-0.5'>
                <TextFieldLabel class='text-xxs'>Orientations</TextFieldLabel>
                <TextFieldInput
                  type='number'
                  name='hog-orientations'
                  value={
                    appState.session.config?.algorithm?.hog?.orientations ?? 12
                  }
                  step='1'
                  min='1'
                  class='h-7 text-xs'
                />
              </TextField>
              <TextField class='gap-0.5'>
                <TextFieldLabel class='text-xxs'>Cell Side</TextFieldLabel>
                <TextFieldInput
                  type='number'
                  name='hog-cell-side'
                  value={
                    appState.session.config?.algorithm?.hog?.cell_side ?? 16
                  }
                  step='1'
                  min='1'
                  class='h-7 text-xs'
                />
              </TextField>
              <TextField class='gap-0.5'>
                <TextFieldLabel class='text-xxs'>Block Side</TextFieldLabel>
                <TextFieldInput
                  type='number'
                  name='hog-block-side'
                  value={
                    appState.session.config?.algorithm?.hog?.block_side ?? 2
                  }
                  step='1'
                  min='1'
                  class='h-7 text-xs'
                />
              </TextField>
              <TextField class='gap-0.5'>
                <TextFieldLabel class='text-xxs'>Block Stride</TextFieldLabel>
                <TextFieldInput
                  type='number'
                  name='hog-block-stride'
                  value={
                    appState.session.config?.algorithm?.hog?.block_stride ?? 2
                  }
                  step='1'
                  min='1'
                  class='h-7 text-xs'
                />
              </TextField>
              <TextField class='gap-0.5'>
                <TextFieldLabel class='text-xxs'>Width</TextFieldLabel>
                <TextFieldInput
                  type='number'
                  name='hog-width'
                  value={appState.session.config?.algorithm?.hog?.width ?? 128}
                  step='1'
                  min='1'
                  class='h-7 text-xs'
                />
              </TextField>
              <TextField class='gap-0.5'>
                <TextFieldLabel class='text-xxs'>Height</TextFieldLabel>
                <TextFieldInput
                  type='number'
                  name='hog-height'
                  value={appState.session.config?.algorithm?.hog?.height ?? 64}
                  step='1'
                  min='1'
                  class='h-7 text-xs'
                />
              </TextField>
            </div>
          </div>

          <div class='group/section space-y-1.5'>
            <div class='flex items-center gap-1'>
              <div class='text-xxs font-medium uppercase tracking-wider text-muted-foreground'>
                PaCMAP (D-Reduction)
              </div>
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
            <div class='grid grid-cols-2 gap-2'>
              <TextField class='gap-0.5'>
                <TextFieldLabel class='text-xxs'>
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
                  class='h-7 text-xs'
                />
              </TextField>
              <TextField class='gap-0.5'>
                <TextFieldLabel class='text-xxs'>
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
                  class='h-7 text-xs'
                />
              </TextField>
              <TextField class='gap-0.5'>
                <TextFieldLabel class='text-xxs'>
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
                  class='h-7 text-xs'
                />
              </TextField>
              <TextField class='gap-0.5'>
                <TextFieldLabel class='text-xxs'>Learning rate</TextFieldLabel>
                <TextFieldInput
                  type='number'
                  name='pacmap-learning-rate'
                  value={
                    appState.session.config?.algorithm?.pacmap?.learning_rate ??
                    1.0
                  }
                  step='0.1'
                  class='h-7 text-xs'
                />
              </TextField>
            </div>
          </div>

          <div class='group/section space-y-1.5'>
            <div class='flex items-center gap-1'>
              <div class='text-xxs font-medium uppercase tracking-wider text-muted-foreground'>
                HDBSCAN (Clustering)
              </div>
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
            <div class='grid grid-cols-2 gap-2'>
              <TextField class='gap-0.5'>
                <TextFieldLabel class='text-xxs'>
                  Min Cluster Size
                </TextFieldLabel>
                <TextFieldInput
                  type='number'
                  name='hdbscan-min-cluster-size'
                  value={
                    appState.session.config?.algorithm?.hdbscan
                      ?.min_cluster_size ?? 16
                  }
                  step='1'
                  min='0'
                  class='h-7 text-xs'
                />
              </TextField>
              <TextField class='gap-0.5'>
                <TextFieldLabel class='text-xxs'>Min Samples</TextFieldLabel>
                <TextFieldInput
                  type='number'
                  name='hdbscan-min-samples'
                  value={
                    appState.session.config?.algorithm?.hdbscan?.min_samples ??
                    16
                  }
                  step='1'
                  min='0'
                  class='h-7 text-xs'
                />
              </TextField>
            </div>
          </div>
        </div>
      </section>

      <div class='mt-auto flex flex-col gap-2 pt-1'>
        <div class='flex items-center gap-1'>
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

        <div class='flex flex-col gap-1'>
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
              'flex items-end justify-between text-xxs font-medium tracking-tighter text-muted-foreground',
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

          <div class='flex items-center justify-between text-[9px] text-muted-foreground/50'>
            <span>© 2026 mugisus</span>
            <a
              href='https://fontcluster.mugisus.me'
              onClick={(e) => {
                e.preventDefault();
                openUrl('https://fontcluster.mugisus.me');
              }}
              class='hover:text-primary hover:underline'
            >
              fontcluster.mugisus.me
            </a>
          </div>
        </div>
      </div>
    </form>
  );
}
