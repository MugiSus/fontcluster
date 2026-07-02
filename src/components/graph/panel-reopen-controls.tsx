import { Show } from 'solid-js';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { CollapsiblePanelKey, PanelState } from '@/types/panels';

interface GraphPanelReopenControlsProps {
  panelState: PanelState;
  onReopenPanel: (panel: CollapsiblePanelKey) => void;
  isLeftInset?: boolean | undefined;
}

export function GraphPanelReopenControls(props: GraphPanelReopenControlsProps) {
  const { t } = useI18n();
  return (
    <Show when={!props.panelState.control || !props.panelState.list}>
      <div
        class={cn(
          'pointer-events-auto absolute left-[3px] top-[3px] z-10 flex items-center gap-0 rounded-full border border-border/25 bg-background/50 shadow-inner-background backdrop-blur-md',
          props.isLeftInset && 'pl-[74px]',
        )}
        data-tauri-drag-region
      >
        <Show when={!props.panelState.control}>
          <Tooltip>
            <TooltipTrigger as='div' class='rounded-full'>
              <Button
                variant='ghost'
                size='sm'
                class='h-8 rounded-full px-3 text-xs capitalize text-muted-foreground hover:bg-accent/80 hover:text-foreground'
                onClick={() => props.onReopenPanel('control')}
                aria-label={t.panels.open({ title: t.panels.control() })}
              >
                {t.panels.control()}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {t.panels.open({ title: t.panels.control() })}
            </TooltipContent>
          </Tooltip>
        </Show>
        <Show when={!props.panelState.list}>
          <Tooltip>
            <TooltipTrigger as='div' class='rounded-full'>
              <Button
                variant='ghost'
                size='sm'
                class='h-8 rounded-full px-3 text-xs capitalize text-muted-foreground hover:bg-accent/80 hover:text-foreground'
                onClick={() => props.onReopenPanel('list')}
                aria-label={t.panels.open({ title: t.panels.list() })}
              >
                {t.panels.list()}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {t.panels.open({ title: t.panels.list() })}
            </TooltipContent>
          </Tooltip>
        </Show>
        {/* Chat panel temporarily hidden until the feature is ready */}
      </div>
    </Show>
  );
}
