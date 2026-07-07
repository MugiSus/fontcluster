import { createSignal, Show } from 'solid-js';
import { HistoryIcon, PauseIcon, PlayIcon, Trash2Icon } from 'lucide-solid';
import { Button } from '@/components/ui/button';
import { TextField, TextFieldInput } from '@/components/ui/text-field';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  type SessionConfig,
  type SessionProgressSection,
} from '@/types/session';
import { useI18n } from '@/i18n';

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
  onRename: (newTitle: string) => void;
}

export function SessionHistoryItem(props: SessionHistoryItemProps) {
  const { t } = useI18n();
  const session = () => props.session;
  const isRunning = () => props.isRunning;

  const isComplete = () => session()?.status.process_status === 'clustered';

  const sampleText = () => session().algorithm.rendering.text || 'A';

  // Ephemeral edit state only; the title itself lives in the session config.
  const [isEditingTitle, setIsEditingTitle] = createSignal(false);
  let titleInput: HTMLInputElement | undefined;

  const startTitleEdit = () => {
    // The worker process rewrites config.json while a job runs; renaming
    // concurrently could clobber its updates, so editing waits until it stops.
    if (isRunning()) return;
    setIsEditingTitle(true);
    titleInput?.focus();
    titleInput?.select();
  };

  const commitTitleEdit = () => {
    if (!isEditingTitle()) return;
    const newTitle = titleInput?.value.trim() ?? '';
    setIsEditingTitle(false);
    if (newTitle !== session().title) props.onRename(newTitle);
  };

  const canRestore = () =>
    isComplete() && !isRunning() && !!session()?.session_id;

  const sectionRatio = (section: SessionProgressSection) => {
    if (section.denominator <= 0) return 0;
    return Math.min(1, Math.max(0, section.numerator / section.denominator));
  };

  const progressValue = () => {
    const progress = session().status.progress;

    const weightedProgress =
      sectionRatio(progress.rendering) * 0.2 +
      sectionRatio(progress.analysis) * 0.6 +
      sectionRatio(progress.clustering) * 0.2;

    return Math.min(1, Math.max(0, weightedProgress));
  };

  return (
    <article class='relative rounded-sm p-2 text-xs transition-colors hover:bg-muted/60'>
      <div class='flex items-start justify-between gap-2'>
        <div class='flex min-w-0 flex-1 flex-col gap-1'>
          <div class='flex min-w-0 items-center gap-2'>
            <Show when={!isComplete()}>
              <span class='font-bold capitalize text-muted-foreground'>
                {isRunning()
                  ? session().status.process_status === 'empty'
                    ? t.graph.utilityControls.sessionHistory.statusRendering()
                    : session().status.process_status === 'rendered'
                      ? t.graph.utilityControls.sessionHistory.statusAnalyzing()
                      : t.graph.utilityControls.sessionHistory.statusClustering()
                  : t.graph.utilityControls.sessionHistory.statusStopped()}
              </span>
            </Show>
            <time class='truncate text-muted-foreground'>
              {new Date(session().modified_at).toLocaleString('ja-JP', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </time>
          </div>
          <Show
            when={isEditingTitle()}
            fallback={
              <p
                class={cn(
                  'truncate text-sm font-medium leading-5',
                  !isRunning() && 'cursor-text',
                )}
                title={
                  isRunning()
                    ? undefined
                    : t.graph.utilityControls.sessionHistory.renameTitle()
                }
                onClick={startTitleEdit}
              >
                {session().title || sampleText()}
              </p>
            }
          >
            <TextField>
              <TextFieldInput
                ref={titleInput}
                type='text'
                class='h-5 rounded-none px-0 text-left font-medium leading-5 placeholder:font-normal hover:bg-transparent focus:bg-transparent'
                value={session().title}
                placeholder={sampleText()}
                aria-label={t.graph.utilityControls.sessionHistory.renameTitle()}
                onBlur={commitTitleEdit}
                onKeyDown={(event: KeyboardEvent) => {
                  // Keep typing from triggering the dropdown menu's own
                  // keyboard navigation/typeahead.
                  event.stopPropagation();
                  if (event.key === 'Enter') commitTitleEdit();
                  if (event.key === 'Escape') setIsEditingTitle(false);
                }}
              />
            </TextField>
          </Show>
          <Show when={isComplete()}>
            <p class='truncate text-muted-foreground'>
              {t.graph.utilityControls.sessionHistory.summary({
                weights: session().algorithm.rendering.weights.length,
                samples: session().status.samples_amount,
                clusters: session().status.clusters_amount,
              })}
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
                class='size-7 rounded-full'
                onClick={props.onStopRun}
              >
                <PauseIcon class='size-3' />
              </TooltipTrigger>
              <TooltipContent>
                {t.graph.utilityControls.sessionHistory.stop()}
              </TooltipContent>
            </Tooltip>
          </Show>

          <Show when={isComplete()}>
            <Tooltip>
              <TooltipTrigger
                as={Button<'button'>}
                size='icon'
                variant='ghost'
                class='size-7 rounded-full'
                disabled={props.isRestoring || !canRestore()}
                onClick={props.onSelectSession}
              >
                <HistoryIcon class='size-3.5' />
              </TooltipTrigger>
              <TooltipContent>
                {t.graph.utilityControls.sessionHistory.restore()}
              </TooltipContent>
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
              <TooltipContent>
                {t.graph.utilityControls.sessionHistory.continueProcessing()}
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
            <TooltipContent>
              {t.graph.utilityControls.sessionHistory.delete()}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
      <Show when={!isComplete()}>
        <div class='flex flex-col gap-1.5 pt-2'>
          <div
            class='h-1 w-full animate-pulse overflow-hidden rounded-full bg-primary/25'
            style={{ 'animation-duration': '2000ms' }}
          >
            <div
              class='h-full rounded-full bg-primary transition-[width] duration-500'
              style={{ width: `${progressValue() * 100}%` }}
            />
          </div>
          <div class='flex justify-between gap-2 text-muted-foreground'>
            <p class='truncate'>
              {isRunning()
                ? t.graph.utilityControls.sessionHistory.processing()
                : t.graph.utilityControls.sessionHistory.progress()}
            </p>
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
