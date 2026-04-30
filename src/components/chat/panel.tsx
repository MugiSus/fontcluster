import { AppShellPanel } from '../app-shell-panel';

import { ChatContent } from './content';

interface ChatPanelProps {
  isLeftInset?: boolean | undefined;
  onClose: () => void;
}

export function ChatPanel(props: ChatPanelProps) {
  return (
    <AppShellPanel
      title='chat'
      class='w-[300px] shrink-0'
      isLeftInset={props.isLeftInset}
      onClose={props.onClose}
    >
      <ChatContent />
    </AppShellPanel>
  );
}
