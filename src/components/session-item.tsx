import { Index, Show } from 'solid-js';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { HistoryIcon, Trash2Icon, TypeIcon, WeightIcon } from 'lucide-solid';
import {
  FontWeight,
  type SessionConfig,
  type ProcessStatus,
  WEIGHT_LABELS,
} from '../types/font';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

// Constants (local to SessionItem rendering)
const CLUSTER_COLORS = [
  'bg-blue-400',
  'bg-red-400',
  'bg-yellow-400',
  'bg-green-400',
  'bg-purple-400',
  'bg-orange-400',
  'bg-teal-400',
  'bg-indigo-400',
  'bg-cyan-400',
  'bg-fuchsia-400',
] as const;

export type ProcessStatusBadge = {
  text: 'Complete' | 'Compressed' | 'Generated' | 'Discovered' | 'Empty';
  variant: 'default' | 'outline' | 'error';
};

export const getProcessStatusBadge = (
  status: ProcessStatus,
): ProcessStatusBadge => {
  switch (status) {
    case 'clustered':
      return { text: 'Complete', variant: 'default' };
    case 'compressed':
      return { text: 'Compressed', variant: 'outline' };
    case 'generated':
      return { text: 'Generated', variant: 'outline' };
    case 'discovered':
      return { text: 'Discovered', variant: 'outline' };
    default:
      return { text: 'Empty', variant: 'error' };
  }
};

interface SessionItemProps {
  session: SessionConfig;
  clusterCount: number;
  isCurrentSession: boolean;
  isRestoring: boolean;
  onDeleteClick: () => void;
  onSelectSession: () => void;
}

export function SessionItem(props: SessionItemProps) {
  const badge = () => getProcessStatusBadge(props.session.process_status);

  return (
    <div class='flex items-center justify-between gap-4 p-4 transition-colors hover:bg-muted'>
      <div class='flex flex-col gap-3'>
        <div class='flex items-center gap-2'>
          <Badge variant={badge().variant} class='px-2 py-0.5' round>
            {badge().text}
          </Badge>
          <time class='ml-1 text-xs tabular-nums text-muted-foreground'>
            {new Date(props.session.date).toLocaleString('ja-JP', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            })}
          </time>
          <WeightIcon class='ml-1 size-3 text-muted-foreground' />
          <WeightIndicators weights={props.session.weights} />
          <TypeIcon class='ml-1 size-3 text-muted-foreground' />
          <div class='text-xs text-muted-foreground'>
            {props.session.samples_amount}
          </div>
          <ClusterIndicators count={props.clusterCount} />
        </div>
        <p class='truncate text-xl font-medium leading-none'>
          {props.session.preview_text}
        </p>
      </div>
      <SessionActions
        isCurrentSession={props.isCurrentSession}
        isRestoring={props.isRestoring}
        onDeleteClick={props.onDeleteClick}
        onSelectSession={props.onSelectSession}
      />
    </div>
  );
}

function ClusterIndicators(props: { count: number }) {
  return (
    <div class='ml-1 flex gap-1.5'>
      <Index each={Array(Math.min(props.count, CLUSTER_COLORS.length))}>
        {(_, i) => <div class={`size-2 rounded-full ${CLUSTER_COLORS[i]}`} />}
      </Index>
      <Show when={props.count > CLUSTER_COLORS.length}>
        <div class='flex items-center gap-0.5'>
          <div class='size-0.5 rounded-full bg-muted-foreground' />
          <div class='size-0.5 rounded-full bg-muted-foreground' />
          <div class='size-0.5 rounded-full bg-muted-foreground' />
        </div>
      </Show>
    </div>
  );
}

function WeightIndicators(props: { weights: number[] }) {
  return (
    <div class='flex gap-1 text-xs'>
      <Index each={[100, 200, 300, 400, 500, 600, 700, 800, 900]}>
        {(weight) => (
          <div
            class={
              props.weights.includes(weight())
                ? 'text-muted-foreground'
                : 'text-muted'
            }
          >
            {WEIGHT_LABELS[weight() as FontWeight].short}
          </div>
        )}
      </Index>
    </div>
  );
}

function SessionActions(props: {
  isCurrentSession: boolean;
  isRestoring: boolean;
  onDeleteClick: () => void;
  onSelectSession: () => void;
}) {
  return (
    <div class='flex'>
      <Tooltip>
        <TooltipTrigger
          as={Button<'button'>}
          size='icon'
          onClick={props.onSelectSession}
          disabled={props.isCurrentSession || props.isRestoring}
          variant='ghost'
        >
          <HistoryIcon class='size-4' />
        </TooltipTrigger>
        <TooltipContent>Restore session</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          as={Button<'button'>}
          class='text-destructive hover:bg-destructive/10 hover:text-destructive'
          size='icon'
          variant='ghost'
          onClick={props.onDeleteClick}
        >
          <Trash2Icon class='size-4' />
        </TooltipTrigger>
        <TooltipContent>Delete session</TooltipContent>
      </Tooltip>
    </div>
  );
}
