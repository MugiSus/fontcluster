import { ImageIcon, TypeIcon } from 'lucide-solid';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

interface ImageVisibilityToggleProps {
  showImages: boolean;
  showFontNames: boolean;
  onToggleImages: () => void;
  onToggleFontNames: () => void;
}

export function ImageVisibilityToggle(props: ImageVisibilityToggleProps) {
  return (
    <div class='flex flex-col overflow-hidden rounded-md border bg-background'>
      <Tooltip placement='left'>
        <TooltipTrigger
          as={Button<'button'>}
          variant={props.showFontNames ? 'default' : 'ghost'}
          size='icon'
          class='size-8 rounded-none'
          onClick={() => props.onToggleFontNames()}
        >
          <TypeIcon class='size-4' />
        </TooltipTrigger>
        <TooltipContent>
          {props.showFontNames ? 'Hide Font Names' : 'Show Font Names'}
        </TooltipContent>
      </Tooltip>

      <Tooltip placement='left'>
        <TooltipTrigger
          as={Button<'button'>}
          variant={props.showImages ? 'default' : 'ghost'}
          size='icon'
          class='size-8 rounded-none'
          onClick={() => props.onToggleImages()}
        >
          <ImageIcon class='size-4' />
        </TooltipTrigger>
        <TooltipContent>
          {props.showImages ? 'Hide Images' : 'Show Images'}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
