import { convertFileSrc } from '@tauri-apps/api/core';
import { resolveGoogleFontFilePath } from './font-source-resolver';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const SVG_MIME_TYPE = 'image/svg+xml';
const TEXT_MIME_TYPE = 'text/plain';
const EMBEDDED_FONT_FAMILY = 'FontCluster Clipboard Font';
const FONT_SIZE = 96;
const LINE_HEIGHT = 1.2;
const PADDING = 8;
const MIN_SIZE = 1;

interface FontTextSvgClipboardOptions {
  familyName: string;
  weight: number;
  text: string;
}

interface EmbeddedFont {
  dataUrl: string;
  format: string;
}

interface SvgTextDocument {
  svgElement: SVGSVGElement;
  textElement: SVGTextElement;
}

interface SvgBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

function getFontFormat(fontPath: string): string | null {
  const extension = fontPath.split('.').pop()?.toLowerCase();

  switch (extension) {
    case 'otf':
      return 'opentype';
    case 'ttf':
      return 'truetype';
    case 'woff':
      return 'woff';
    case 'woff2':
      return 'woff2';
    default:
      return null;
  }
}

function shouldEmbedFont(fontPath: string): boolean {
  return fontPath.replaceAll('\\', '/').includes('/google_fonts/');
}

function escapeCssString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function quoteCssString(value: string): string {
  return `"${escapeCssString(value)}"`;
}

function dedupeValues(values: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    if (value === '' || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }

  return result;
}

function createFontFamilyValue(
  options: FontTextSvgClipboardOptions,
  embeddedFont: EmbeddedFont | null,
): string {
  const fontFamilies = dedupeValues([
    embeddedFont ? EMBEDDED_FONT_FAMILY : '',
    options.familyName,
  ]);

  return [...fontFamilies.map(quoteCssString), 'sans-serif'].join(', ');
}

function formatSvgNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';

  const rounded = Number(value.toFixed(3));
  return Object.is(rounded, -0) ? '0' : rounded.toString();
}

function splitSvgTextLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/);
}

function createSvgTextDocument(
  options: FontTextSvgClipboardOptions,
  embeddedFont: EmbeddedFont | null,
): SvgTextDocument {
  const svgElement = document.createElementNS(SVG_NS, 'svg');
  svgElement.setAttribute('xmlns', SVG_NS);
  svgElement.setAttribute('version', '1.1');

  if (embeddedFont) {
    const styleElement = document.createElementNS(SVG_NS, 'style');
    styleElement.textContent = [
      '@font-face {',
      `font-family: ${quoteCssString(EMBEDDED_FONT_FAMILY)};`,
      `src: url("${escapeCssString(embeddedFont.dataUrl)}") format("${embeddedFont.format}");`,
      `font-weight: ${options.weight};`,
      'font-style: normal;',
      '}',
    ].join('');
    svgElement.append(styleElement);
  }

  const textElement = document.createElementNS(SVG_NS, 'text');
  textElement.setAttributeNS(XML_NS, 'xml:space', 'preserve');
  textElement.setAttribute('x', '0');
  textElement.setAttribute('y', '0');
  textElement.setAttribute(
    'font-family',
    createFontFamilyValue(options, embeddedFont),
  );
  textElement.setAttribute('font-size', FONT_SIZE.toString());
  textElement.setAttribute('font-weight', options.weight.toString());
  textElement.setAttribute('fill', '#000000');

  const lines = splitSvgTextLines(options.text);
  for (const [index, line] of lines.entries()) {
    const tspanElement = document.createElementNS(SVG_NS, 'tspan');
    tspanElement.setAttribute('x', '0');
    tspanElement.setAttribute(
      'dy',
      index === 0 ? '0' : formatSvgNumber(FONT_SIZE * LINE_HEIGHT),
    );
    tspanElement.textContent = line;
    textElement.append(tspanElement);
  }

  svgElement.append(textElement);

  return { svgElement, textElement };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read font data URL.'));
      }
    });
    reader.addEventListener('error', () => {
      reject(reader.error ?? new Error('Failed to read font data.'));
    });
    reader.readAsDataURL(blob);
  });
}

async function createEmbeddedFont(options: FontTextSvgClipboardOptions) {
  const fontPath = resolveGoogleFontFilePath(
    options.familyName,
    options.weight,
  );
  if (!fontPath || !shouldEmbedFont(fontPath)) return null;

  const format = getFontFormat(fontPath);
  if (!format) return null;

  try {
    const response = await fetch(convertFileSrc(fontPath));
    if (!response.ok) return null;

    const sourceBlob = await response.blob();
    const dataUrl = await blobToDataUrl(
      new Blob([sourceBlob], { type: sourceBlob.type || 'font/ttf' }),
    );

    return { dataUrl, format };
  } catch {
    return null;
  }
}

