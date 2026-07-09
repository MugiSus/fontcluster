import {
  Switch,
  SwitchControl,
  SwitchLabel,
  SwitchThumb,
} from '@/components/ui/switch';

type SwitchPropertyProps = {
  label: string;
  name?: string;
  isChecked?: boolean;
  isDisabled?: boolean;
  onChange: (checked: boolean) => void;
};

/**
 * A single labelled on/off row, styled and laid out to line up with
 * {@link import('./number-property').NumberProperty}: the label sits at the
 * left gutter and the control hugs the right edge inside the same `h-8` row.
 *
 * Controlled by the caller (`checked`/`onChange`) so its state can drive sibling
 * inputs; `SwitchLabel` keeps the label associated with the control for a11y.
 */
export function SwitchProperty(props: SwitchPropertyProps) {
  return (
    <Switch
      name={props.name}
      checked={props.isChecked}
      disabled={props.isDisabled}
      onChange={props.onChange}
      class='relative flex h-8 items-center pr-1.5'
    >
      <SwitchLabel class='absolute inset-y-0 left-2 flex items-center text-xs font-medium capitalize text-muted-foreground'>
        {props.label}
      </SwitchLabel>
      <SwitchControl class='ml-auto'>
        <SwitchThumb />
      </SwitchControl>
    </Switch>
  );
}
