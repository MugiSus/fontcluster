import { ListContent } from './content';
import { PluginConnectionsMenu } from './plugin-connections-menu';
import { AppShellPanel } from '../app-shell-panel';

interface ListPanelProps {
  onClose: () => void;
  isLeftInset?: boolean | undefined;
}

export function ListPanel(props: ListPanelProps) {
  return (
    <AppShellPanel
      title='list'
      class='w-[300px] shrink-0'
      isLeftInset={props.isLeftInset}
      actions={<PluginConnectionsMenu />}
      onClose={props.onClose}
    >
      <ListContent />
    </AppShellPanel>
  );
}
