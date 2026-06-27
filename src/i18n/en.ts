/**
 * English dictionary — the single source of truth for translation keys.
 *
 * The shape of this object defines {@link Dictionary}; every other locale
 * (e.g. {@link ja}) is typed against it, so a missing or misspelt key is a
 * compile error rather than a raw key leaking into the UI.
 *
 * Notes on intentionally untranslated strings:
 * - Font weight names (`WEIGHT_LABELS`) and hierarchical clustering linkage
 *   names (`CLUSTERING_METHOD_LABELS`) stay in English as typography/algorithm
 *   proper nouns.
 * - Lowercase section/property/panel labels are lowercase on purpose; the UI
 *   applies `text-transform: capitalize`, which is a no-op for Japanese.
 * - `{{name}}` placeholders are resolved at call time via `resolveTemplate`.
 */
export const en = {
  panels: {
    control: 'control',
    list: 'list',
    chat: 'chat',
    close: 'Close {{title}} panel',
  },
  controlPanel: {
    text: 'Sample',
    generate: 'Generate',
    generateNew: 'Generate new graph',
    recalculate: 'Recalculate',
    fonts: 'fonts',
    textSize: 'text size',
    linkageMethod: 'linkage method',
    preprocessDimensions: 'preprocess dimensions',
    groupingThreshold: 'threshold',
    targetClusters: 'target clusters',
    sections: {
      render: 'render',
      analyze: 'analyze',
      position: 'position',
      cluster: 'cluster',
    },
    fontSets: {
      system_fonts: 'Local Fonts',
      google_fonts_popular100: 'Google Fonts top 100',
      google_fonts_popular200: 'Google Fonts top 200',
      google_fonts_popular300: 'Google Fonts top 300',
      google_fonts_popular500: 'Google Fonts top 500',
      google_fonts_popular1000: 'Google Fonts top 1000',
      google_fonts_popular1500: 'Google Fonts top 1500',
      google_fonts_all: 'Google Fonts',
    },
  },
  graph: {
    bottomToolbar: {
      zoomIn: 'Zoom in',
      resetView: 'Reset view',
      zoomOut: 'Zoom out',
      select: 'Select',
      drag: 'Move',
      zoom: 'Zoom',
      showSamples: 'Show samples',
      glowMode: 'Glow mode',
      filter: 'Filter',
    },
    lassoClearButton: {
      label: 'Lasso',
    },
    filterDock: {
      clear: 'Clear',
      searchPlaceholder: 'Font name, Designer, Foundry, etc.',
    },
    emptyState: {
      title: 'No Results',
      hint: 'Complete processing to see results',
    },
  },
  utility: {
    controls: {
      undo: 'Undo',
      redo: 'Redo',
      checkForUpdates: 'Check for updates',
      copy: 'Copy family name',
      theme: 'Theme',
      language: 'Language',
    },
    sessionHistory: {
      open: 'Session history',
    },
    clipboard: {
      tips: 'Tips:',
      shiftBefore: 'Hold the Shift',
      shiftAfter:
        'while selecting a font to copy the family name directly from the graph.',
      commandBefore: 'Hold the Command',
      commandAfter: 'to copy the weight as well.',
    },
  },
  sessionHistory: {
    title: 'Session history',
    open: 'Open session history',
    empty: 'No sessions yet.',
    loading: 'Loading history...',
    stop: 'Stop',
    restore: 'Open',
    continueProcessing: 'Resume',
    delete: 'Delete',
    undoDelete: 'Undo',
    statusRendering: 'Rendering',
    statusAnalyzing: 'Analyzing',
    statusPositioning: 'Positioning',
    statusClustering: 'Clustering',
    statusStopped: 'Stopped',
    processing: 'Processing',
    progress: 'Progress',
    summary:
      '{{weights}} weights · {{samples}} samples · {{clusters}} clusters',
    deleted: 'Session deleted for "{{text}}"',
  },
  list: {
    selectPrompt: 'Select a font to see similar fonts',
    clearPreviewText: 'Clear',
    applyToPlugins: 'Apply {{name}} {{weight}} to plugins',
    fontPreviewAlt: 'Font preview for {{name}}',
  },
  plugins: {
    title: 'Plugins',
    empty: 'No plugins connected.',
    description:
      'Connect the Fontcluster Apply plugin to change fonts directly in Figma.',
    installHint:
      'Launch the plugin in Figma, then click a font in the list to apply it automatically.',
    noDocument: 'No document',
    getPlugin: 'Get Fontcluster Apply on Figma',
    illustratorSoon: 'Adobe Illustrator support is coming soon.',
  },
  chat: {
    title: 'FontCluster Chat',
    description: 'Coming soon...',
  },
  theme: {
    toggle: 'Toggle theme',
    light: 'Light',
    dark: 'Dark',
    system: 'System',
  },
  language: {
    toggle: 'Change language',
    system: 'System',
    english: 'English',
    japanese: '日本語',
  },
  jobs: {
    started: 'Job started: "{{text}}"',
    completed: 'Job completed successfully!',
    view: 'View',
    failed: 'Job failed: {{error}}',
    lassoFailed: 'Lasso failed: {{error}}',
  },
  updater: {
    checking: 'Checking for updates...',
    available: 'New version {{version}} is available!',
    downloading: 'Downloading and installing update...',
    installed: 'Update installed!',
    applyOnLaunch: 'Update will be applied on the next launch.',
    restart: 'Restart',
    upToDate: "You're using the latest version. All set!",
    failed: 'Failed to check for updates',
  },
};
