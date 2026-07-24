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
  onRestore: () => void;
  isChanged: boolean;
  isDisabled?: boolean | undefined;
};

export function ControlPropertySection(props: ControlPropertySectionProps) {
  const { t } = useI18n();
  return (
    <div class='group/section flex flex-col'>
      <div class='flex h-8 items-center gap-2'>
        <div class='text-xs font-semibold capitalize'>{props.title}</div>
        <Show when={props.isChanged}>
          <Tooltip>
            <TooltipTrigger
              as={Button<'button'>}
              type='button'
              variant='ghost'
              size='icon'
              disabled={props.isDisabled}
              aria-label={t.controlPanel.restoreSession()}
              class='mb-px size-5 text-xs'
              onClick={props.onRestore}
            >
              <RotateCwIcon class='size-3.5 max-h-3.5' />
            </TooltipTrigger>
            <TooltipContent>{t.controlPanel.restoreSession()}</TooltipContent>
          </Tooltip>
        </Show>
      </div>
      <div class='flex flex-col gap-0.5'>{props.children}</div>
    </div>
  );
}
