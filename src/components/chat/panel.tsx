import { useI18n } from '@/i18n';
import { AppShellPanel } from '../app-shell-panel';

import { ChatContent } from './content';

interface ChatPanelProps {
  isLeftInset?: boolean | undefined;
  onClose: () => void;
}

export function ChatPanel(props: ChatPanelProps) {
  const { t } = useI18n();
  return (
    <AppShellPanel
      title={t.panels.chat()}
      class='w-[300px] shrink-0'
      isLeftInset={props.isLeftInset}
      onClose={props.onClose}
    >
      <ChatContent />
    </AppShellPanel>
  );
}