async function loadFontForMeasurement(
  embeddedFont: EmbeddedFont | null,
  weight: number,
): Promise<FontFace | null> {
  if (!embeddedFont || !('FontFace' in window) || !document.fonts) return null;

  const fontFace = new FontFace(
    EMBEDDED_FONT_FAMILY,
    `url("${escapeCssString(embeddedFont.dataUrl)}") format("${embeddedFont.format}")`,
    {
      style: 'normal',
      weight: weight.toString(),
    },
  );

  try {
    await fontFace.load();
    document.fonts.add(fontFace);
    return fontFace;
  } catch {
    return null;
  }
}

function estimateSvgTextBounds(lines: string[]): SvgBounds {
  const maxLength = Math.max(
    1,
    ...lines.map((line) => Array.from(line).length),
  );
  const lineCount = Math.max(1, lines.length);

  return {
    x: 0,
    y: -FONT_SIZE,
    width: maxLength * FONT_SIZE * 0.65,
    height: lineCount * FONT_SIZE * LINE_HEIGHT,
  };
}

async function measureSvgText(
  options: FontTextSvgClipboardOptions,
  svgDocument: SvgTextDocument,
  embeddedFont: EmbeddedFont | null,
): Promise<SvgBounds> {
  const { svgElement, textElement } = svgDocument;
  const measurementFont = await loadFontForMeasurement(
    embeddedFont,
    options.weight,
  );

  svgElement.style.position = 'fixed';
  svgElement.style.left = '-10000px';
  svgElement.style.top = '-10000px';
  svgElement.style.opacity = '0';
  svgElement.style.pointerEvents = 'none';
  svgElement.style.overflow = 'visible';
  document.body.append(svgElement);

  try {
    if (document.fonts) {
      await document.fonts
        .load(
          `${options.weight} ${FONT_SIZE}px ${createFontFamilyValue(
            options,
            embeddedFont,
          )}`,
        )
        .catch(() => undefined);
    }

    const bounds = textElement.getBBox();
    if (bounds.width > 0 || bounds.height > 0) {
      return bounds;
    }
  } finally {
    svgElement.remove();
    if (measurementFont) {
      document.fonts.delete(measurementFont);
    }
  }

  return estimateSvgTextBounds(splitSvgTextLines(options.text));
}

function applySvgBounds(svgElement: SVGSVGElement, bounds: SvgBounds): void {
  const x = Math.floor(bounds.x - PADDING);
  const y = Math.floor(bounds.y - PADDING);
  const width = Math.max(MIN_SIZE, Math.ceil(bounds.width + PADDING * 2));
  const height = Math.max(MIN_SIZE, Math.ceil(bounds.height + PADDING * 2));

  svgElement.setAttribute('width', formatSvgNumber(width));
  svgElement.setAttribute('height', formatSvgNumber(height));
  svgElement.setAttribute(
    'viewBox',
    [x, y, width, height].map(formatSvgNumber).join(' '),
  );
}

async function createFontTextSvg(
  options: FontTextSvgClipboardOptions,
): Promise<string> {
  const embeddedFont = await createEmbeddedFont(options);
  const svgDocument = createSvgTextDocument(options, embeddedFont);
  const bounds = await measureSvgText(options, svgDocument, embeddedFont);
  applySvgBounds(svgDocument.svgElement, bounds);

  return new XMLSerializer().serializeToString(svgDocument.svgElement);
}

function writeSvgWithCopyEvent(svgText: string, plainText: string): boolean {
  let didWrite = false;

  const handleCopy = (event: ClipboardEvent) => {
    event.clipboardData?.setData(SVG_MIME_TYPE, svgText);
    event.clipboardData?.setData(TEXT_MIME_TYPE, plainText);
    event.preventDefault();
    didWrite = true;
  };

  document.addEventListener('copy', handleCopy, { once: true });
  const didCopy = document.execCommand('copy');
  document.removeEventListener('copy', handleCopy);

  return didCopy && didWrite;
}

export async function copyFontTextSvg(
  options: FontTextSvgClipboardOptions,
): Promise<void> {
  const svgTextPromise = createFontTextSvg(options);
  const svgBlobPromise = svgTextPromise.then(
    (svgText) => new Blob([svgText], { type: SVG_MIME_TYPE }),
  );

  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        [SVG_MIME_TYPE]: svgBlobPromise,
        [TEXT_MIME_TYPE]: new Blob([options.text], { type: TEXT_MIME_TYPE }),
      }),
    ]);
  } catch (error) {
    const svgText = await svgTextPromise;
    if (writeSvgWithCopyEvent(svgText, options.text)) return;

    throw error;
  }
}
