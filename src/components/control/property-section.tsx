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
};

export function ControlPropertySection(props: ControlPropertySectionProps) {
  const { t } = useI18n();
  return (
    <div class='group/section flex flex-col'>
      <div class='flex h-8 items-center gap-0.5'>
        <div
          class='text-xs font-semibold capitalize'
          classList={{ 'text-primary': props.isChanged }}
        >
          {props.title}
        </div>
        <Show when={props.isChanged}>
          <Tooltip>
            <TooltipTrigger
              as={Button<'button'>}
              type='button'
              variant='ghost'
              size='icon'
              aria-label={t.controlPanel.restoreSession()}
              class='mb-0.5 size-5 text-xs'
              classList={{ '!text-primary': props.isChanged }}
              onClick={props.onRestore}
            >
              <RotateCwIcon class='!size-3.5' stroke-width={2.5} />
            </TooltipTrigger>
            <TooltipContent>{t.controlPanel.restoreSession()}</TooltipContent>
          </Tooltip>
        </Show>
      </div>
      <div class='flex flex-col gap-0.5'>{props.children}</div>
    </div>
  );
}
