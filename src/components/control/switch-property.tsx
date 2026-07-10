import type { ComponentProps } from 'solid-js';
import { splitProps } from 'solid-js';

import { cn } from '@/lib/utils';
import {
  Switch,
  SwitchControl,
  SwitchLabel,
  SwitchThumb,
} from '@/components/ui/switch';

// Everything the underlying Switch takes (`checked`, `onChange`, `disabled`,
// `name`, ...) passes straight through; `children` is omitted because this row
// owns its own (the label and the control), and `label` is the only addition.
type SwitchPropertyProps = Omit<ComponentProps<typeof Switch>, 'children'> & {
  label: string;
};

/**
 * A single labelled on/off row, styled and laid out to line up with
 * {@link import('./number-property').NumberProperty}: the label sits at the
 * left gutter and the control hugs the right edge inside the same `h-8` row.
 *
 * A thin pass-through over {@link Switch}; control it the same way (`checked`/
 * `onChange`) so its state can drive sibling inputs. `SwitchLabel` keeps the
 * label associated with the control for a11y.
 */
export function SwitchProperty(props: SwitchPropertyProps) {
  const [local, rest] = splitProps(props, ['label', 'class']);

  return (
    <Switch
      {...rest}
      class={cn('relative flex h-8 items-center pr-1.5', local.class)}
    >
      <SwitchLabel class='absolute inset-0 flex items-center pl-2 text-xs font-medium capitalize text-muted-foreground'>
        {local.label}
      </SwitchLabel>
      <SwitchControl class='ml-auto'>
        <SwitchThumb />
      </SwitchControl>
    </Switch>
  );
}
