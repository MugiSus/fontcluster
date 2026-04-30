import { AppShellPanel } from '../app-shell-panel';

import { ControlContent } from './content';

interface ControlPanelProps {
  isLeftInset?: boolean | undefined;
  onClose: () => void;
}

export function ControlPanel(props: ControlPanelProps) {
  return (
    <AppShellPanel
      title='control'
      class='w-[300px] shrink-0'
      isLeftInset={props.isLeftInset}
      onClose={props.onClose}
    >
      <ControlContent />
    </AppShellPanel>
  );
}
