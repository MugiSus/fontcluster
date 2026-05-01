import { PlusIcon, MinusIcon, MaximizeIcon } from 'lucide-solid';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

interface ZoomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}

export function ZoomControls(props: ZoomControlsProps) {
  return (
    <div class='flex flex-col rounded-md border bg-background'>
      <Tooltip placement='left'>
        <TooltipTrigger
          as={Button<'button'>}
          variant='ghost'
          size='icon'
          class='size-8 rounded-none'
          onClick={() => props.onZoomIn()}
        >
          <PlusIcon class='size-4' />
        </TooltipTrigger>
        <TooltipContent>Zoom In</TooltipContent>
      </Tooltip>

      <Tooltip placement='left'>
        <TooltipTrigger
          as={Button<'button'>}
          variant='ghost'
          size='icon'
          class='size-8 rounded-none'
          onClick={() => props.onReset()}
        >
          <MaximizeIcon class='size-4' />
        </TooltipTrigger>
        <TooltipContent>Reset View</TooltipContent>
      </Tooltip>

      <Tooltip placement='left'>
        <TooltipTrigger
          as={Button<'button'>}
          variant='ghost'
          size='icon'
          class='size-8 rounded-none'
          onClick={() => props.onZoomOut()}
        >
          <MinusIcon class='size-4' />
        </TooltipTrigger>
        <TooltipContent>Zoom Out</TooltipContent>
      </Tooltip>
    </div>
  );
}
