/// <reference types="@figma/plugin-typings" />

interface FontclusterFontPayload {
  source: 'fontcluster';
  version: 1;
  safeName: string;
  fontName: string;
  familyName: string;
  familyNames: Record<string, string>;
  preferredFamilyNames: Record<string, string>;
  styleName: string;
  styleNames: Record<string, string>;
  preferredStyleNames: Record<string, string>;
  previewText: string;
  weight: number;
  weights: string[];
}

interface ApplyFontMessage {
  type: 'apply-font';
  payload: FontclusterFontPayload;
  sequence: number;
}

figma.showUI(__html__, { width: 280, height: 112 });

function findFigmaFontName(
  availableFonts: Font[],
  payload: FontclusterFontPayload,
): FontName | null {
  const familyCandidates = new Set([
    payload.familyName,
    payload.fontName,
    ...Object.values(payload.preferredFamilyNames),
    ...Object.values(payload.familyNames),
  ]);
  const styleCandidates = new Set([
    payload.styleName,
    ...Object.values(payload.preferredStyleNames),
    ...Object.values(payload.styleNames),
  ]);

  return (
    availableFonts
      .map((font) => font.fontName)
      .find(
        (fontName) =>
          familyCandidates.has(fontName.family) &&
          styleCandidates.has(fontName.style),
      ) ?? null
  );
}

async function applyFont(
  payload: FontclusterFontPayload,
  sequence: number,
): Promise<void> {
  const availableFonts = await figma.listAvailableFontsAsync();
  const selectedTextNodes = figma.currentPage.selection.filter(
    (node): node is TextNode => node.type === 'TEXT',
  );
  const fontName = findFigmaFontName(availableFonts, payload);

  if (!fontName) {
    figma.notify(`Font not available in Figma: ${payload.familyName}`);
    figma.ui.postMessage({
      type: 'apply-result',
      sequence,
      ok: false,
      message: `Font not available: ${payload.familyName}`,
    });
    return;
  }

  let createdTextNode: TextNode | null = null;
  const targets: TextNode[] =
    selectedTextNodes.length > 0
      ? selectedTextNodes
      : [(createdTextNode = figma.createText())];

  await figma.loadFontAsync(fontName);

  for (const node of targets) {
    if (!node.parent) {
      figma.currentPage.appendChild(node);
      node.x = figma.viewport.center.x;
      node.y = figma.viewport.center.y;
    }

    node.fontName = fontName;
    if (node === createdTextNode) {
      node.fontSize = 16;
      node.characters =
        payload.previewText.trim() || payload.fontName || payload.familyName;
    }
  }

  const resultMessage = `Applied ${fontName.family} ${fontName.style}`;

  figma.currentPage.selection = targets;
  figma.viewport.scrollAndZoomIntoView(targets);
  figma.commitUndo();
  figma.notify(resultMessage);
  figma.ui.postMessage({
    type: 'apply-result',
    sequence,
    ok: true,
    message: resultMessage,
  });
}

figma.ui.onmessage = (message: unknown) => {
  if (
    !message ||
    typeof message !== 'object' ||
    (message as { type?: unknown }).type !== 'apply-font'
  ) {
    return;
  }

  const applyMessage = message as ApplyFontMessage;

  applyFont(applyMessage.payload, applyMessage.sequence).catch(
    (error: unknown) => {
      console.error(error);
      figma.notify('Failed to apply Fontcluster font');
      figma.ui.postMessage({
        type: 'apply-result',
        sequence: applyMessage.sequence,
        ok: false,
        message: String(error),
      });
    },
  );
};
