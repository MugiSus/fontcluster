import { Show, type JSX } from 'solid-js';

import { RotateCwIcon } from 'lucide-solid';

import { t } from '@/i18n';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

type ControlPropertySectionProps = {
  title: string;
  children?: JSX.Element;
  onStepRun: () => void;
  isRunnable?: boolean;
  isDisabled?: boolean | undefined;
  class?: string | undefined;
  contentClass?: string | undefined;
};

export function ControlPropertySection(props: ControlPropertySectionProps) {
  return (
    <div class={props.class ?? 'group/section flex flex-col gap-2'}>
      <div class='flex items-center gap-1'>
        <div class='text-xs font-semibold capitalize'>{props.title}</div>
        <Show when={props.isRunnable !== false}>
          <Tooltip>
            <TooltipTrigger
              as={Button<'button'>}
              variant='ghost'
              size='icon'
              disabled={props.isDisabled}
              class='invisible mb-px size-4 text-xs group-hover/section:visible'
              onClick={props.onStepRun}
            >
              <RotateCwIcon class='size-3 max-h-3' />
            </TooltipTrigger>
            <TooltipContent>{t('control.recalculate')}</TooltipContent>
          </Tooltip>
        </Show>
      </div>
      <div class={props.contentClass ?? 'flex flex-col gap-0.5'}>
        {props.children}
      </div>
    </div>
  );
}
