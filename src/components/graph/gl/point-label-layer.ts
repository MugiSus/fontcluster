import { type Accessor, createEffect, onCleanup } from 'solid-js';
import { type Object3D } from 'three';
import { BatchedText, Text } from 'troika-three-text';
import geistRegularWoff from '@fontsource/geist/files/geist-latin-400-normal.woff?inline';
import { type GraphPointLabel } from '@/components/graph/types';
import { getClusterColor } from './cluster-colors-gl';
import { BOX_HEIGHT_PX } from './image-layer';

/** Label glyph em-height in CSS px, held constant on zoom. */
const FONT_SIZE_PX = 10;
/** Screen px between a label's near edge and the leaf point / image box. */
const MARGIN_PX = 6;
/** Fixed extra screen-px gap while sample images are shown. */
const SAMPLE_IMAGE_EXTRA_GAP_PX = 12;
/** Matches the ring/image layers' dimmed opacity for filtered-out fonts. */
const DIMMED_OPACITY = 0.4;

// The woff ships inlined as a data URI (a runtime asset fetch is not
// guaranteed to reach troika's in-worker XHR through Tauri's custom
// protocol), converted once to an object URL so each member's worker sync
// message carries a short string rather than the ~40KB data URI.
const GEIST_FONT_URL = URL.createObjectURL(
  new Blob(
    [
      Uint8Array.from(atob(geistRegularWoff.split(',')[1] ?? ''), (char) =>
        char.charCodeAt(0),
      ),
    ],
    { type: 'font/woff' },
  ),
);

export interface PointLabelLayerProps {
  /** The point labels to draw (see {@link GraphPointLabel}). */
  labels: Accessor<GraphPointLabel[]>;
  /** Keys picked by the screen-space image thinning (and viewport cull);
   *  only their labels show, so label density follows the image density. */
  visibleKeys: Accessor<Set<string>>;
  /** Representative font keys that are currently active/selectable. */
  activeKeys: Accessor<Set<string>>;
  /** Whether the sample images are shown (labels then get a fixed extra gap). */
  showImages: Accessor<boolean>;
  /** Whether the toolbar font-name toggle is enabled. */
  showFontNames: Accessor<boolean>;
  /** Leaf keys whose forced sample images are drawn, so labels remain visible. */
  forcedImageLabelKeys: Accessor<Set<string>>;
  /** Whether the active theme is dark (picks cluster colors). */
  isDark: Accessor<boolean>;
  /** World-units-per-CSS-pixel factor so labels keep their px size on zoom. */
  zoom: Accessor<number>;
  /** Schedules a repaint of the (on-demand) render loop. */
  requestRender: () => void;
}

/**
 * The graph's font-name labels. Radial labels (the dendrogram layout) lay out
 * along their leaf's spoke, so the tree reads as a labelled circular
 * dendrogram; labels on the left semicircle are flipped 180° and end-anchored
 * (the classic radial label rule) so no name renders upside down. Horizontal
 * labels (the scatter layout) hang centred below their point.
 *
 * Rendering uses troika's SDF text — glyph layout and SDF atlas generation
 * run asynchronously in a worker, and the (experimental) `BatchedText` draws
 * all labels in a single call, so the layer scales to thousands of points.
 *
 * Labels keep a constant screen size: the glyph em-height is authored in CSS
 * px and each member scales by the world-per-px zoom factor — a matrix-only
 * update, so zooming never re-runs the worker layout. Density is delegated to
 * the image layer's screen-space thinning (`visibleKeys`): every point
 * keeps a laid-out member, but only the thinned/in-viewport ones are visible
 * (via fill opacity, again avoiding relayout while panning). Each label takes
 * its point's cluster color and the standard dimmed opacity when filtered
 * out. The render loop owns the layer's visibility across the glow passes.
 */
