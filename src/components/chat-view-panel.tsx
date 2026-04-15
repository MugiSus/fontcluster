import { BotIcon } from 'lucide-solid';

export function ChatViewPanel() {
  return (
    <div class='flex size-full items-stretch justify-stretch'>
      <div class='m-4 flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/80 bg-muted/20 p-4 text-center'>
        <BotIcon class='size-8 text-muted-foreground' />
        <div class='text-sm font-medium text-foreground'>Chat workspace</div>
        <p class='text-sm text-muted-foreground'>
          This panel is reserved for future chat-driven font exploration tools.
        </p>
      </div>
    </div>
  );
}
