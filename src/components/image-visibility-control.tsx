import { ImageIcon, ImageOffIcon } from 'lucide-solid';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

interface ImageVisibilityControlProps {
  showImages: boolean;
  onToggle: () => void;
}

export function ImageVisibilityControl(props: ImageVisibilityControlProps) {
  return (
    <div class='flex rounded-md border bg-background p-1 shadow-sm'>
      <Tooltip>
        <TooltipTrigger
          as={Button<'button'>}
          variant='ghost'
          size='icon'
          class='size-6'
          onClick={() => props.onToggle()}
        >
          {props.showImages ? (
            <ImageOffIcon class='size-4' />
          ) : (
            <ImageIcon class='size-4' />
          )}
        </TooltipTrigger>
        <TooltipContent>
          {props.showImages ? 'Hide Images' : 'Show Images'}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
