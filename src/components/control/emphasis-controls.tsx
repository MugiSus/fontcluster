import { createMemo, createSignal, For } from 'solid-js';
import { createStore } from 'solid-js/store';
import { ChevronRightIcon, SlidersVerticalIcon } from 'lucide-solid';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import {
  Slider,
  SliderFill,
  SliderThumb,
  SliderTrack,
} from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  EMPHASIS_LEVEL_MAX,
  EMPHASIS_LEVEL_MIN,
  EMPHASIS_LEVEL_NEUTRAL,
  EMPHASIS_LEVEL_STEP,
  EMPHASIS_PRESETS,
  type EmphasisPreset,
} from '@/constants/emphasis';
import { EMPHASIS_ATTRIBUTES } from '@/constants/session';
import { useI18n } from '@/i18n';
import { appState } from '@/store';

/**
 * Modal form control for the 37 O'Donovan attribute-emphasis levels.
 *
 * `levels` is the single draft state. Hidden inputs expose that draft to the
 * enclosing processing form, while preset constants remain immutable inputs.
 */
export function EmphasisControls() {
  const { t } = useI18n();
  const savedClustering = appState.session.algorithm.clustering;

  const currentLevels = Object.fromEntries(
    EMPHASIS_ATTRIBUTES.map((attribute) => [
      attribute,
      savedClustering.enable_attribute_emphasis
        ? (savedClustering.emphasis?.[attribute] ?? EMPHASIS_LEVEL_NEUTRAL)
        : EMPHASIS_LEVEL_NEUTRAL,
    ]),
  ) as EmphasisPreset;

  const [levels, setLevels] = createStore({ ...currentLevels });
  const [isOpen, setIsOpen] = createSignal(false);

  const selectedPreset = createMemo(() => {
    if (
      EMPHASIS_ATTRIBUTES.every(
        (attribute) => levels[attribute] === EMPHASIS_PRESETS.none[attribute],
      )
    ) {
      return 'none';
    }
    if (
      EMPHASIS_ATTRIBUTES.every(
        (attribute) =>
          levels[attribute] === EMPHASIS_PRESETS.default[attribute],
      )
    ) {
      return 'default';
    }
    return 'custom';
  });

  return (
    <>
      <For each={EMPHASIS_ATTRIBUTES}>
        {(attribute) => (
          <input
            type='hidden'
            name={`clustering-emphasis-${attribute}`}
            value={levels[attribute]}
          />
        )}
      </For>

      <Dialog open={isOpen()} onOpenChange={setIsOpen}>
        <DialogTrigger
          as={Button<'button'>}
          type='button'
          variant='ghost'
          size='sm'
          class='group h-8 justify-start pl-2 pr-0.5 capitalize text-muted-foreground shadow-none hover:text-foreground'
        >
          <SlidersVerticalIcon />
          <span>{t.controlPanel.emphasis.title()}</span>
          <span class='ml-auto text-xs text-foreground'>
            {t.controlPanel.emphasis.presets[selectedPreset()]()}
          </span>
          <ChevronRightIcon />
        </DialogTrigger>

        <DialogContent class='w-fit max-w-[calc(100vw-16rem)] gap-0 overflow-hidden p-0 shadow'>
          <DialogHeader class='flex-row items-center gap-4 space-y-0 px-4 py-6 text-left'>
            <SlidersVerticalIcon class='size-4' />
            <div class='flex flex-col gap-2'>
              <DialogTitle>
                {t.controlPanel.emphasis.equalizerTitle()}
              </DialogTitle>
              <DialogDescription>
                {t.controlPanel.emphasis.description()}
              </DialogDescription>
            </div>
          </DialogHeader>

          <Separator />

          <div class='flex items-center gap-2 p-4 py-2'>
            <span class='mr-2 text-xs font-bold'>
              {t.controlPanel.emphasis.preset()}
            </span>
            <ToggleGroup
              aria-label={t.controlPanel.emphasis.preset()}
              value={selectedPreset() === 'custom' ? null : selectedPreset()}
              onChange={(preset) => {
                if (preset === 'default' || preset === 'none') {
                  setLevels({ ...EMPHASIS_PRESETS[preset] });
                }
              }}
              size='sm'
              class='justify-start gap-2 *:text-xs'
            >
              <ToggleGroupItem value='default'>
                {t.controlPanel.emphasis.presets.default()}
              </ToggleGroupItem>
              <ToggleGroupItem value='none'>
                {t.controlPanel.emphasis.presets.none()}
              </ToggleGroupItem>
            </ToggleGroup>
            <span class='ml-auto text-xs text-muted-foreground'>
              {t.controlPanel.emphasis.presets[selectedPreset()]()}
            </span>
          </div>

          <Separator />

          <div class='relative grid auto-cols-[48px] grid-flow-col grid-rows-[auto_auto_auto] items-center gap-x-1 gap-y-6 overflow-x-auto px-1 py-6'>
            <span aria-hidden='true' />
            <div
              aria-hidden='true'
              class='flex flex-col items-end justify-between self-stretch px-2 text-xs tabular-nums leading-[0px] text-muted-foreground'
            >
              <span>+{EMPHASIS_LEVEL_MAX}</span>
              <span>±{EMPHASIS_LEVEL_NEUTRAL}</span>
              <span>{EMPHASIS_LEVEL_MIN}</span>
            </div>
            <span aria-hidden='true' />

            <For each={EMPHASIS_ATTRIBUTES}>
              {(attribute) => {
                const label = t.controlPanel.emphasis.attributes[attribute];
                return (
                  <div class='contents'>
                    <output class='justify-self-center text-xs font-bold tabular-nums'>
                      {levels[attribute] === 0
                        ? '±'
                        : levels[attribute] > 0
                          ? '+'
                          : ''}
                      {levels[attribute]}
                    </output>
                    <Slider
                      value={[levels[attribute]]}
                      onChange={(value) =>
                        setLevels(attribute, value[0] ?? EMPHASIS_LEVEL_NEUTRAL)
                      }
                      minValue={EMPHASIS_LEVEL_MIN}
                      maxValue={EMPHASIS_LEVEL_MAX}
                      step={EMPHASIS_LEVEL_STEP}
                      orientation='vertical'
                      getValueLabel={({ values }) =>
                        `${label()}: ${values[0] ?? EMPHASIS_LEVEL_NEUTRAL}`
                      }
                      class='h-60 flex-col'
                    >
                      <SliderTrack>
                        <SliderFill originValue={EMPHASIS_LEVEL_NEUTRAL} />
                        <SliderThumb aria-label={label()} />
                      </SliderTrack>
                    </Slider>
                    <span class='min-w-0 break-words text-center text-xxs leading-tight text-muted-foreground'>
                      {label()}
                    </span>
                  </div>
                );
              }}
            </For>

            <span aria-hidden='true' />
            <div
              aria-hidden='true'
              class='flex flex-col justify-between self-stretch px-2 text-xs tabular-nums leading-[0px] text-muted-foreground'
            >
              <span>+{EMPHASIS_LEVEL_MAX}</span>
              <span>±{EMPHASIS_LEVEL_NEUTRAL}</span>
              <span>{EMPHASIS_LEVEL_MIN}</span>
            </div>
            <span aria-hidden='true' />
          </div>

          <Separator />

          <DialogFooter class='p-4'>
            <Button
              type='button'
              size='sm'
              class='h-8 rounded-full'
              onClick={() => setIsOpen(false)}
            >
              {t.controlPanel.emphasis.done()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
