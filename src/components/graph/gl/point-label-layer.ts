import { type Accessor, createEffect, onCleanup } from 'solid-js';
import {
  Color,
  DoubleSide,
  type Object3D,
  ShaderMaterial,
  SRGBColorSpace,
} from 'three';
import { DisplayP3ColorSpace } from 'three/addons/math/ColorSpaces.js';
import { BatchedText, Text } from 'troika-three-text';
import geistRegularWoff from '@fontsource/geist/files/geist-latin-400-normal.woff?inline';
import { SAMPLE_IMAGE_BOX_HEIGHT_PX } from '@/components/graph/constants';
import { type GraphPointLabel } from '@/components/graph/types';
import {
  getClusterColor,
  type GraphOutputColorSpace,
} from './cluster-colors-gl';
import {
  pointLabelFragmentShader,
  pointLabelVertexShader,
} from './point-label-shaders';

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
  /** Encoded RGB space of the renderer's drawing buffer. */
  colorSpace: GraphOutputColorSpace;
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
 * tree labels extend rightward; treemap and scatter labels normally hang
 * below, while treemap labels replace hidden cores at the point center when
 * the user has hidden sample images.
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
  // Troika derives its SDF/batching shader from this material. Its member-color
  // transport stores encoded RGB bytes, so decode them into Three's matching
  // linear working space before the standard renderer output transform.
  const labelBaseMaterial = new ShaderMaterial({
    uniforms: {
      diffuse: { value: new Color(0xffffff) },
      opacity: { value: 1 },
    },
    vertexShader: pointLabelVertexShader,
    fragmentShader: pointLabelFragmentShader,
    side: DoubleSide,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const batched = new BatchedText();
  batched.material = labelBaseMaterial;
  batched.frustumCulled = false;
  // Above the points, below the highlight rings and sample images.
  batched.renderOrder = 0.5;
  // Renderer capability is selected once before this layer is constructed.
  // eslint-disable-next-line solid/reactivity -- intentionally non-reactive renderer configuration
  const colorSpace = props.colorSpace;
  const outputColorSpace =
    colorSpace === 'display-p3' ? DisplayP3ColorSpace : SRGBColorSpace;

  /** Member pool keyed by the font key, so changing layout-specific label
   *  order never assigns another font's text geometry to an existing member. */
  const members = new Map<string, Text>();

  /**
   * Applies layout-specific alignment as member transforms. Every glyph block
   * stays center/middle anchored in Troika; its already-computed block width or
   * height moves that center so radial/rightward text begins after its outward
   * gap and horizontal text begins below its point. Consequently a layout-mode
   * change touches only transforms, never worker-owned text layout.
   */
  const updateMemberTransforms = () => {
    const zoom = props.zoom();
    const showImages = props.showImages();
    const forcedImageLabelKeys = props.forcedImageLabelKeys();

    for (const label of props.labels()) {
      const member = members.get(label.key);
      if (!member) continue;
      const blockBounds = member.textRenderInfo?.blockBounds;
      const hasImageBox = showImages || forcedImageLabelKeys.has(label.key);

      if (label.orientation === 'radial') {
        const gap =
          (MARGIN_PX +
            (hasImageBox ? SAMPLE_IMAGE_EXTRA_GAP_PX : 0) +
            (blockBounds ? (blockBounds[2] - blockBounds[0]) / 2 : 0)) *
          zoom;
        const isFlipped = Math.cos(label.angle) < 0;
        member.position.set(
          label.x + Math.cos(label.angle) * gap,
          -(label.y + Math.sin(label.angle) * gap),
          0,
        );
        member.rotation.z = isFlipped ? Math.PI - label.angle : -label.angle;
      } else if (label.orientation === 'rightward') {
        const gap =
          (MARGIN_PX +
            // set to be SAMPLE_IMAGE_BOX_HEIGHT_PX, intentionally. temporary.
            (hasImageBox ? SAMPLE_IMAGE_BOX_HEIGHT_PX / 2 : 0) +
            (blockBounds ? (blockBounds[2] - blockBounds[0]) / 2 : 0)) *
          zoom;
        member.position.set(label.x + gap, -label.y, 0);
        member.rotation.z = 0;
      } else if (label.orientation === 'centered') {
        member.position.set(label.x, -label.y, 0);
        member.rotation.z = 0;
      } else {
        const gap =
          (MARGIN_PX +
            (hasImageBox ? SAMPLE_IMAGE_BOX_HEIGHT_PX / 2 : 0) +
            (blockBounds ? (blockBounds[3] - blockBounds[1]) / 2 : 0)) *
          zoom;
        member.position.set(label.x, -(label.y + gap), 0);
        member.rotation.z = 0;
      }
      member.scale.set(zoom, zoom, 1);
    }
    props.requestRender();
  };

  // Worker syncs land outside Solid's tracking. New or changed text gets its
  // final bounds asynchronously, so apply the corresponding transform before
  // repainting the completed batch.
  batched.addEventListener('synccomplete', updateMemberTransforms);

  // Text and color follow the label set / theme. Only actual text changes
  // require an async worker relayout (`sync`); alignment remains fixed.
  createEffect(() => {
    const labels = props.labels();
    let shouldSync = false;

    const labelKeys = new Set(labels.map((label) => label.key));
    for (const [key, member] of members) {
      if (labelKeys.has(key)) continue;
      batched.removeText(member);
      member.dispose();
      members.delete(key);
      shouldSync = true;
    }

    for (const label of labels) {
      let member = members.get(label.key);
      if (!member) {
        member = new Text();
        member.font = GEIST_FONT_URL;
        member.fontSize = FONT_SIZE_PX;
        member.anchorX = 'center';
        member.anchorY = 'middle';
        batched.addText(member);
        members.set(label.key, member);
        shouldSync = true;
      }
      if (member.text !== label.text) {
        member.text = label.text;
        shouldSync = true;
      }
      member.color = getClusterColor({
        angle: label.colorAngle,
        colorSpace,
      }).getHex(outputColorSpace);
    }
    if (shouldSync) batched.sync();
    props.requestRender();
  });

  // Zoom, image clearance and layout-mode changes are matrix-only updates.
  createEffect(() => updateMemberTransforms());

  // Visibility (the image thinning's pick + viewport cull, plus forced image
  // label exceptions) and the standard active/dimmed rule, via fill opacity:
  // cheap in-place updates the batch reads per frame, so density changes while
  // panning never resync either.
  createEffect(() => {
    const visibleKeys = props.visibleKeys();
    const activeKeys = props.activeKeys();
    const showFontNames = props.showFontNames();
    const forcedImageLabelKeys = props.forcedImageLabelKeys();
    for (const label of props.labels()) {
      const member = members.get(label.key)!;
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
    batched.removeEventListener('synccomplete', updateMemberTransforms);
    for (const member of members.values()) member.dispose();
    labelBaseMaterial.dispose();
    batched.dispose();
  });

  return batched;
}
