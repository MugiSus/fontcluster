import {
  type Accessor,
  createEffect,
  createMemo,
  onCleanup,
  createSignal,
  Show,
} from 'solid-js';
import { debounce } from '@solid-primitives/scheduled';
import { emit } from '@tauri-apps/api/event';
import { toast } from 'solid-sonner';
import { CopyIcon, Plug2Icon } from 'lucide-solid';
import { useI18n } from '@/i18n';
import { appState } from '@/store';
import { applyFontToPlugins } from '@/actions';
import { type FontItem } from '@/types/font';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { type GraphPointData, type GraphViewBox } from './types';

/** Delay before the actions fade in once the selection settles. */
const REVEAL_DELAY_MS = 200;

/** Gap, in screen pixels, between the selected point and the actions. */
const POINT_OFFSET_PX = 20;

interface SelectedFontActionsProps {
  /** The committed selection key (also reflects the in-flight drag target). */
  selectedKey: Accessor<string | null>;
  /** True while a selection is being resolved; keeps the actions hidden. */
  isSelecting: Accessor<boolean>;
  viewBox: Accessor<GraphViewBox>;
  size: Accessor<{ width: number; height: number }>;
  getPointByKey: (key: string) => GraphPointData | undefined;
}

/**
 * Floating, tooltip-style action pill anchored below the currently selected
 * font point. It projects the point's graph coordinates to the SVG's screen
 * space (mirroring the `xMidYMid meet` fit) so it tracks pans and zooms, and
 * reveals itself only after the selection has settled.
 */
export function SelectedFontActions(props: SelectedFontActionsProps) {
  const { t } = useI18n();

  const projected = createMemo(() => {
    const key = props.selectedKey();
    if (!key) return null;
    const point = props.getPointByKey(key);
    if (!point) return null;

    const viewBox = props.viewBox();
    const { width, height } = props.size();
    if (
      width <= 0 ||
      height <= 0 ||
      viewBox.width <= 0 ||
      viewBox.height <= 0
    ) {
      return null;
    }

    const scale = Math.min(width / viewBox.width, height / viewBox.height);
    return {
      item: point.item,
      x: (width - viewBox.width * scale) / 2 + (point.x - viewBox.x) * scale,
      y: (height - viewBox.height * scale) / 2 + (point.y - viewBox.y) * scale,
    };
  });

  // Hide immediately while selecting; reveal only after the selection has been
  // settled for REVEAL_DELAY_MS so the pill doesn't flicker mid-interaction.
  const [isReady, setIsReady] = createSignal(false);
  const revealAfterDelay = debounce(() => setIsReady(true), REVEAL_DELAY_MS);
  createEffect(() => {
    if (props.selectedKey() !== null && !props.isSelecting()) {
      revealAfterDelay();
    } else {
      revealAfterDelay.clear();
      setIsReady(false);
    }
  });
  onCleanup(() => revealAfterDelay.clear());

  const handleCopy = (event: MouseEvent) => {
    emit('copy_family_name', {
      toast: true,
      isFontName: event.ctrlKey || event.metaKey,
    });
  };

  const handleApply = (item: FontItem) =>
    applyFontToPlugins(item)
      .then(() =>
        toast.success(t.plugins.toasts.applied({ name: item.meta.font_name })),
      )
      .catch((error) => {
        console.error('Failed to send font to plugins:', error);
        toast.error(t.plugins.toasts.applyFailed());
      });

  return (
    <Show when={isReady() && projected()}>
      {(state) => (
        <div
          class='pointer-events-none absolute left-0 top-0 z-20'
          style={{
            transform: `translate(${state().x}px, ${state().y + POINT_OFFSET_PX}px)`,
          }}
        >
          {/* Center horizontally on the point; kept off the animated element so
              the enter keyframes don't override the offset transform. */}
          <div class='-translate-x-1/2'>
            <div
              class='pointer-events-auto flex origin-top items-center justify-center gap-0 rounded-full border border-border/50 bg-background/50 shadow-inner-background backdrop-blur-md animate-in fade-in-0 zoom-in-95 slide-in-from-top-1'
              onMouseDown={(event) => event.stopPropagation()}
              onMouseMove={(event) => event.stopPropagation()}
              onMouseUp={(event) => event.stopPropagation()}
            >
              <Show
                when={appState.plugins.isConnected}
                fallback={
                  <Tooltip>
                    <TooltipTrigger as='div' class='rounded-full'>
                      <Button
                        variant='ghost'
                        size='icon'
                        onClick={handleCopy}
                        class='size-8 rounded-full text-muted-foreground hover:bg-accent/80 hover:text-foreground'
                      >
                        <CopyIcon class='size-4' />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {t.graph.selectedFontActions.copy()}
                    </TooltipContent>
                  </Tooltip>
                }
              >
                <Tooltip>
                  <TooltipTrigger as='div' class='rounded-full'>
                    <Button
                      variant='ghost'
                      size='icon'
                      onClick={() => handleApply(state().item)}
                      class='size-8 rounded-full text-muted-foreground hover:bg-accent/80 hover:text-foreground'
                    >
                      <Plug2Icon class='size-4' />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {t.graph.selectedFontActions.applyToPlugins()}
                  </TooltipContent>
                </Tooltip>
              </Show>
            </div>
          </div>
        </div>
      )}
    </Show>
  );
}
