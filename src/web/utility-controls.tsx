import { Redo2Icon, Undo2Icon } from 'lucide-solid';
import { useI18n } from '@/i18n';
import { selectionHistory } from '@/selection-history';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { LanguageToggle } from '@/components/graph/utility-controls/language-toggle';
import { ThemeModeToggle } from '@/components/graph/utility-controls/theme-mode-toggle';

export function WebUtilityControls() {
  const { t } = useI18n();

  return (
    <div class='pointer-events-auto absolute right-[3px] top-[3px] z-30 flex items-center justify-end gap-0 rounded-full border border-border/25 bg-background/50 shadow-inner-background backdrop-blur-md'>
      <Tooltip>
        <TooltipTrigger as='div' class='rounded-full'>
          <Button
            variant='ghost'
            size='icon'
            onClick={selectionHistory.undo}
            disabled={!selectionHistory.canUndo()}
            class='size-8 rounded-full text-muted-foreground hover:bg-accent/80 hover:text-foreground'
          >
            <Undo2Icon class='size-4' />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t.graph.utilityControls.undo.title()}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger as='div' class='rounded-full'>
          <Button
            variant='ghost'
            size='icon'
            onClick={selectionHistory.redo}
            disabled={!selectionHistory.canRedo()}
            class='size-8 rounded-full text-muted-foreground hover:bg-accent/80 hover:text-foreground'
          >
            <Redo2Icon class='size-4' />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t.graph.utilityControls.redo.title()}</TooltipContent>
      </Tooltip>

      <div class='pointer-events-none mx-1 h-4 border-l' />

      <Tooltip>
        <TooltipTrigger as='div' class='rounded-full'>
          <LanguageToggle class='size-8 rounded-full text-muted-foreground hover:bg-accent/80 hover:text-foreground' />
        </TooltipTrigger>
        <TooltipContent>
          {t.graph.utilityControls.language.title()}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger as='div' class='rounded-full'>
          <ThemeModeToggle class='size-8 rounded-full text-muted-foreground hover:bg-accent/80 hover:text-foreground' />
        </TooltipTrigger>
        <TooltipContent>{t.graph.utilityControls.theme.title()}</TooltipContent>
      </Tooltip>
    </div>
  );
}
