import { PlusIcon, MinusIcon, MaximizeIcon } from 'lucide-solid';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

interface ZoomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}

export function ZoomControls(props: ZoomControlsProps) {
  return (
    <div class='flex gap-1 rounded-md border bg-background p-1 shadow-sm'>
      <Tooltip>
        <TooltipTrigger
          as={Button<'button'>}
          variant='ghost'
          size='icon'
          class='size-6'
          onClick={() => props.onZoomIn()}
        >
          <PlusIcon class='size-4' />
        </TooltipTrigger>
        <TooltipContent>Zoom In</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          as={Button<'button'>}
          variant='ghost'
          size='icon'
          class='size-6'
          onClick={() => props.onReset()}
        >
          <MaximizeIcon class='size-4' />
        </TooltipTrigger>
        <TooltipContent>Reset View</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          as={Button<'button'>}
          variant='ghost'
          size='icon'
          class='size-6'
          onClick={() => props.onZoomOut()}
        >
          <MinusIcon class='size-4' />
        </TooltipTrigger>
        <TooltipContent>Zoom Out</TooltipContent>
      </Tooltip>
    </div>
  );
}
