import type { JSX } from 'solid-js';

import { StepForwardIcon } from 'lucide-solid';

import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

type ControlPropertySectionProps = {
  title: string;
  children: JSX.Element;
  onStepRun: () => void;
  disabled?: boolean | undefined;
  class?: string | undefined;
  contentClass?: string | undefined;
};

export function ControlPropertySection(props: ControlPropertySectionProps) {
  return (
    <div class={props.class ?? 'group/section flex flex-col gap-2'}>
      <div class='flex items-center gap-1'>
        <div class='text-xs font-semibold'>{props.title}</div>
        <Tooltip>
          <TooltipTrigger
            as={Button<'button'>}
            variant='ghost'
            size='icon'
            disabled={props.disabled}
            class='invisible mb-px size-4 text-xs group-hover/section:visible'
            onClick={props.onStepRun}
          >
            <StepForwardIcon class='size-3.5 max-h-3.5' />
          </TooltipTrigger>
          <TooltipContent>Run from this step</TooltipContent>
        </Tooltip>
      </div>
      <div class={props.contentClass ?? 'flex flex-col gap-0.5'}>
        {props.children}
      </div>
    </div>
  );
}
