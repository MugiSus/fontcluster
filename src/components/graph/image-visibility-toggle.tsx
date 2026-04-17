import { ImageIcon, ImageOffIcon } from 'lucide-solid';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

interface ImageVisibilityToggleProps {
  showImages: boolean;
  onToggle: () => void;
}

export function ImageVisibilityToggle(props: ImageVisibilityToggleProps) {
  return (
    <div class='flex rounded-md border bg-background'>
      <Tooltip>
        <TooltipTrigger
          as={Button<'button'>}
          variant='ghost'
          size='icon'
          class='size-8 rounded-none'
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
