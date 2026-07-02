import { useI18n } from '@/i18n';
import { ListContent } from './content';
import { AppShellPanel } from '@/components/app-shell-panel';

interface ListPanelProps {
  onClose: () => void;
  isLeftInset?: boolean | undefined;
}

export function ListPanel(props: ListPanelProps) {
  const { t } = useI18n();
  return (
    <AppShellPanel
      title={t.panels.list()}
      class='w-[300px] shrink-0'
      isLeftInset={props.isLeftInset}
      onClose={props.onClose}
    >
      <ListContent />
    </AppShellPanel>
  );
}
