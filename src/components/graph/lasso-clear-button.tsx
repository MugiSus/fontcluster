import { LassoSelectIcon, XIcon } from 'lucide-solid';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

interface LassoClearButtonProps {
  onClear: () => void;
}

export function LassoClearButton(props: LassoClearButtonProps) {
  return (
    <div class='flex flex-col overflow-hidden rounded-full border bg-background text-muted-foreground'>
      <Tooltip placement='top'>
        <TooltipTrigger
          as={Button<'button'>}
          variant='ghost'
          class='group relative flex h-8 rounded-none pl-2 pr-2.5'
          onClick={() => props.onClear()}
        >
          <XIcon class='size-4' />
          <LassoSelectIcon class='size-4' />
        </TooltipTrigger>
        <TooltipContent>Clear lasso selection</TooltipContent>
      </Tooltip>
    </div>
  );
}
