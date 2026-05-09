import { Show, type Accessor } from 'solid-js';
import { PlayIcon, RotateCcwIcon, SquareIcon, Trash2Icon } from 'lucide-solid';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { getProcessStatusBadge } from '@/components/session-item';
import { type SessionConfig } from '@/types/font';

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

interface SessionHistoryItemProps {
  entry: {
    key: string;
    session: SessionConfig;
    updatedAt: string;
  };
  isCurrentSession: boolean;
  isRunning: Accessor<boolean>;
  isRestoring: boolean;
  progress: Accessor<number>;
  onDeleteClick: () => void;
  onContinueProcessing: () => void;
  onSelectSession: () => void;
  onStopRun: () => void;
}

export function SessionHistoryItem(props: SessionHistoryItemProps) {
  const session = () => props.entry.session;
  const badge = () => {
    return getProcessStatusBadge(session().process_status);
  };
  const isRunning = () => props.isRunning();
  const isComplete = () => session()?.process_status === 'positioned';
  const canRestore = () =>
    isComplete() && !isRunning() && !!session()?.session_id;
  const canContinueProcessing = () =>
    !!session() && !isComplete() && !isRunning();
  const title = () => session().preview_text || 'font';
  const details = () => {
    const currentSession = session();
    return `${currentSession.weights.length} weights · ${
      currentSession.samples_amount
    } samples · ${currentSession.clusters_amount} clusters`;
  };
  const progressPercent = () => props.progress() * 100;
  const roundedProgressPercent = () => Math.round(progressPercent());

  return (
    <article class='space-y-2 rounded-sm p-3 text-xs transition-colors hover:bg-muted/60'>
      <div class='flex items-start justify-between gap-2'>
        <div class='min-w-0 space-y-1'>
          <div class='flex min-w-0 items-center gap-2'>
            <Badge variant={badge().variant} class='shrink-0 px-1.5 py-0' round>
              {badge().text}
            </Badge>
            <Show when={isRunning()}>
              <span class='shrink-0 rounded bg-muted px-1.5 py-0.5 uppercase text-muted-foreground'>
                running
              </span>
            </Show>
            <time class='truncate text-muted-foreground'>
              {formatDateTime(props.entry.updatedAt)}
            </time>
          </div>
          <p class='truncate text-sm font-medium leading-5'>{title()}</p>
          <p class='truncate text-muted-foreground'>{details()}</p>
        </div>
        <div class='flex shrink-0 items-center'>
          <Show
            when={!isComplete()}
            fallback={
              <Tooltip>
                <TooltipTrigger
                  as={Button<'button'>}
                  size='icon'
                  variant='ghost'
                  class='size-7 rounded-full'
                  disabled={
                    props.isCurrentSession || props.isRestoring || !canRestore()
                  }
                  onClick={props.onSelectSession}
                >
                  <RotateCcwIcon class='size-3.5' />
                </TooltipTrigger>
                <TooltipContent>Restore session</TooltipContent>
              </Tooltip>
            }
          >
            <Tooltip>
              <TooltipTrigger
                as={Button<'button'>}
                size='icon'
                variant='ghost'
                class='size-7 rounded-full'
                disabled={!canContinueProcessing()}
                onClick={props.onContinueProcessing}
              >
                <PlayIcon class='size-3.5' />
              </TooltipTrigger>
              <TooltipContent>
                {isRunning() ? 'Session is running' : 'Continue processing'}
              </TooltipContent>
            </Tooltip>
          </Show>
          <Tooltip>
            <TooltipTrigger
              as={Button<'button'>}
              size='icon'
              variant='ghost'
              class='size-7 rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive'
              disabled={isRunning()}
              onClick={props.onDeleteClick}
            >
              <Trash2Icon class='size-3.5' />
            </TooltipTrigger>
            <TooltipContent>Delete session</TooltipContent>
          </Tooltip>
          <Show when={isRunning()}>
            <Tooltip>
              <TooltipTrigger
                as={Button<'button'>}
                size='icon'
                variant='ghost'
                class='size-7 rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive'
                onClick={props.onStopRun}
              >
                <SquareIcon class='size-3' />
              </TooltipTrigger>
              <TooltipContent>Stop run</TooltipContent>
            </Tooltip>
          </Show>
        </div>
      </div>
      <Show when={isRunning()}>
        <div class='space-y-1'>
          <div class='h-1 w-full overflow-hidden rounded-full bg-muted'>
            <div
              class='h-full bg-primary transition-all'
              style={{ width: `${progressPercent()}%` }}
            />
          </div>
          <div class='flex justify-between gap-2 text-muted-foreground'>
            <p class='truncate'>Processing</p>
            <p class='shrink-0 tabular-nums'>{roundedProgressPercent()}%</p>
          </div>
        </div>
      </Show>
    </article>
  );
}
