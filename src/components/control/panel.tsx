import { AppShellPanel } from '../app-shell-panel';

import { ControlContent } from './content';
import { JobHistory } from './job-history';

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
      actions={<JobHistory />}
    >
      <ControlContent />
    </AppShellPanel>
  );
}
