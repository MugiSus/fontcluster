import { MaximizeIcon, MinusIcon, PlusIcon } from 'lucide-solid';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface GraphZoomControlsProps {
  onZoomIn?: (() => void) | undefined;
  onZoomOut?: (() => void) | undefined;
  onResetZoom?: (() => void) | undefined;
}

export function GraphZoomControls(props: GraphZoomControlsProps) {
  const { t } = useI18n();

  return (
    <div class='flex items-center rounded-full border border-border/25 bg-background/50 text-muted-foreground shadow-inner-background backdrop-blur-md'>
      <Tooltip placement='bottom'>
        <TooltipTrigger
          as={Button<'button'>}
          variant='ghost'
          size='icon'
          class='size-8 rounded-full text-muted-foreground shadow-none hover:bg-accent/80 hover:text-foreground'
          aria-label={t.graph.bottomToolbar.zoomIn()}
          disabled={!props.onZoomIn}
          onClick={() => props.onZoomIn?.()}
        >
          <PlusIcon class='size-4' />
        </TooltipTrigger>
        <TooltipContent>{t.graph.bottomToolbar.zoomIn()}</TooltipContent>
      </Tooltip>

      <Tooltip placement='bottom'>
        <TooltipTrigger
          as={Button<'button'>}
          variant='ghost'
          size='icon'
          class='size-8 rounded-full text-muted-foreground shadow-none hover:bg-accent/80 hover:text-foreground'
          aria-label={t.graph.bottomToolbar.resetView()}
          disabled={!props.onResetZoom}
          onClick={() => props.onResetZoom?.()}
        >
          <MaximizeIcon class='size-4' />
        </TooltipTrigger>
        <TooltipContent>{t.graph.bottomToolbar.resetView()}</TooltipContent>
      </Tooltip>

      <Tooltip placement='bottom'>
        <TooltipTrigger
          as={Button<'button'>}
          variant='ghost'
          size='icon'
          class='size-8 rounded-full text-muted-foreground shadow-none hover:bg-accent/80 hover:text-foreground'
          aria-label={t.graph.bottomToolbar.zoomOut()}
          disabled={!props.onZoomOut}
          onClick={() => props.onZoomOut?.()}
        >
          <MinusIcon class='size-4' />
        </TooltipTrigger>
        <TooltipContent>{t.graph.bottomToolbar.zoomOut()}</TooltipContent>
      </Tooltip>
    </div>
  );
}
