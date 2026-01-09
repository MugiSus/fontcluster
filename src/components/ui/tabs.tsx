import {
  createSignal,
  createContext,
  useContext,
  JSX,
  ParentComponent,
} from 'solid-js';

interface TabsContextValue {
  value: () => string;
  setValue: (value: string) => void;
}

const TabsContext = createContext<TabsContextValue>();

interface TabsProps {
  value?: string;
  onValueChange?: (value: string) => void;
  children: JSX.Element;
  class?: string;
}

export const Tabs: ParentComponent<TabsProps> = (props) => {
  const [value, setValue] = createSignal(props.value || '');

  const handleValueChange = (newValue: string) => {
    setValue(newValue);
    props.onValueChange?.(newValue);
  };

  const contextValue: TabsContextValue = {
    value,
    setValue: handleValueChange,
  };

  return (
    <TabsContext.Provider value={contextValue}>
      <div class={props.class}>{props.children}</div>
    </TabsContext.Provider>
  );
};

interface TabsListProps {
  children: JSX.Element;
  class?: string;
}

export const TabsList: ParentComponent<TabsListProps> = (props) => {
  return (
    <div
      class={`inline-flex h-10 items-center justify-center rounded-md bg-slate-200 p-1 text-muted-foreground dark:bg-zinc-900 ${props.class || ''}`}
    >
      {props.children}
    </div>
  );
};

interface TabsTriggerProps {
  value: string;
  children: JSX.Element;
  class?: string;
}

export const TabsTrigger: ParentComponent<TabsTriggerProps> = (props) => {
  const context = useContext(TabsContext);
  if (!context) throw new Error('TabsTrigger must be used within Tabs');

  const isActive = () => context.value() === props.value;

  return (
    <button
      class={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${
        isActive()
          ? 'bg-background text-foreground shadow-sm'
          : 'hover:bg-slate-200 hover:text-foreground dark:hover:bg-zinc-800'
      } ${props.class || ''}`}
      onClick={() => context.setValue(props.value)}
    >
      {props.children}
    </button>
  );
};

interface TabsContentProps {
  value: string;
  children: JSX.Element;
  class?: string;
}

export const TabsContent: ParentComponent<TabsContentProps> = (props) => {
  const context = useContext(TabsContext);
  if (!context) throw new Error('TabsContent must be used within Tabs');

  const isActive = () => context.value() === props.value;

  return (
    <div
      class={`mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
        isActive() ? 'block' : 'hidden'
      } ${props.class || ''}`}
    >
      {props.children}
    </div>
  );
};
