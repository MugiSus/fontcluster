import { createSignal, onCleanup, Show } from 'solid-js';
import { Button } from '../ui/button';
import {
  Select,
  SelectContent,
  SelectHiddenSelect,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { TextField, TextFieldInput, TextFieldLabel } from '../ui/text-field';
import { ArrowRightIcon, TypeIcon } from 'lucide-solid';
import { WeightSelector } from '../weight-selector';
import {
  type FontWeight,
  type AlgorithmConfig,
  type ProcessStatus,
  type FontSet,
} from '../../types/font';
import { appState } from '../../store';
import { runProcessingJobs } from '../../actions';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { NumberProperty } from './number-property';
import { ControlPropertySection } from './property-section';
import { TextProperty } from './text-property';

interface DiscoveryFontSetOption {
  value: FontSet;
  label: string;
}

const DISCOVERY_FONT_SET_OPTIONS: DiscoveryFontSetOption[] = [
  { value: 'system_fonts', label: 'Installed Fonts' },
  { value: 'google_fonts_popular100', label: 'Google Fonts top 100' },
  { value: 'google_fonts_popular200', label: 'Google Fonts top 200' },
  { value: 'google_fonts_popular300', label: 'Google Fonts top 300' },
  { value: 'google_fonts_popular500', label: 'Google Fonts top 500' },
  { value: 'google_fonts_popular1000', label: 'Google Fonts top 1000' },
  { value: 'google_fonts_popular1500', label: 'Google Fonts top 1500' },
  { value: 'google_fonts_all', label: 'All Google Fonts' },
];

const DEFAULT_DISCOVERY_FONT_SET_OPTION: DiscoveryFontSetOption = {
  value: 'google_fonts_popular300',
  label: 'Google Fonts top 300',
};

function getDiscoveryFontSetOption(value: FontSet): DiscoveryFontSetOption {
  return (
    DISCOVERY_FONT_SET_OPTIONS.find((option) => option.value === value) ??
    DEFAULT_DISCOVERY_FONT_SET_OPTION
  );
}

export function ControlContent() {
  const [isRunCooldown, setIsRunCooldown] = createSignal(false);
  let runCooldownTimer: ReturnType<typeof setTimeout> | undefined;

  onCleanup(() => {
    if (runCooldownTimer) clearTimeout(runCooldownTimer);
  });

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    void handleRun();
  };

  const handleRun = async (targetStatus?: ProcessStatus) => {
    if (isRunCooldown()) return;

    setIsRunCooldown(true);
    if (runCooldownTimer) clearTimeout(runCooldownTimer);
    runCooldownTimer = setTimeout(() => {
      setIsRunCooldown(false);
      runCooldownTimer = undefined;
    }, 2000);

    const form = document.querySelector('form');
    if (!form) return;

    const isCompletedSession =
      appState.session.config.status.process_status === 'clustered';
    const sessionId =
      targetStatus || !isCompletedSession
        ? appState.session.id || undefined
        : undefined;

    const formdata = new FormData(form);
    const text = formdata.get('preview-text') as string;

    const selectedWeightsString = formdata.get('weights') as string;
    const selectedWeightsArray = (
      selectedWeightsString ? selectedWeightsString.split(',').map(Number) : []
    ) as FontWeight[];

    const algorithm: AlgorithmConfig = {
      discovery: {
        font_set: (formdata.get('discovery-font-set') ??
          appState.session.config?.algorithm?.discovery?.font_set ??
          'google_fonts_popular300') as FontSet,
      },
      image: {
        font_size: Number(formdata.get('image-font-size')) || 224,
      },
      clustering: {
        preprocessing_dimensions: Number(
          formdata.get('clustering-preprocessing-dimensions') || 128,
        ),
        distance_threshold: Number(
          formdata.get('clustering-distance-threshold') || 0.5,
        ),
        target_cluster_count: Number(
          formdata.get('clustering-target-cluster-count') || 0,
        ),
      },
    };

    await runProcessingJobs(
      text || 'A',
      selectedWeightsArray.length > 0 ? selectedWeightsArray : [400],
      algorithm,
      sessionId,
      targetStatus,
    );
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
            value={appState.session.config.preview_text || 'A'}
            placeholder='A'
            spellcheck='false'
            class='h-9 text-[15px]'
          />
        </TextField>
        <TextField class='grid w-full items-center gap-1'>
          <Show when={appState.session.config.session_id || 'session_id'} keyed>
            <WeightSelector
              weights={[100, 200, 300, 400, 500, 600, 700, 800, 900]}
              defaultValue={appState.session.config.weights as FontWeight[]}
              isCompact
            />
          </Show>
        </TextField>
      </div>

      <Show when={appState.session.config.session_id || true} keyed>
        <div class='flex min-h-0 flex-1 grow flex-col gap-1 space-y-3 overflow-y-scroll p-4'>
          <ControlPropertySection
            title='discover'
            disabled={isRunCooldown()}
            onStepRun={() => handleRun('empty')}
            class='group/section space-y-1.5'
            contentClass='grid grid-cols-1 gap-2'
          >
            <TextProperty label='source' class='mr-1 gap-0.5'>
              <Select
                name='discovery-font-set'
                options={DISCOVERY_FONT_SET_OPTIONS}
                optionValue='value'
                optionTextValue='label'
                defaultValue={getDiscoveryFontSetOption(
                  appState.session.config?.algorithm?.discovery?.font_set ??
                    'google_fonts_popular300',
                )}
                itemComponent={(props) => (
                  <SelectItem item={props.item}>
                    {props.item.rawValue.label}
                  </SelectItem>
                )}
              >
                <SelectHiddenSelect />
                <SelectTrigger class='h-8 border-none bg-background px-3 py-2 text-right shadow-sm hover:bg-muted/50 focus:ring-0 focus:ring-offset-0'>
                  <SelectValue<DiscoveryFontSetOption>>
                    {(state) => state.selectedOption().label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent />
              </Select>
            </TextProperty>
          </ControlPropertySection>

          <ControlPropertySection
            title='generate'
            disabled={isRunCooldown()}
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
            disabled={isRunCooldown()}
            onStepRun={() => handleRun('generated')}
          >
            <div class='flex h-8 items-center px-2 text-xs font-medium text-muted-foreground'>
              RepVit M1.0 on ONNX Runtime
            </div>
          </ControlPropertySection>

          <ControlPropertySection
            title='position'
            disabled={isRunCooldown()}
            onStepRun={() => handleRun('vectorized')}
          >
            <div class='flex h-8 items-center px-2 text-xs font-medium text-muted-foreground'>
              PCA 384D {'->'} 2D
            </div>
          </ControlPropertySection>

          <ControlPropertySection
            title='clustering'
            disabled={isRunCooldown()}
            onStepRun={() => handleRun('positioned')}
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
        </div>
      </Show>

      <div class='border-t p-4'>
        <Tooltip>
          <TooltipTrigger
            as={Button<'button'>}
            type='submit'
            disabled={isRunCooldown()}
            variant='default'
            size='sm'
            class='relative flex w-full items-center gap-2 rounded-full text-sm font-bold tabular-nums hover:shadow-lg hover:shadow-primary/25'
          >
            Run
            <ArrowRightIcon class='absolute right-3' />
          </TooltipTrigger>
          <TooltipContent>Run processing</TooltipContent>
        </Tooltip>
      </div>
    </form>
  );
}
