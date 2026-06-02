import { LassoSelectIcon, XIcon } from 'lucide-solid';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

interface LassoClearButtonProps {
  onClear: () => void;
}

export function LassoClearButton(props: LassoClearButtonProps) {
  return (
    <div class='flex flex-col overflow-hidden rounded-md border bg-background'>
      <Tooltip placement='left'>
        <TooltipTrigger
          as={Button<'button'>}
          variant='default'
          size='icon'
          class='group relative size-8 rounded-none'
          onClick={() => props.onClear()}
        >
          <LassoSelectIcon class='size-4 transition-opacity group-hover:opacity-0 group-focus-visible:opacity-0' />
          <XIcon class='absolute size-4 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100' />
        </TooltipTrigger>
        <TooltipContent>Clear lasso</TooltipContent>
      </Tooltip>
    </div>
  );
}
