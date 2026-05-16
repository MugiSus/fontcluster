/// <reference types="@figma/plugin-typings" />

interface FontclusterFontPayload {
  source: 'fontcluster';
  version: 1;
  safeName: string;
  fontName: string;
  familyName: string;
  familyNames: Record<string, string>;
  preferredFamilyNames: Record<string, string>;
  weight: number;
  weights: string[];
}

interface ApplyFontMessage {
  type: 'apply-font';
  payload: FontclusterFontPayload;
  sequence: number;
}

interface ApplyFontResultMessage {
  type: 'apply-result';
  sequence: number;
  ok: boolean;
  message: string;
}

type StylePriority = {
  exactMatch: number;
  italic: number;
  regularName: number;
};

const WEIGHT_STYLE_NAMES: Record<number, string[]> = {
  100: ['thin'],
  200: ['extralight', 'extra light', 'ultralight', 'ultra light'],
  300: ['light'],
  400: ['regular', 'normal', 'book'],
  500: ['medium'],
  600: ['semibold', 'semi bold', 'demibold', 'demi bold'],
  700: ['bold'],
  800: ['extrabold', 'extra bold', 'ultrabold', 'ultra bold'],
  900: ['black', 'heavy'],
};

figma.showUI(__html__, { width: 280, height: 112 });

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[\s_-]+/g, '');
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function getFamilyCandidates(payload: FontclusterFontPayload): string[] {
  return unique([
    payload.familyName,
    payload.fontName,
    ...Object.values(payload.preferredFamilyNames),
    ...Object.values(payload.familyNames),
  ]);
}

function styleWeight(style: string): number {
  const normalized = normalizeName(style);

  if (normalized.includes('extrabold') || normalized.includes('ultrabold')) {
    return 800;
  }
  if (normalized.includes('semibold') || normalized.includes('demibold')) {
    return 600;
  }
  if (normalized.includes('extralight') || normalized.includes('ultralight')) {
    return 200;
  }
  if (normalized.includes('thin')) return 100;
  if (normalized.includes('light')) return 300;
  if (normalized.includes('medium')) return 500;
  if (normalized.includes('bold')) return 700;
  if (normalized.includes('black') || normalized.includes('heavy')) return 900;

  return 400;
}

function stylePriority(style: string, targetWeight: number): StylePriority {
  const normalizedStyle = normalizeName(style);
  const targetStyles = WEIGHT_STYLE_NAMES[targetWeight] ?? [];
  const exactMatch = targetStyles.some(
    (candidate) => normalizeName(candidate) === normalizedStyle,
  );

  return {
    exactMatch: exactMatch ? 0 : 1,
    italic: normalizedStyle.includes('italic') ? 1 : 0,
    regularName: normalizedStyle === 'regular' ? 0 : 1,
  };
}

function findFigmaFontName(
  availableFonts: Font[],
  payload: FontclusterFontPayload,
): FontName | null {
  const familyCandidates = new Set(
    getFamilyCandidates(payload).map(normalizeName),
  );

  const matchingFonts = availableFonts
    .map((font) => font.fontName)
    .filter((fontName) => familyCandidates.has(normalizeName(fontName.family)));

  if (matchingFonts.length === 0) return null;

  const targetWeight = Number(payload.weight) || 400;
  const bestMatch = matchingFonts
    .map((fontName) => {
      const priority = stylePriority(fontName.style, targetWeight);
      return {
        fontName,
        weightDistance: Math.abs(styleWeight(fontName.style) - targetWeight),
        exactMatch: priority.exactMatch,
        italic: priority.italic,
        regularName: priority.regularName,
        styleName: fontName.style,
      };
    })
    .sort((a, b) => {
      if (a.exactMatch !== b.exactMatch) return a.exactMatch - b.exactMatch;
      if (a.weightDistance !== b.weightDistance) {
        return a.weightDistance - b.weightDistance;
      }
      if (a.italic !== b.italic) return a.italic - b.italic;
      if (a.regularName !== b.regularName) {
        return a.regularName - b.regularName;
      }
      return a.styleName.localeCompare(b.styleName);
    })[0];

  return bestMatch?.fontName ?? null;
}

function postApplyResult(message: ApplyFontResultMessage): void {
  figma.ui.postMessage(message);
}

async function applyFont(
  payload: FontclusterFontPayload,
  sequence: number,
): Promise<void> {
  const availableFonts = await figma.listAvailableFontsAsync();
  const fontName = findFigmaFontName(availableFonts, payload);

  if (!fontName) {
    figma.notify(`Font not available in Figma: ${payload.familyName}`);
    postApplyResult({
      type: 'apply-result',
      sequence,
      ok: false,
      message: `Font not available: ${payload.familyName}`,
    });
    return;
  }

  await figma.loadFontAsync(fontName);

  const selectedTextNodes = figma.currentPage.selection.filter(
    (node): node is TextNode => node.type === 'TEXT',
  );
  const targets: TextNode[] =
    selectedTextNodes.length > 0 ? selectedTextNodes : [figma.createText()];

  for (const node of targets) {
    const isNewNode = !node.parent;
    if (!node.parent) {
      figma.currentPage.appendChild(node);
      node.x = figma.viewport.center.x;
      node.y = figma.viewport.center.y;
    }

    node.fontName = fontName;
    if (isNewNode) {
      node.characters = payload.fontName || payload.familyName;
    }
  }

  figma.currentPage.selection = targets;
  figma.viewport.scrollAndZoomIntoView(targets);
  figma.notify(`Applied ${fontName.family} ${fontName.style}`);
  postApplyResult({
    type: 'apply-result',
    sequence,
    ok: true,
    message: `${fontName.family} ${fontName.style}`,
  });
}

function isApplyFontMessage(message: unknown): message is ApplyFontMessage {
  if (!message || typeof message !== 'object') return false;

  return (message as { type?: unknown }).type === 'apply-font';
}

figma.ui.onmessage = (message: unknown) => {
  if (!isApplyFontMessage(message)) return;

  applyFont(message.payload, message.sequence).catch((error: unknown) => {
    console.error(error);
    figma.notify('Failed to apply Fontcluster font');
    postApplyResult({
      type: 'apply-result',
      sequence: message.sequence,
      ok: false,
      message: String(error),
    });
  });
};
