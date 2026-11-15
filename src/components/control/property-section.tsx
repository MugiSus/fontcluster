import { Show, type JSX } from 'solid-js';

import {
  Switch,
  SwitchControl,
  SwitchLabel,
  SwitchThumb,
} from '@/components/ui/switch';

type ControlPropertySectionProps = {
  title: string;
  isEnabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  executionStep: number | undefined;
  isLast?: boolean;
  children?: JSX.Element;
};

export function ControlPropertySection(props: ControlPropertySectionProps) {
  return (
    <div class='relative flex flex-col py-2 pl-6'>
      <Show when={!props.isLast}>
        <div
          aria-hidden='true'
          class='absolute bottom-[-14px] left-[5px] top-[34px] w-0.5'
          classList={{
            'bg-foreground': props.executionStep !== undefined,
            'bg-muted': props.executionStep === undefined,
          }}
        />
      </Show>
      <div
        class='absolute -left-1 top-3.5 flex size-5 items-center justify-center rounded-full border-2 text-[11px] font-semibold tabular-nums leading-none'
        classList={{
          'border-foreground text-foreground':
            props.executionStep !== undefined,
          'border-muted text-muted-foreground':
            props.executionStep === undefined,
        }}
      >
        {props.executionStep}
      </div>
      <Switch
        checked={props.isEnabled}
        onChange={props.onEnabledChange}
        class='flex h-8 items-center justify-between gap-2'
      >
        <SwitchLabel class='text-xs font-semibold capitalize'>
          {props.title}
        </SwitchLabel>
        <SwitchControl>
          <SwitchThumb />
        </SwitchControl>
      </Switch>
      <div class='flex flex-col gap-0.5'>{props.children}</div>
    </div>
  );
}
