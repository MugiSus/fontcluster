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
  common: {
    clear: 'Clear',
    undo: 'Undo',
  },
  panel: {
    control: 'control',
    list: 'list',
    chat: 'chat',
    collapse: 'Collapse {{title}} panel',
  },
  control: {
    text: 'Text',
    generate: 'Generate',
    generateNew: 'Generate new',
    recalculate: 'Recalculate',
    fonts: 'fonts',
    textSize: 'text size',
    linkageMethod: 'linkage method',
    preprocessDimensions: 'preprocess dimensions',
    groupingThreshold: 'grouping threshold',
    targetClusters: 'target clusters',
    sections: {
      render: 'render',
      analyze: 'analyze',
      position: 'position',
      cluster: 'cluster',
    },
    fontSets: {
      system_fonts: 'Installed Fonts',
      google_fonts_popular100: 'Google Fonts top 100',
      google_fonts_popular200: 'Google Fonts top 200',
      google_fonts_popular300: 'Google Fonts top 300',
      google_fonts_popular500: 'Google Fonts top 500',
      google_fonts_popular1000: 'Google Fonts top 1000',
      google_fonts_popular1500: 'Google Fonts top 1500',
      google_fonts_all: 'All Google Fonts',
    },
  },
  graph: {
    zoomIn: 'Zoom in',
    resetView: 'Reset view',
    zoomOut: 'Zoom out',
    select: 'Select',
    drag: 'Drag',
    zoom: 'Zoom',
    showSamples: 'Show samples',
    glowMode: 'Glow mode',
    filter: 'Filter',
    undo: 'Undo',
    redo: 'Redo',
    checkForUpdates: 'Check for updates',
    copyFamilyName: 'Copy family name',
    theme: 'Theme',
    language: 'Language',
    lasso: 'Lasso',
    searchPlaceholder: 'Font name, Designer, Foundry, etc...',
    openControlPanel: 'Control',
    openListPanel: 'List',
    noResults: 'No Results',
    noResultsHint: 'Complete processing to see results',
  },
  sessionHistory: {
    title: 'Session history',
    open: 'Open session history',
    empty: 'No sessions yet.',
    loading: 'Loading history...',
    stop: 'Stop',
    restore: 'Restore',
    continueProcessing: 'Continue processing',
    delete: 'Delete',
    statusRendering: 'Rendering',
    statusAnalyzing: 'Analyzing',
    statusPositioning: 'Positioning',
    statusClustering: 'Clustering',
    statusStopped: 'Stopped',
    processing: 'Processing',
    progress: 'Progress',
    summary:
      '{{weights}} weights · {{samples}} samples · {{clusters}} clusters',
    deleted: "Session deleted for '{{text}}'",
  },
  list: {
    selectPrompt: 'Select a font to see similar fonts',
    applyToPlugins: 'Apply {{name}} {{weight}} to plugins',
    fontPreviewAlt: 'Font preview for {{name}}',
  },
  plugins: {
    title: 'Plugin connections',
    empty: 'No plugins connected.',
    description:
      'Fontcluster plugins can apply the selected font directly to your design in Figma or Illustrator.',
    installHint:
      'Install a plugin, run it in the design app, then click items in the list below.',
    noDocument: 'No document',
  },
  chat: {
    title: 'FontCluster Chat',
    description:
      'This panel is reserved for future chat-driven font exploration tools.',
  },
  clipboard: {
    tips: 'Tips:',
    shiftBefore: 'Hold the Shift',
    shiftAfter:
      'while selecting a font to copy the family name directly from the graph.',
    commandBefore: 'Hold the Command',
    commandAfter: 'to copy the weight as well.',
  },
  theme: {
    toggle: 'Toggle theme',
    light: 'Light',
    dark: 'Dark',
    system: 'System',
  },
  language: {
    toggle: 'Change language',
    english: 'English',
    japanese: '日本語',
    system: 'System',
  },
  jobs: {
    started: "Job started: '{{text}}'",
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
