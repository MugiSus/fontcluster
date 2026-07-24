/**
 * English dictionary — the single source of truth for translation keys.
 *
 * The shape of this object defines {@link Dictionary}; every other locale
 * (e.g. {@link ja}) is typed against it, so a missing or misspelt key is a
 * compile error rather than a raw key leaking into the UI.
 *
 * Structure mirrors the component tree and feature ownership. Toast copy lives
 * under the feature that emits it, e.g. `list.toasts.copyFailed`, because
 * `toast()` is the delivery surface rather than the owner of the message.
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
    scrollLeft: 'Scroll left',
    scrollRight: 'Scroll right',
  },
  webViewer: {
    loading: 'Opening the FontCluster sample...',
    loadFailed: 'The FontCluster sample could not be opened.',
    retry: 'Try again',
  },
  panels: {
    control: 'control',
    list: 'list',
    chat: 'chat',
    close: 'Close {{title}} panel',
    open: 'Open {{title}} panel',
  },
  controlPanel: {
    text: 'Sample',
    generateModes: {
      open: 'Choose generation mode',
      applyChanges: 'Apply',
      duplicateChanged: 'Duplicate and recalculate with changes',
      inPlaceChanged: 'Recalculate with applied changes',
      fresh: 'Generate new',
    },
    restoreSession: 'Reset changes',
    fonts: 'fonts',
    model: 'model',
    modelDownloadRequired: 'Downloads when Generate is pressed',
    modelParameters: '{{count}}M params',
    modelCatalogLoading: 'Loading...',
    modelAvailabilityUnknown: 'Info unavailable',
    modelCatalogWarning: 'Some model information could not be loaded.',
    modelCatalogRetry: 'Try again',
    modelCatalogRequired: 'Load the model information before generating.',
    textSize: 'text size',
    linkageMethod: 'linkage method',
    preprocessDimensions: 'preprocess dimensions',
    groupingThreshold: 'threshold',
    targetClusters: 'target clusters',
    equalizer: {
      title: 'attribute equalizer',
      heading: 'Attribute Equalizer (Beta)',
      description:
        'Shape how strongly each visual attribute influences clustering. Positive levels emphasize an attribute; negative levels reduce its influence.',
      preset: 'Preset',
      done: 'Done',
      presets: {
        default: 'Default',
        none: 'None',
        custom: 'Custom',
      },
      attributes: {
        'serif': 'serif',
        'cursive': 'cursive',
        'italic': 'italic',
        'formal': 'formal',
        'delicate': 'delicate',
        'playful': 'playful',
        'legible': 'legible',
        'thin': 'thin',
        'angular': 'angular',
        'artistic': 'artistic',
        'attention-grabbing': 'attention-grabbing',
        'attractive': 'attractive',
        'bad': 'bad',
        'boring': 'boring',
        'calm': 'calm',
        'capitals': 'capitals',
        'charming': 'charming',
        'clumsy': 'clumsy',
        'complex': 'complex',
        'disorderly': 'disorderly',
        'display': 'display',
        'dramatic': 'dramatic',
        'fresh': 'fresh',
        'friendly': 'friendly',
        'gentle': 'gentle',
        'graceful': 'graceful',
        'happy': 'happy',
        'modern': 'modern',
        'monospace': 'mono-space',
        'pretentious': 'pre-tentious',
        'sharp': 'sharp',
        'sloppy': 'sloppy',
        'soft': 'soft',
        'strong': 'strong',
        'technical': 'technical',
        'warm': 'warm',
        'wide': 'wide',
      },
    },
    sections: {
      render: 'render',
      analyze: 'analyze',
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
      showFontNames: 'Show font names',
      glowMode: 'Glow mode',
      treemapBoundaries: 'Treemap boundaries',
      radialTreeMode: 'Radial tree',
      horizontalTreeMode: 'Horizontal tree',
      rectangularTreemapMode: 'Rectangular treemap',
      voronoiTreemapMode: 'Voronoi treemap',
      scatterPlotMode: 'Scatter plot',
      filter: 'Filter',
    },
    filterDock: {
      clear: 'Clear',
      searchPlaceholder: 'Font name, Designer, Foundry, etc.',
    },
    emptyState: {
      title: 'No Results',
      hint: 'Complete processing to see results',
    },
    selectedFontActions: {
      copy: 'Copy family name',
      applyToPlugins: 'Apply to plugins',
    },
    utilityControls: {
      undo: {
        title: 'Undo',
      },
      redo: {
        title: 'Redo',
      },
      checkForUpdates: {
        title: 'Check for updates',
      },
      theme: {
        title: 'Theme',
        toggle: 'Toggle theme',
        light: 'Light',
        dark: 'Dark',
        system: 'System',
      },
      language: {
        title: 'Language',
        toggle: 'Change language',
        system: 'System',
        english: 'English',
        japanese: '日本語',
      },
      sessionHistory: {
        title: 'History',
        open: 'Open history',
        empty: 'No sessions yet.',
        loading: 'Loading history...',
        stop: 'Stop',
        restore: 'Open',
        continueProcessing: 'Resume',
        delete: 'Delete',
        undoDelete: 'Undo',
        renameTitle: 'Click to edit title',
        renameFailed: 'Failed to rename session',
        statusRendering: 'Rendering',
        statusAnalyzing: 'Analyzing',
        statusClustering: 'Clustering',
        statusStopped: 'Stopped',
        processing: 'Processing',
        progress: 'Progress',
        summary:
          '{{weights}} weights · {{samples}} samples · {{clusters}} clusters',
        deleted: 'Session deleted for "{{text}}"',
      },
      plugins: {
        title: 'Plugins',
        empty: 'No plugins connected.',
        description:
          'Connect the Fontcluster Apply plugin to change fonts directly in design tools.',
        installHintBeforePlug:
          'Launch the Fontcluster Apply plugin in Figma or Adobe Illustrator, then click',
        installHintAfterPlug: 'icon to apply the selected font.',
        plugIcon: 'plug icon',
        noDocument: 'No document',
        getPlugin: 'Get Fontcluster Apply on Figma',
        illustratorSoon: 'Adobe Illustrator support is coming soon.',
      },
    },
  },
  list: {
    noMatchingFonts: 'No fonts match the active filters',
    clearPreviewText: 'Clear',
    applyToPlugins: 'Apply {{name}} {{weight}} to plugins',
    copyFontName: 'Copy {{name}}',
    fontPreviewAlt: 'Font preview for {{name}}',
    toasts: {
      copied: 'Copied "{{name}}"',
      copyFailed: 'Failed to copy',
    },
  },
  chat: {
    title: 'FontCluster Chat',
    description: 'Coming soon...',
  },
  clipboard: {
    toasts: {
      tips: 'Tips:',
      shiftBefore: 'Hold the Shift',
      shiftAfter:
        'while selecting a font to copy the family name directly from the graph.',
      commandBefore: 'Hold the Command',
      commandAfter: 'to copy the weight as well.',
    },
  },
  plugins: {
    toasts: {
      applied: 'Applied "{{name}}" to plugin',
      applyFailed: 'Failed to apply font to plugin',
    },
  },
  jobs: {
    toasts: {
      started: 'Job started: "{{text}}"',
      modelDownloadStarted: 'Downloading model "{{model}}"...',
      modelDownloadProgress: '{{percent}}% downloaded',
      modelDownloadCompleted: 'Model "{{model}}" is ready',
      completed: 'Job completed successfully!',
      view: 'View',
      failed: 'Job failed: {{error}}',
    },
  },
  updater: {
    toasts: {
      checking: 'Checking for updates...',
      available: 'New version {{version}} is available!',
      downloading: 'Downloading and installing update...',
      installed: 'Update installed!',
      applyOnLaunch: 'Update will be applied on the next launch.',
      restart: 'Restart',
      upToDate: "You're using the latest version. All set!",
      failed: 'Failed to check for updates',
    },
  },
};
