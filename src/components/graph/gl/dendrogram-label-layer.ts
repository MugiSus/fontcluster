import { type Accessor, createEffect, createMemo, onCleanup } from 'solid-js';
import { type Object3D } from 'three';
import { BatchedText, Text } from 'troika-three-text';
import geistRegularWoff from '@fontsource/geist/files/geist-latin-400-normal.woff?inline';
import { type DendrogramLeafLabel } from '@/components/graph/dendrogram-edges';
import { polarPoint } from '@/components/graph/dendrogram-layout';
import { getClusterColor } from './cluster-colors-gl';

/** Fraction of the leaf ring pitch (arc length between adjacent leaves) the
 *  glyph em-height may fill; the rest keeps neighbouring labels apart. */
const PITCH_FILL = 0.7;
/** Label font size clamp, in graph units. */
const MIN_FONT_SIZE = 0.75;
const MAX_FONT_SIZE = 8;
/** Gap between the leaf ring and the label's near edge, in ems. */
const GAP_EM = 0.8;
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

export interface DendrogramLabelLayerProps {
  /** The leaf labels to draw, in leaf order. */
  labels: Accessor<DendrogramLeafLabel[]>;
  /** Representative font keys that are currently active/selectable. */
  activeKeys: Accessor<Set<string>>;
  /** Whether the active theme is dark (picks cluster colors). */
  isDark: Accessor<boolean>;
  /** Schedules a repaint of the (on-demand) render loop. */
  requestRender: () => void;
}

/**
 * The dendrogram mode's leaf name labels: every visible leaf's font name laid
 * out radially just outside the leaf ring, so the tree reads as a classic
 * labelled circular dendrogram.
 *
 * Rendering uses troika's SDF text — glyph layout and SDF atlas generation
 * run asynchronously in a worker, and the (experimental) `BatchedText` draws
 * all labels in a single call, so the layer scales to thousands of leaves and
 * stays crisp across the viewport's whole zoom range. Labels on the left
 * semicircle are flipped 180° and end-anchored (the classic radial label
 * rule) so no name renders upside down.
 *
 * Labels scale with the graph: the shared font size fills a fixed fraction of
 * the ring pitch, so the disc stays collision-free at any leaf count and the
 * names become legible by zooming in. Each label takes its leaf's cluster
 * color and the standard dimmed opacity when filtered out. Text/layout
 * changes resync asynchronously and repaint on completion; the render loop
 * owns the layer's visibility across the glow passes.
 */
export function createDendrogramLabelLayer(
  props: DendrogramLabelLayerProps,
): Object3D {
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

  const fontSize = createMemo(() => {
    const labels = props.labels();
    const radius = labels[0]?.radius ?? 0;
    if (labels.length === 0 || radius <= 0) return MIN_FONT_SIZE;
    const pitch = (2 * Math.PI * radius) / labels.length;
    return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, pitch * PITCH_FILL));
  });

  // Text, placement and color follow the label set / theme. The member pool
  // resizes in place; `sync` batches the members' async worker layouts.
  createEffect(() => {
    const labels = props.labels();
    const isDark = props.isDark();
    const size = fontSize();
    const gap = size * GAP_EM;

    while (members.length < labels.length) {
      const member = new Text();
      member.font = GEIST_FONT_URL;
      member.anchorY = 'middle';
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
      // A label reads outward along its leaf's spoke; on the left semicircle
      // it flips 180° and end-anchors so it never renders upside down.
      const isFlipped = Math.cos(label.angle) < 0;
      const position = polarPoint(label.angle, label.radius + gap);
      member.text = label.text;
      member.fontSize = size;
      member.anchorX = isFlipped ? 'right' : 'left';
      // World Y is the negated graph Y (graph space is y-down), so a graph
      // polar angle θ becomes a rotation of -θ around world Z.
      member.position.set(position.x, -position.y, 0);
      member.rotation.z = isFlipped ? Math.PI - label.angle : -label.angle;
      member.color = getClusterColor({ k: label.k, isDark });
    }
    batched.sync();
    props.requestRender();
  });

  // Match the other layers' active/dimmed opacity (cheap in-place update; the
  // batch reads member fill opacity per frame, no resync needed).
  createEffect(() => {
    const activeKeys = props.activeKeys();
    for (const [index, label] of props.labels().entries()) {
      const member = members[index];
      if (member) {
        member.fillOpacity = activeKeys.has(label.key) ? 1 : DIMMED_OPACITY;
      }
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
