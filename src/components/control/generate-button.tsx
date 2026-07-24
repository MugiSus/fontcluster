import {
  ChevronUpIcon,
  CopyPlusIcon,
  PlusIcon,
  RefreshCwIcon,
} from 'lucide-solid';

import type { ProcessingRunMode } from '@/actions';
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
  onSelect: (mode: ProcessingRunMode) => void;
};

/**
 * The primary action follows the draft state: an unchanged form starts a new
 * session, while a changed form applies the draft to the current session. The
 * adjacent menu exposes the explicit session ownership choices.
 * DropdownMenu supplies the keyboard navigation and outside-click handling.
 */
export function GenerateButton(props: GenerateButtonProps) {
  const { t } = useI18n();
  const select = (mode: ProcessingRunMode) => props.onSelect(mode);
  const primaryMode = () => (props.hasChanges ? 'in_place_changed' : 'fresh');
  const primaryLabel = () =>
    props.hasChanges
      ? t.controlPanel.generateModes.applyChanges()
      : t.controlPanel.generateModes.fresh();

  return (
    <div class='flex w-full'>
      <Tooltip>
        <TooltipTrigger
          as={Button<'button'>}
          type='button'
          disabled={props.isDisabled}
          variant='outline'
          size='sm'
          class='relative flex min-w-0 flex-1 items-center gap-2 rounded-l-full rounded-r-none border-r-0 text-sm font-black tabular-nums shadow-sm'
          onClick={() => select(primaryMode())}
        >
          {primaryLabel()}
        </TooltipTrigger>
        <TooltipContent>{primaryLabel()}</TooltipContent>
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
            onSelect={() => select('duplicate_changed')}
          >
            <CopyPlusIcon class='size-4' />
            {t.controlPanel.generateModes.duplicateChanged()}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!props.hasSession || !props.hasChanges}
            onSelect={() => select('in_place_changed')}
          >
            <RefreshCwIcon class='size-4' />
            {t.controlPanel.generateModes.inPlaceChanged()}
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