export function createPointLabelLayer(props: PointLabelLayerProps): Object3D {
  const batched = new BatchedText();
  batched.frustumCulled = false;
  // Above the points, below the highlight rings and sample images.
  batched.renderOrder = 0.5;
  batched.material.depthTest = false;
  batched.material.depthWrite = false;

  // Worker syncs land outside Solid's tracking; repaint when the glyphs do.
  batched.addEventListener('synccomplete', () => props.requestRender());

  /** Member pool, index-aligned with the label list. */
  const members: Text[] = [];

  // Text, orientation and color follow the label set / theme — the only
  // member properties whose change costs an async worker relayout (`sync`).
  createEffect(() => {
    const labels = props.labels();
    const isDark = props.isDark();

    while (members.length < labels.length) {
      const member = new Text();
      member.font = GEIST_FONT_URL;
      member.fontSize = FONT_SIZE_PX;
      batched.addText(member);
      members.push(member);
    }
    while (members.length > labels.length) {
      const member = members.pop()!;
      batched.removeText(member);
      member.dispose();
    }

    for (const [index, label] of labels.entries()) {
      const member = members[index]!;
      member.text = label.text;
      member.color = getClusterColor({ colorIndex: label.colorIndex, isDark });
      if (label.orientation === 'radial') {
        // A label reads outward along its leaf's spoke; on the left
        // semicircle it flips 180° and end-anchors so it never renders
        // upside down.
        const isFlipped = Math.cos(label.angle) < 0;
        member.anchorX = isFlipped ? 'right' : 'left';
        member.anchorY = 'middle';
        // World Y is the negated graph Y (graph space is y-down), so a graph
        // polar angle θ becomes a rotation of -θ around world Z.
        member.rotation.z = isFlipped ? Math.PI - label.angle : -label.angle;
      } else {
        member.anchorX = 'center';
        member.anchorY = 'top';
        member.rotation.z = 0;
      }
    }
    batched.sync();
    props.requestRender();
  });

  // Placement: the glyphs are authored in CSS px, so scaling by the
  // world-per-px zoom keeps them a constant screen size; the point gap scales
  // the same way. When samples are shown, radial labels use a fixed extra gap
  // instead of an angle-dependent rectangle projection, so text-to-core
  // distance stays uniform around the ring; horizontal labels clear the image
  // box's half height instead.
  // Matrix-only updates — zooming and panning never resync the worker.
  createEffect(() => {
    const zoom = props.zoom();
    const showImages = props.showImages();
    const forcedImageLabelKeys = props.forcedImageLabelKeys();
    for (const [index, label] of props.labels().entries()) {
      const member = members[index]!;
      const hasImageBox = showImages || forcedImageLabelKeys.has(label.key);
      if (label.orientation === 'radial') {
        const gap =
          (MARGIN_PX + (hasImageBox ? SAMPLE_IMAGE_EXTRA_GAP_PX : 0)) * zoom;
        member.position.set(
          label.x + Math.cos(label.angle) * gap,
          -(label.y + Math.sin(label.angle) * gap),
          0,
        );
      } else {
        const gap = (MARGIN_PX + (hasImageBox ? BOX_HEIGHT_PX / 2 : 0)) * zoom;
        member.position.set(label.x, -(label.y + gap), 0);
      }
      member.scale.set(zoom, zoom, 1);
    }
    props.requestRender();
  });

  // Visibility (the image thinning's pick + viewport cull, plus forced image
  // label exceptions) and the standard active/dimmed rule, via fill opacity:
  // cheap in-place updates the batch reads per frame, so density changes while
  // panning never resync either.
  createEffect(() => {
    const visibleKeys = props.visibleKeys();
    const activeKeys = props.activeKeys();
    const showFontNames = props.showFontNames();
    const forcedImageLabelKeys = props.forcedImageLabelKeys();
    for (const [index, label] of props.labels().entries()) {
      const member = members[index]!;
      const isVisible =
        (showFontNames && visibleKeys.has(label.key)) ||
        forcedImageLabelKeys.has(label.key);
      member.fillOpacity = !isVisible
        ? 0
        : activeKeys.has(label.key)
          ? 1
          : DIMMED_OPACITY;
    }
    props.requestRender();
  });

  onCleanup(() => {
    for (const member of members) member.dispose();
    batched.material.dispose();
    batched.dispose();
  });

  return batched;
}
