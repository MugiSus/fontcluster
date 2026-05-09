import { Show } from 'solid-js';
import { PlayIcon, RotateCcwIcon, SquareIcon, Trash2Icon } from 'lucide-solid';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { getProcessStatusBadge } from '@/components/session-item';
import { cn } from '@/lib/utils';
import { stopJobs } from '@/actions';
import { type JobRun } from '@/store';
import { type SessionConfig } from '@/types/font';

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

export interface SessionHistoryEntry {
  key: string;
  session: SessionConfig | null;
  job: JobRun | null;
  updatedAt: string;
}

interface SessionHistoryItemProps {
  entry: SessionHistoryEntry;
  isCurrentSession: boolean;
  isRestoring: boolean;
  onDeleteClick: () => void;
  onContinueProcessing: () => void;
  onSelectSession: () => void;
}

export function SessionHistoryItem(props: SessionHistoryItemProps) {
  const session = () => props.entry.session;
  const job = () => props.entry.job;
  const badge = () => {
    const currentSession = session();
    return currentSession
      ? getProcessStatusBadge(currentSession.process_status)
      : { text: 'Running', variant: 'outline' as const };
  };
  const isRunning = () => job()?.state === 'running';
  const isComplete = () => session()?.process_status === 'positioned';
  const canRestore = () =>
    isComplete() && !isRunning() && !!session()?.session_id;
  const canContinueProcessing = () =>
    !!session() && !isComplete() && !isRunning();
  const title = () => session()?.preview_text ?? job()?.title ?? 'Processing';
  const details = () => {
    const currentSession = session();
    if (!currentSession) return 'Pending session';

    return `${currentSession.weights.length} weights · ${
      currentSession.samples_amount
    } samples · ${currentSession.clusters_amount} clusters`;
  };
  const progressClass = () => {
    switch (job()?.state) {
      case 'failed':
        return 'bg-destructive';
      case 'cancelled':
        return 'bg-muted-foreground';
      default:
        return 'bg-primary';
    }
  };

  return (
    <article class='space-y-2 rounded-sm p-3 text-xs transition-colors hover:bg-muted/60'>
      <div class='flex items-start justify-between gap-2'>
        <div class='min-w-0 space-y-1'>
          <div class='flex min-w-0 items-center gap-2'>
            <Badge variant={badge().variant} class='shrink-0 px-1.5 py-0' round>
              {badge().text}
            </Badge>
            <Show when={job()}>
              {(currentJob) => (
                <span class='shrink-0 rounded bg-muted px-1.5 py-0.5 uppercase text-muted-foreground'>
                  {currentJob().state}
                </span>
              )}
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
            when={!isComplete() && session()}
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
              disabled={!session()}
              onClick={props.onDeleteClick}
            >
              <Trash2Icon class='size-3.5' />
            </TooltipTrigger>
            <TooltipContent>Delete session</TooltipContent>
          </Tooltip>
          <Show when={job()?.canStop}>
            <Tooltip>
              <TooltipTrigger
                as={Button<'button'>}
                size='icon'
                variant='ghost'
                class='size-7 rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive'
                onClick={() => stopJobs()}
              >
                <SquareIcon class='size-3' />
              </TooltipTrigger>
              <TooltipContent>Stop run</TooltipContent>
            </Tooltip>
          </Show>
        </div>
      </div>
      <Show when={job()}>
        {(currentJob) => (
          <div class='space-y-1'>
            <div class='h-1 w-full overflow-hidden rounded-full bg-muted'>
              <div
                class={cn('h-full transition-all', progressClass())}
                style={{ width: `${currentJob().progress}%` }}
              />
            </div>
            <div class='flex justify-between gap-2 text-muted-foreground'>
              <p class='truncate'>{currentJob().title}</p>
              <p class='shrink-0 tabular-nums'>{currentJob().progress}%</p>
            </div>
          </div>
        )}
      </Show>
    </article>
  );
}
