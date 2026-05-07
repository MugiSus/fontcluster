import { Show } from 'solid-js';
import { Button } from '../ui/button';
import { TextField, TextFieldInput, TextFieldLabel } from '../ui/text-field';
import {
  ArrowRightIcon,
  LoaderCircleIcon,
  PauseIcon,
  TypeIcon,
} from 'lucide-solid';
import { WeightSelector } from '../weight-selector';
import {
  type FontWeight,
  type AlgorithmConfig,
  type ProcessStatus,
  type FontSet,
} from '../../types/font';
import { cn } from '@/lib/utils';
import { appState, setAppState } from '../../store';
import { runProcessingJobs, stopJobs, setSelectedWeights } from '../../actions';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { NumberProperty } from './number-property';
import { ControlPropertySection } from './property-section';
import { TextProperty } from './text-property';

export function ControlContent() {
  const selectedFontSet = () =>
    (appState.session.config?.algorithm?.discovery?.font_set ??
      'google_fonts_popular300') as FontSet;
  const showDownloadProgress = () => selectedFontSet() !== 'system_fonts';
  const progressPercent = () =>
    `${(appState.progress.numerator / appState.progress.denominator || 0) * 100}%`;

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    handleRun();
  };

  const handleRun = async (targetStatus?: ProcessStatus) => {
    const form = document.querySelector('form');
    if (!form) return;

    const isRerun = targetStatus !== undefined;
    const isFinished = appState.session.status === 'positioned';
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
      clustering: {
        preprocessing_dimensions: Number(
          formData.get('clustering-preprocessing-dimensions'),
        ),
        distance_threshold: Number(
          formData.get('clustering-distance-threshold'),
        ),
        target_cluster_count: Number(
          formData.get('clustering-target-cluster-count'),
        ),
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
            class='absolute inset-y-0 left-2 flex items-center gap-1.5 font-medium'
          >
            <TypeIcon class='mb-0.5 size-3.5' />
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
            placeholder='Font'
            spellcheck='false'
            class='h-9 text-[15px]'
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

      <Show when={appState.session.config.session_id} keyed>
        <div class='flex min-h-0 flex-1 grow flex-col gap-1 space-y-3 overflow-y-scroll p-4'>
          <ControlPropertySection
            title='discover'
            disabled={appState.session.isProcessing}
            onStepRun={() => handleRun('empty')}
            class='group/section space-y-1.5'
            contentClass='grid grid-cols-1 gap-2'
          >
            <TextProperty label='source' class='mr-1 gap-0.5'>
              <select
                class='flex h-8 w-full rounded-md border border-none border-input bg-background px-3 py-2 text-right text-sm shadow-sm transition-colors [text-align-last:right] file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground hover:bg-muted/50 focus-visible:border-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50'
                value={
                  appState.session.config?.algorithm?.discovery?.font_set ??
                  'google_fonts_popular300'
                }
                onChange={(e) =>
                  setAppState('session', 'config', 'algorithm', 'discovery', {
                    font_set: e.currentTarget.value as FontSet,
                  })
                }
              >
                <option value='system_fonts'>Installed Fonts</option>
                <hr />
                <option value='google_fonts_popular100'>
                  Google Fonts top 100
                </option>
                <option value='google_fonts_popular200'>
                  Google Fonts top 200
                </option>
                <option value='google_fonts_popular300'>
                  Google Fonts top 300
                </option>
                <option value='google_fonts_popular500'>
                  Google Fonts top 500
                </option>
                <option value='google_fonts_popular1000'>
                  Google Fonts top 1000
                </option>
                <option value='google_fonts_popular1500'>
                  Google Fonts top 1500
                </option>
                <option value='google_fonts_all'>All Google Fonts</option>
              </select>
            </TextProperty>
          </ControlPropertySection>

          <ControlPropertySection
            title='generate'
            disabled={appState.session.isProcessing}
            onStepRun={() => handleRun('discovered')}
          >
            <NumberProperty
              label='font size'
              name='image-font-size'
              defaultValue={
                appState.session.config?.algorithm?.image?.font_size ?? 224
              }
              step={1}
              minValue={1}
            />
          </ControlPropertySection>

          <ControlPropertySection
            title='analyze'
            disabled={appState.session.isProcessing}
            onStepRun={() => handleRun('generated')}
          >
            <div class='flex h-8 items-center px-2 text-xs font-medium text-muted-foreground'>
              RepVit M1.0 on ONNX Runtime
            </div>
          </ControlPropertySection>

          <ControlPropertySection
            title='clustering'
            disabled={appState.session.isProcessing}
            onStepRun={() => handleRun('vectorized')}
          >
            <div class='flex h-8 items-center px-2 text-xs font-medium text-muted-foreground'>
              Agglomerative Clustering
            </div>
            <NumberProperty
              label='PCA dimensions'
              name='clustering-preprocessing-dimensions'
              defaultValue={
                appState.session.config?.algorithm?.clustering
                  ?.preprocessing_dimensions ?? 64
              }
              step={1}
              minValue={1}
              maxValue={384}
            />
            <NumberProperty
              label='distance threshold'
              name='clustering-distance-threshold'
              defaultValue={
                appState.session.config?.algorithm?.clustering
                  ?.distance_threshold ?? 0.4
              }
              step={0.01}
              minValue={0}
            />
            <NumberProperty
              label='target clusters'
              name='clustering-target-cluster-count'
              defaultValue={
                appState.session.config?.algorithm?.clustering
                  ?.target_cluster_count ?? 0
              }
              step={1}
              minValue={0}
            />
          </ControlPropertySection>

          <ControlPropertySection
            title='position'
            disabled={appState.session.isProcessing}
            onStepRun={() => handleRun('clustered')}
          >
            <div class='flex h-8 items-center px-2 text-xs font-medium text-muted-foreground'>
              PCA 384D {'->'} 2D
            </div>
          </ControlPropertySection>
        </div>
      </Show>

      <div class='flex flex-col gap-1 border-t p-4'>
        <div class='mb-1 flex items-center gap-1'>
          <Tooltip>
            <TooltipTrigger
              as={Button<'button'>}
              type='submit'
              disabled={appState.session.isProcessing}
              variant='default'
              size='sm'
              class='relative flex flex-1 items-center gap-2 rounded-full text-sm font-bold tabular-nums hover:shadow-lg hover:shadow-primary/25'
            >
              {appState.session.isProcessing
                ? 'Processing...'
                : appState.session.status === 'positioned'
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
              {appState.session.status === 'positioned'
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

        <div
          class={cn(
            'grid gap-1',
            showDownloadProgress() ? 'grid-cols-6' : 'grid-cols-5',
          )}
        >
          <Show when={showDownloadProgress()}>
            <div
              class='h-1 overflow-hidden rounded-full bg-primary/30'
              style={{
                '--progress':
                  appState.session.isProcessing &&
                  appState.session.status === 'empty'
                    ? progressPercent()
                    : '0%',
              }}
            >
              <div
                class={cn(
                  'h-full w-0 rounded-full bg-primary',
                  appState.session.isProcessing &&
                    appState.session.status === 'empty' &&
                    'w-[var(--progress)] animate-pulse',
                  (appState.session.status === 'downloaded' ||
                    appState.session.status === 'discovered' ||
                    appState.session.status === 'generated' ||
                    appState.session.status === 'vectorized' ||
                    appState.session.status === 'clustered' ||
                    appState.session.status === 'positioned') &&
                    'w-full',
                )}
              />
            </div>
          </Show>
          <div
            class='h-1 overflow-hidden rounded-full bg-primary/30'
            style={{
              '--progress':
                appState.session.isProcessing &&
                appState.session.status ===
                  (showDownloadProgress() ? 'downloaded' : 'empty')
                  ? progressPercent()
                  : '0%',
            }}
          >
            <div
              class={cn(
                'h-full w-0 rounded-full bg-primary',
                appState.session.isProcessing &&
                  appState.session.status ===
                    (showDownloadProgress() ? 'downloaded' : 'empty') &&
                  'w-[var(--progress)] animate-pulse',
                (appState.session.status === 'discovered' ||
                  appState.session.status === 'generated' ||
                  appState.session.status === 'vectorized' ||
                  appState.session.status === 'clustered' ||
                  appState.session.status === 'positioned') &&
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
                  ? progressPercent()
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
                  appState.session.status === 'clustered' ||
                  appState.session.status === 'positioned') &&
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
                  ? progressPercent()
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
                  appState.session.status === 'clustered' ||
                  appState.session.status === 'positioned') &&
                  'w-full',
              )}
            />
          </div>
          <div class='h-1 overflow-hidden rounded-full bg-primary/30'>
            <div
              class={cn(
                'h-full w-0 rounded-full bg-primary',
                (appState.session.status === 'clustered' ||
                  appState.session.status === 'positioned') &&
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
                appState.session.status === 'positioned' && 'w-full',
                appState.session.isProcessing &&
                  appState.session.status === 'clustered' &&
                  'w-full animate-pulse transition-[width] duration-1000',
              )}
            />
          </div>
        </div>

        <div
          class={cn(
            'flex items-end justify-between text-xs font-semibold text-muted-foreground',
            appState.session.isProcessing && 'animate-pulse',
          )}
        >
          <span>
            {!appState.session.isProcessing
              ? 'Completed'
              : appState.session.status === 'empty'
                ? showDownloadProgress()
                  ? 'Downloading Fonts...'
                  : 'Discovering Fonts...'
                : appState.session.status === 'downloaded'
                  ? 'Discovering Fonts...'
                  : appState.session.status === 'discovered'
                    ? 'Drawing Glyphs...'
                    : appState.session.status === 'generated'
                      ? 'Analyzing Glyphs...'
                      : appState.session.status === 'vectorized'
                        ? 'Classifying Fonts...'
                        : appState.session.status === 'clustered'
                          ? 'Positioning Points...'
                          : ''}
          </span>
          <Show
            when={
              appState.session.isProcessing &&
              (appState.session.status === 'empty' ||
                appState.session.status === 'downloaded' ||
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
    </form>
  );
}
