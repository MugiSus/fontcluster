import type { Component, ComponentProps } from 'solid-js';

import { Toaster as Sonner } from 'solid-sonner';

type ToasterProps = ComponentProps<typeof Sonner>;

const Toaster: Component<ToasterProps> = (props) => {
  return (
    <Sonner
      class='toaster group'
      // Sonner sizes every toast with `width: var(--width)` (default 356px);
      // widen all toasts by raising the variable on the toaster container.
      style={{ '--width': '480px' }}
      toastOptions={{
        classes: {
          toast:
            'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton:
            'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton:
            'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
