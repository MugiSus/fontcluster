import {
  CircleMinusIcon,
  LassoSelectIcon,
  MousePointer2Icon,
  SearchIcon,
} from 'lucide-solid';
import { appState } from '../../store';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { type GraphToolMode } from './types';

interface GraphBottomToolbarProps {
  toolMode: GraphToolMode;
  onToolModeChange: (mode: GraphToolMode) => void;
  onToggleSearch: () => void;
}

export function GraphBottomToolbar(props: GraphBottomToolbarProps) {
  return (
    <div class='flex items-center gap-1 rounded-lg border bg-background p-1'>
      <Tooltip placement='top'>
        <TooltipTrigger
          as={Button<'button'>}
          variant={props.toolMode === 'select' ? 'default' : 'ghost'}
          size='icon'
          class='size-8 rounded-md shadow-none'
          aria-pressed={props.toolMode === 'select'}
          aria-label='Select'
          onClick={() => props.onToolModeChange('select')}
        >
          <MousePointer2Icon class='size-4' />
        </TooltipTrigger>
        <TooltipContent>Select</TooltipContent>
      </Tooltip>

      <Tooltip placement='top'>
        <TooltipTrigger
          as={Button<'button'>}
          variant={props.toolMode === 'lasso-select' ? 'default' : 'ghost'}
          size='icon'
          class='size-8 rounded-md shadow-none'
          aria-pressed={props.toolMode === 'lasso-select'}
          aria-label='Lasso'
          onClick={() => props.onToolModeChange('lasso-select')}
        >
          <LassoSelectIcon class='size-4' />
        </TooltipTrigger>
        <TooltipContent>Lasso</TooltipContent>
      </Tooltip>

      <Tooltip placement='top'>
        <TooltipTrigger
          as={Button<'button'>}
          variant={props.toolMode === 'lasso-exclude' ? 'default' : 'ghost'}
          size='icon'
          class='size-8 rounded-md shadow-none'
          aria-pressed={props.toolMode === 'lasso-exclude'}
          aria-label='Exclude'
          onClick={() => props.onToolModeChange('lasso-exclude')}
        >
          <CircleMinusIcon class='size-4' />
        </TooltipTrigger>
        <TooltipContent>Exclude</TooltipContent>
      </Tooltip>

      <div class='h-8 border-l' />

      <Tooltip placement='top'>
        <TooltipTrigger
          as={Button<'button'>}
          variant={appState.ui.searchQuery.length > 0 ? 'default' : 'ghost'}
          size='icon'
          class='size-8 rounded-md shadow-none'
          aria-pressed={appState.ui.searchQuery.length > 0}
          aria-label='Search'
          onClick={() => props.onToggleSearch()}
        >
          <SearchIcon class='size-4' />
        </TooltipTrigger>
        <TooltipContent>Search</TooltipContent>
      </Tooltip>
    </div>
  );
}
