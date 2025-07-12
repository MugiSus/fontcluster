import { Component, JSX, createSignal, createEffect, Show } from 'solid-js';
import { Portal } from 'solid-js/web';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: JSX.Element;
}

interface DialogContentProps {
  class?: string;
  children: JSX.Element;
}

interface DialogHeaderProps {
  children: JSX.Element;
}

interface DialogTitleProps {
  children: JSX.Element;
}

interface DialogDescriptionProps {
  children: JSX.Element;
}

export const Dialog: Component<DialogProps> = (props) => {
  let dialogRef: HTMLDialogElement | undefined;

  createEffect(() => {
    if (props.open && dialogRef) {
      dialogRef.showModal();
    } else if (!props.open && dialogRef) {
      dialogRef.close();
    }
  });

  const handleClick = (e: MouseEvent) => {
    if (e.target === dialogRef) {
      props.onOpenChange(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      props.onOpenChange(false);
    }
  };

  return (
    <Show when={props.open}>
      <Portal>
        <dialog
          ref={dialogRef}
          class="backdrop:bg-black/50 bg-transparent p-0 max-w-none w-full h-full"
          onClick={handleClick}
          onKeyDown={handleKeyDown}
        >
          <div class="flex items-center justify-center min-h-full p-4">
            {props.children}
          </div>
        </dialog>
      </Portal>
    </Show>
  );
};

export const DialogContent: Component<DialogContentProps> = (props) => {
  return (
    <div class={`bg-background border rounded-lg shadow-lg p-6 w-full ${props.class || ''}`}>
      {props.children}
    </div>
  );
};

export const DialogHeader: Component<DialogHeaderProps> = (props) => {
  return (
    <div class="flex flex-col space-y-1.5 text-center sm:text-left mb-4">
      {props.children}
    </div>
  );
};

export const DialogTitle: Component<DialogTitleProps> = (props) => {
  return (
    <h2 class="text-lg font-semibold leading-none tracking-tight">
      {props.children}
    </h2>
  );
};

export const DialogDescription: Component<DialogDescriptionProps> = (props) => {
  return (
    <p class="text-sm text-muted-foreground">
      {props.children}
    </p>
  );
};