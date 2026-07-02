import { Show, type JSX } from 'solid-js';

import { RotateCwIcon } from 'lucide-solid';

import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type ControlPropertySectionProps = {
  title: string;
  children?: JSX.Element;
  onStepRun: () => void;
  isRunnable?: boolean;
  isDisabled?: boolean | undefined;
};

export function ControlPropertySection(props: ControlPropertySectionProps) {
  const { t } = useI18n();
  return (
    <div class='group/section flex flex-col'>
      <div class='flex items-center gap-2 py-1.5'>
        <div class='text-xs font-semibold capitalize'>{props.title}</div>
        <Show when={props.isRunnable !== false}>
          <Tooltip>
            <TooltipTrigger
              as={Button<'button'>}
              variant='ghost'
              size='icon'
              disabled={props.isDisabled}
              class='invisible mb-px size-5 text-xs group-hover/section:visible'
              onClick={props.onStepRun}
            >
              <RotateCwIcon class='size-3.5 max-h-3.5' />
            </TooltipTrigger>
            <TooltipContent>{t.controlPanel.recalculate()}</TooltipContent>
          </Tooltip>
        </Show>
      </div>
      <div class='flex flex-col gap-0.5'>{props.children}</div>
    </div>
  );
}
