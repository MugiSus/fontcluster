import type { ParentProps } from 'solid-js';

import { SelectLabel, SelectTrigger } from '@/components/ui/select';

type SelectPropertyProps = ParentProps<{
  label: string;
  isChanged?: boolean;
}>;

/**
 * The visible row for a control-panel select.
 *
 * Keeping the label inside the trigger makes the full row interactive while
 * leaving selection and open-state ownership with the surrounding Select.
 */
export function SelectProperty(props: SelectPropertyProps) {
  return (
    <SelectTrigger class='relative h-8 border-0 bg-transparent px-0.5 shadow-none hover:bg-muted/50 focus:ring-0 focus:ring-offset-0'>
      <SelectLabel
        class='absolute inset-y-0 left-2 flex items-center text-xs font-medium capitalize text-muted-foreground'
        classList={{ 'text-primary': props.isChanged }}
      >
        {props.label}
      </SelectLabel>
      {props.children}
    </SelectTrigger>
  );
}
