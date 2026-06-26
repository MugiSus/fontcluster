import { useI18n } from '@/i18n';
import { AppShellPanel } from '../app-shell-panel';

import { ControlContent } from './content';

interface ControlPanelProps {
  isLeftInset?: boolean | undefined;
  onClose: () => void;
}

export function ControlPanel(props: ControlPanelProps) {
  const { t } = useI18n();
  return (
    <AppShellPanel
      title={t.panels.control()}
      class='w-[300px] shrink-0'
      isLeftInset={props.isLeftInset}
      onClose={props.onClose}
    >
      <ControlContent />
    </AppShellPanel>
  );
}
