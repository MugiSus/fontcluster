import type { Dictionary } from './index';

/**
 * Japanese dictionary. Typed as {@link Dictionary} (derived from {@link en}),
 * so it must mirror the English structure key-for-key — a missing key fails to
 * compile rather than falling back to a raw key at runtime.
 */
export const ja: Dictionary = {
  panels: {
    control: '制御',
    list: 'リスト',
    chat: 'チャット',
    close: '{{title}}を閉じる',
  },
  controlPanel: {
    text: 'サンプル',
    generate: '生成',
    generateNew: 'グラフを新しく生成',
    recalculate: '再計算',
    fonts: 'フォント',
    textSize: 'テキストサイズ',
    linkageMethod: '連結法',
    preprocessDimensions: '前処理次元数',
    groupingThreshold: '閾値',
    targetClusters: '目標クラスタ数',
    sections: {
      render: '描画',
      analyze: '解析',
      position: '配置',
      cluster: 'クラスタリング',
    },
    fontSets: {
      system_fonts: 'ローカルフォント',
      google_fonts_popular100: 'Google Fonts TOP 100',
      google_fonts_popular200: 'Google Fonts TOP 200',
      google_fonts_popular300: 'Google Fonts TOP 300',
      google_fonts_popular500: 'Google Fonts TOP 500',
      google_fonts_popular1000: 'Google Fonts TOP 1000',
      google_fonts_popular1500: 'Google Fonts TOP 1500',
      google_fonts_all: 'Google Fonts',
    },
  },
  graph: {
    bottomToolbar: {
      zoomIn: '拡大',
      resetView: 'リセット',
      zoomOut: '縮小',
      select: '選択',
      drag: '移動',
      zoom: 'ズーム',
      showSamples: 'サンプル',
      glowMode: '光彩',
      filter: '絞り込み',
    },
    lassoClearButton: {
      label: '投げ縄',
    },
    filterDock: {
      clear: '消去',
      searchPlaceholder: 'フォント、デザイナー名など',
    },
    emptyState: {
      title: 'まだ結果がありません',
      hint: '処理が完了すると結果が表示されます。',
    },
    selectedFontActions: {
      copy: 'コピー',
      applyToPlugins: 'プラグインに適用',
    },
  },
  utility: {
    controls: {
      undo: '取り消す',
      redo: 'やり直す',
      checkForUpdates: 'アップデートを確認',
      theme: 'テーマ',
      language: '言語',
    },
    sessionHistory: {
      open: '履歴',
    },
    clipboard: {
      tips: 'Tips:',
      shiftBefore: 'Shift',
      shiftAfter:
        'を押しながらフォントを選択するとグラフから直接ファミリー名をコピーできます。',
      commandBefore: 'Command',
      commandAfter: 'を押すとウェイトも同時にコピーできます。',
    },
  },
  sessionHistory: {
    title: '履歴',
    open: '履歴を開く',
    empty: '履歴がありません',
    loading: '履歴を読み込んでいます...',
    stop: '中止',
    restore: '開く',
    continueProcessing: '再開',
    delete: '削除',
    undoDelete: '取り消す',
    statusRendering: 'レンダリング中',
    statusAnalyzing: '解析中',
    statusPositioning: '配置中',
    statusClustering: 'クラスタリング中',
    statusStopped: '中断',
    processing: '処理中',
    progress: '進捗',
    summary:
      'ウェイト {{weights}} 種・サンプル {{samples}} 個・クラスタ {{clusters}} 個',
    deleted: 'セッションを削除しました（"{{text}}"）',
  },
  list: {
    selectPrompt: 'フォントを選択してください',
    clearPreviewText: '消去',
    applyToPlugins: '{{name}} {{weight}} をプラグインで適用',
    fontPreviewAlt: '{{name}} のプレビュー',
  },
  plugins: {
    title: 'プラグイン',
    empty: '接続中のプラグインはありません。',
    description:
      'Fontcluster Apply プラグインと連携することで、Figma のフォントを直接変更することができます。',
    installHint:
      'Figma でプラグインを起動し、"リスト"のフォントをクリックすると自動で適用されます。',
    noDocument: 'ドキュメントなし',
    getPlugin: 'Figma で Fontcluster Apply を入手',
    illustratorSoon: 'Adobe Illustrator プラグインは現在開発中です',
  },
  chat: {
    title: 'FontCluster Chat',
    description: '今後実装予定..',
  },
  theme: {
    toggle: 'テーマを変更',
    light: 'ライト',
    dark: 'ダーク',
    system: 'システム',
  },
  language: {
    toggle: '言語を変更',
    system: 'システム',
    english: 'English',
    japanese: '日本語',
  },
  jobs: {
    started: 'ジョブを開始しました（"{{text}}"）',
    completed: '処理が完了しました',
    view: '表示',
    failed: 'ジョブが失敗しました: {{error}}',
    lassoFailed: '投げ縄選択に失敗しました: {{error}}',
  },
  updater: {
    checking: 'アップデートを確認しています...',
    available: '新しいバージョン {{version}} を利用できます！',
    downloading: 'アップデートをインストールしています...',
    installed: 'アップデートをインストールしました',
    applyOnLaunch: 'アップデートは次回の起動時に適用されます。',
    restart: '再起動',
    upToDate: '最新バージョンを使用しています。',
    failed: 'アップデートを確認できませんでした',
  },
};
