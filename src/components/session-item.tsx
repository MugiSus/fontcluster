import { For } from 'solid-js';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ArchiveRestoreIcon, Trash2Icon } from 'lucide-solid';
import { FontWeight, type SessionConfig } from '../types/font';

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

export type CompletionBadge = {
  text: 'Complete' | 'Compressed' | 'Vectorized' | 'Rasterized' | 'Empty';
  variant: 'default' | 'outline' | 'error';
};

interface SessionItemProps {
  session: SessionConfig;
  badge: CompletionBadge;
  clusterCount: number;
  isCurrentSession: boolean;
  isConfirmingDelete: boolean;
  isDeletingSession: boolean;
  isRestoring: boolean;
  onDeleteClick: () => void;
  onSelectSession: () => void;
}

export function SessionItem(props: SessionItemProps) {
  return (
    <div class='border-b p-4 transition-colors hover:bg-muted/50'>
      <div class='flex items-center justify-between gap-4'>
        <div class='flex flex-col gap-1'>
          <div class='mb-1.5 flex items-center gap-2'>
            <Badge variant={props.badge.variant} class='py-0' round>
              {props.badge.text}
            </Badge>
            <time class='text-xs tabular-nums text-muted-foreground'>
              {new Date(props.session.date).toLocaleString('ja-JP', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </time>
            <WeightIndicators weights={props.session.weights} />
            <ClusterIndicators count={props.clusterCount} />
            <div class='text-xs text-muted-foreground'>
              {props.session.samples_amount}
            </div>
          </div>
          <p class='truncate font-medium leading-none'>
            {props.session.preview_text}
          </p>
        </div>
        <SessionActions
          isCurrentSession={props.isCurrentSession}
          isConfirmingDelete={props.isConfirmingDelete}
          isDeletingSession={props.isDeletingSession}
          isRestoring={props.isRestoring}
          onDeleteClick={props.onDeleteClick}
          onSelectSession={props.onSelectSession}
        />
      </div>
    </div>
  );
}

function ClusterIndicators(props: { count: number }) {
  return (
    <div class='flex gap-1.5'>
      <For each={Array.from({ length: props.count }, (_, i) => i)}>
        {(i) => <div class={`size-2 rounded-full ${CLUSTER_COLORS[i]}`} />}
      </For>
    </div>
  );
}

function WeightIndicators(props: { weights: number[] }) {
  const weightLabels: Record<FontWeight, string> = {
    100: 'UL',
    200: 'EL',
    300: 'L',
    400: 'R',
    500: 'M',
    600: 'DB',
    700: 'B',
    800: 'EB',
    900: 'UB',
  };

  return (
    <div class='flex gap-1 text-xs'>
      <For each={[100, 200, 300, 400, 500, 600, 700, 800, 900] as FontWeight[]}>
        {(weight) => {
          const isSelectable = () => props.weights.includes(weight);

          return (
            <div class={isSelectable() ? 'text-foreground' : 'text-muted'}>
              {weightLabels[weight]}
            </div>
          );
        }}
      </For>
    </div>
  );
}

function SessionActions(props: {
  isCurrentSession: boolean;
  isConfirmingDelete: boolean;
  isDeletingSession: boolean;
  isRestoring: boolean;
  onDeleteClick: () => void;
  onSelectSession: () => void;
}) {
  return (
    <div class='flex gap-1'>
      <Button
        class='text-destructive hover:bg-destructive/10 hover:text-destructive'
        size={props.isConfirmingDelete ? 'default' : 'icon'}
        variant='ghost'
        onClick={props.onDeleteClick}
        disabled={props.isDeletingSession}
      >
        {props.isConfirmingDelete ? 'Delete?' : <Trash2Icon class='size-4' />}
      </Button>
      <Button
        size='icon'
        onClick={props.onSelectSession}
        disabled={props.isCurrentSession || props.isRestoring}
        variant='outline'
      >
        <ArchiveRestoreIcon class='size-4' />
      </Button>
    </div>
  );
}
