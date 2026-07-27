import {
  ChevronUpIcon,
  CopyPlusIcon,
  PlusIcon,
  RefreshCwIcon,
} from 'lucide-solid';

import type { ProcessingRunMode } from '@/commands/session';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useI18n } from '@/i18n';

type GenerateButtonProps = {
  isDisabled?: boolean;
  hasSession: boolean;
  hasChanges: boolean;
  primaryMode: Extract<ProcessingRunMode, 'in_place_changed' | 'fresh'>;
  onSelect: (mode: ProcessingRunMode) => void;
};

/**
 * The primary action follows the session mode selected by the form owner. The
 * adjacent menu exposes all explicit session ownership choices, including
 * starting a new session when there are no draft changes.
 * DropdownMenu supplies the keyboard navigation and outside-click handling.
 */
export function GenerateButton(props: GenerateButtonProps) {
  const { t } = useI18n();
  const select = (mode: ProcessingRunMode) => props.onSelect(mode);

  return (
    <div class='flex w-full'>
      <Tooltip>
        <TooltipTrigger
          as={Button<'button'>}
          type='button'
          disabled={props.isDisabled || !props.hasChanges}
          variant='outline'
          size='sm'
          class='relative flex min-w-0 flex-1 items-center gap-2 rounded-l-full rounded-r-none border-r-0 text-sm font-black tabular-nums shadow-sm'
          onClick={() => select(props.primaryMode)}
        >
          {props.primaryMode === 'fresh'
            ? t.controlPanel.generateModes.generate()
            : t.controlPanel.generateModes.applyChanges()}
        </TooltipTrigger>
        <TooltipContent>
          {props.primaryMode === 'fresh'
            ? t.controlPanel.generateModes.fresh()
            : t.controlPanel.generateModes.inPlaceChanged()}
        </TooltipContent>
      </Tooltip>

      <DropdownMenu>
        <DropdownMenuTrigger
          as={Button<'button'>}
          type='button'
          disabled={props.isDisabled}
          variant='outline'
          size='sm'
          aria-label={t.controlPanel.generateModes.open()}
          class='size-9 shrink-0 rounded-l-none rounded-r-full border-l px-0 shadow-sm'
        >
          <ChevronUpIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent class='w-72 p-1'>
          <DropdownMenuItem
            disabled={!props.hasSession || !props.hasChanges}
            onSelect={() => select('in_place_changed')}
          >
            <RefreshCwIcon class='size-4' />
            {t.controlPanel.generateModes.inPlaceChanged()}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!props.hasSession || !props.hasChanges}
            onSelect={() => select('duplicate_changed')}
          >
            <CopyPlusIcon class='size-4' />
            {t.controlPanel.generateModes.duplicateChanged()}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => select('fresh')}>
            <PlusIcon class='size-4' />
            {t.controlPanel.generateModes.fresh()}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
