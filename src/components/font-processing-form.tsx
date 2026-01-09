import { Show } from 'solid-js';
import { Button } from './ui/button';
import { TextField, TextFieldInput, TextFieldLabel } from './ui/text-field';
import {
  ArrowRightIcon,
  ChevronDownIcon,
  StepForwardIcon,
  LoaderCircleIcon,
  PauseIcon,
  TypeIcon,
  FlaskConicalIcon,
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

export function FontProcessingForm() {
  const handleSubmit = (e: Event) => {
    e.preventDefault();
    handleRun();
  };

  const handleRun = async (targetStatus?: ProcessStatus) => {
    const form = document.querySelector('form');
    if (!form) return;

    // Determine if we should start a fresh session or continue/rerun an existing one
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

    // Get selected font weights
    const selectedWeightsString = formData.get('weights') as string;
    const selectedWeightsArray = (
      selectedWeightsString ? selectedWeightsString.split(',').map(Number) : []
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
      class='flex min-h-0 flex-1 flex-col items-stretch gap-1 pl-2'
    >
      <TextField class='relative grid w-full items-center gap-1'>
        <TextFieldLabel
          for='preview-text'
          class='text-xs uppercase text-muted-foreground'
        >
          Preview Text
        </TextFieldLabel>
        <TypeIcon class='absolute left-3 top-8 size-4 text-muted-foreground' />
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
          class='pl-9'
        />
      </TextField>
      <TextField class='grid w-full items-center gap-1 pt-1'>
        <TextFieldLabel
          for='weights'
          class='text-xs uppercase text-muted-foreground'
        >
          Font Weights
        </TextFieldLabel>
        <WeightSelector
          weights={[100, 200, 300, 400, 500, 600, 700, 800, 900]}
          selectedWeights={appState.ui.selectedWeights}
          onWeightChange={setSelectedWeights}
        />
      </TextField>
      <details
        class='group flex min-h-0 w-full grow flex-col overflow-y-auto'
        open
      >
        <summary class='flex cursor-pointer list-none items-center gap-1 py-1 text-xxs font-medium uppercase text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden'>
          <FlaskConicalIcon class='mb-0.5 size-3' />
          Algorithm options (Advanced)
          <ChevronDownIcon class='mb-0.5 ml-1 size-3 transition-transform group-open:rotate-180' />
        </summary>
        <div class='min-h-0 flex-1 grow space-y-3 overflow-y-scroll rounded-md border bg-slate-100 p-2 text-muted-foreground shadow-sm dark:bg-zinc-900'>
          <div class='group/section space-y-1.5'>
            <div class='flex items-center gap-1'>
              <div class='text-xxs font-medium uppercase tracking-wider text-muted-foreground'>
                Image Generation
              </div>
              <Button
                variant='ghost'
                size='icon'
                disabled={appState.session.isProcessing}
                class='invisible mb-px size-4 text-xs group-hover/section:visible'
                onClick={() => handleRun('empty')}
              >
                <StepForwardIcon class='size-3 max-h-3' />
              </Button>
            </div>
            <div class='grid grid-cols-2 gap-2'>
              <TextField class='gap-0.5'>
                <TextFieldLabel class='text-xxs'>Width</TextFieldLabel>
                <TextFieldInput
                  type='number'
                  name='image-width'
                  value={
                    appState.session.config?.algorithm?.image?.width ?? 320
                  }
                  step='32'
                  min='0'
                  class='h-7 text-xs'
                />
              </TextField>
              <TextField class='gap-0.5'>
                <TextFieldLabel class='text-xxs'>Height</TextFieldLabel>
                <TextFieldInput
                  type='number'
                  name='image-height'
                  value={
                    appState.session.config?.algorithm?.image?.height ?? 80
                  }
                  step='16'
                  min='0'
                  class='h-7 text-xs'
                />
              </TextField>
              <TextField class='gap-0.5'>
                <TextFieldLabel class='text-xxs'>Font Size</TextFieldLabel>
                <TextFieldInput
                  type='number'
                  name='image-font-size'
                  value={
                    appState.session.config?.algorithm?.image?.font_size ?? 64
                  }
                  step='4'
                  min='0'
                  class='h-7 text-xs'
                />
              </TextField>
            </div>
          </div>

          <div class='group/section space-y-1.5'>
            <div class='flex items-center gap-1'>
              <div class='text-xxs font-medium uppercase tracking-wider text-muted-foreground'>
                HOG Feature Extraction
              </div>
              <Button
                variant='ghost'
                size='icon'
                disabled={appState.session.isProcessing}
                class='invisible mb-px size-4 text-xs group-hover/section:visible'
                onClick={() => handleRun('generated')}
              >
                <StepForwardIcon class='size-3 max-h-3' />
              </Button>
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
                  min='0'
                  class='h-7 text-xs'
                />
              </TextField>
              <TextField class='gap-0.5'>
                <TextFieldLabel class='text-xxs'>Cell Side</TextFieldLabel>
                <TextFieldInput
                  type='number'
                  name='hog-cell-side'
                  value={
                    appState.session.config?.algorithm?.hog?.cell_side ?? 8
                  }
                  step='2'
                  min='0'
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
              <Button
                variant='ghost'
                size='icon'
                disabled={appState.session.isProcessing}
                class='invisible mb-px size-4 text-xs group-hover/section:visible'
                onClick={() => handleRun('vectorized')}
              >
                <StepForwardIcon class='size-3 max-h-3' />
              </Button>
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
                    appState.session.config?.algorithm?.pacmap?.nn_phases ?? 300
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
                    appState.session.config?.algorithm?.pacmap?.fp_phases ?? 200
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
              <Button
                variant='ghost'
                size='icon'
                disabled={appState.session.isProcessing}
                class='invisible mb-px size-4 text-xs group-hover/section:visible'
                onClick={() => handleRun('compressed')}
              >
                <StepForwardIcon class='size-3 max-h-3' />
              </Button>
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
                      ?.min_cluster_size ?? 10
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
                    6
                  }
                  step='1'
                  min='0'
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
            disabled={appState.session.isProcessing}
            variant='default'
            size='sm'
            class='relative flex flex-1 items-center gap-2 rounded-full text-sm tabular-nums'
          >
            {appState.session.isProcessing &&
            appState.session.status === 'empty'
              ? 'Discovering...'
              : appState.session.isProcessing &&
                  appState.session.status === 'discovered'
                ? 'Generating...'
                : appState.session.isProcessing &&
                    appState.session.status === 'generated'
                  ? 'Vectorizing...'
                  : appState.session.isProcessing &&
                      appState.session.status === 'vectorized'
                    ? 'Compressing...'
                    : appState.session.isProcessing &&
                        appState.session.status === 'compressed'
                      ? 'Clustering...'
                      : appState.session.status === 'clustered'
                        ? 'Run'
                        : 'Continue'}
            {` (${appState.progress.numerator}/${appState.progress.denominator})`}
            <Show
              when={appState.session.isProcessing}
              fallback={<ArrowRightIcon class='absolute right-3' />}
            >
              <LoaderCircleIcon class='absolute right-3 origin-center animate-spin' />
            </Show>
          </Button>

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
      </div>
    </form>
  );
}
