import { Show } from 'solid-js';
import { PlayIcon, RotateCcwIcon, SquareIcon, Trash2Icon } from 'lucide-solid';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { type SessionConfig, type SessionProgressSection } from '@/types/font';

export const getProcessStatusBadge = (status: string) => {
  switch (status) {
    case 'positioned':
      return { text: 'Complete', variant: 'default' } as const;
    case 'clustered':
      return { text: 'Clustered', variant: 'outline' } as const;
    case 'vectorized':
      return { text: 'Vectorized', variant: 'outline' } as const;
    case 'generated':
      return { text: 'Generated', variant: 'outline' } as const;
    case 'discovered':
      return { text: 'Discovered', variant: 'outline' } as const;
    case 'downloaded':
      return { text: 'Downloaded', variant: 'outline' } as const;
    default:
      return { text: 'Empty', variant: 'error' } as const;
  }
};

interface SessionHistoryItemProps {
  session: SessionConfig;
  isCurrentSession: boolean;
  isRunning: boolean;
  isUnread: boolean;
  isRestoring: boolean;
  onDeleteClick: () => void;
  onContinueProcessing: () => void;
  onSelectSession: () => void;
  onStopRun: () => void;
}

export function SessionHistoryItem(props: SessionHistoryItemProps) {
  const session = () => props.session;
  const badge = () => {
    return getProcessStatusBadge(session().status.process_status);
  };
  const isRunning = () => props.isRunning;

  const isComplete = () => session()?.status.process_status === 'positioned';

  const canRestore = () =>
    isComplete() && !isRunning() && !!session()?.session_id;

  const sectionRatio = (section: SessionProgressSection) => {
    if (section.denominator <= 0) return 0;
    return Math.min(1, Math.max(0, section.numerator / section.denominator));
  };

  const progressValue = () => {
    const progress = session().status.progress;
    const weightedProgress =
      sectionRatio(progress.download) * 0.1 +
      sectionRatio(progress.discovery) * 0.1 +
      sectionRatio(progress.generation) * 0.15 +
      sectionRatio(progress.vectorization) * 0.6 +
      sectionRatio(progress.clustering) * 0.025 +
      sectionRatio(progress.position) * 0.025;

    return Math.min(1, Math.max(0, weightedProgress / 1));
  };

  return (
    <article class='relative rounded-sm p-3 text-xs transition-colors hover:bg-muted/60'>
      <div class='flex items-start justify-between gap-2'>
        <div class='min-w-0 space-y-1'>
          <div class='flex min-w-0 items-center gap-2'>
            <Badge variant={badge().variant} class='shrink-0 px-1.5 py-0' round>
              {badge().text}
            </Badge>
            <time class='truncate text-muted-foreground'>
              {new Date(session().modified_at).toLocaleString('ja-JP', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </time>
          </div>
          <p class='truncate text-sm font-medium leading-5'>
            {session().preview_text || 'A'}
          </p>
          <Show when={isComplete()}>
            <p class='truncate text-muted-foreground'>
              {session().weights.length} weights {' · '}
              {session().status.samples_amount} samples {' · '}
              {session().status.clusters_amount} clusters
            </p>
          </Show>
        </div>
        <div class='flex shrink-0 items-center'>
          <Show when={isRunning() && !isComplete()}>
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

          <Show when={isComplete()}>
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
          </Show>

          <Show when={!isComplete() && !isRunning()}>
            <Tooltip>
              <TooltipTrigger
                as={Button<'button'>}
                size='icon'
                variant='ghost'
                class='size-7 rounded-full'
                onClick={props.onContinueProcessing}
              >
                <PlayIcon class='size-3.5' />
              </TooltipTrigger>
              <TooltipContent>Continue processing</TooltipContent>
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
        </div>
      </div>
      <Show when={!isComplete()}>
        <div class='space-y-1'>
          <div class='h-1 w-full overflow-hidden rounded-full bg-muted'>
            <div
              class='h-full rounded-full bg-primary transition-[width] duration-500'
              style={{ width: `${progressValue() * 100}%` }}
            />
          </div>
          <div class='flex justify-between gap-2 text-muted-foreground'>
            <p class='truncate'>{isRunning() ? 'Processing' : 'Progress'}</p>
            <p class='shrink-0 tabular-nums'>
              {Math.round(progressValue() * 100)}%
            </p>
          </div>
        </div>
      </Show>
      <Show when={isRunning()}>
        <span class='pointer-events-none absolute right-2 top-2 size-1.5 rounded-full bg-amber-500 after:absolute after:inset-0 after:animate-ping after:rounded-full after:bg-amber-500 after:content-[""]' />
      </Show>
      <Show when={!isRunning() && props.isUnread}>
        <span class='pointer-events-none absolute right-2 top-2 size-1.5 rounded-full bg-blue-500' />
      </Show>
    </article>
  );
}
