import {
  type Accessor,
  createEffect,
  createMemo,
  onCleanup,
  untrack,
} from 'solid-js';
import {
  CircleGeometry,
  Color,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  Scene,
  type WebGLRenderer,
} from 'three';
import { Text } from 'troika-three-text';
import { getClusterColorAngle } from '@/lib/cluster-colors';
import {
  LIST_MIN_SCALE,
  LIST_MAX_SCALE,
  LIST_SAMPLE_HEIGHT,
  LIST_SAMPLE_LEFT,
  LIST_SAMPLE_WIDTH,
  type FontListController,
} from '@/components/list/use-font-list';
import { createImageLayer } from './image-layer';
import {
  getClusterColor,
  type GraphOutputColorSpace,
} from './cluster-colors-gl';
import { GEIST_FONT_URL } from './text-font';

/** Screen-space pass in the existing graph renderer, independent of graph zoom.
 * Only visible rows have GPU objects. Three owns geometry/texture upload and
 * Troika owns font shaping and glyph atlas lifetime. */
export function createFontListLayer(props: {
  list: FontListController;
  size: Accessor<{ width: number; height: number }>;
  isDark: Accessor<boolean>;
  colorSpace: GraphOutputColorSpace;
  sessionKey: Accessor<string>;
  sampleImageUrl: (safeName: string) => string | undefined;
  requestRender: () => void;
}) {
  const scene = new Scene();
  const camera = new OrthographicCamera(0, 1, 0, -1, 0.1, 100);
  camera.position.z = 10;
  const imageSpecs = createMemo(() => {
    const color = new Color(props.isDark() ? 0xffffff : 0x18181b);
    return props.list.rows().map((row) => ({
      key: row.id,
      safeName: row.key,
      x: LIST_SAMPLE_LEFT,
      anchorX: 'left' as const,
      y: -row.y,
      width: Math.min(
        LIST_SAMPLE_WIDTH * row.scale,
        Math.max(0, props.list.bounds().width - LIST_SAMPLE_LEFT - 8),
      ),
      height: LIST_SAMPLE_HEIGHT * row.scale,
      color,
      opacity: row.opacity,
    }));
  });

  const circle = new CircleGeometry(2, 20);
  const textMaterial = new MeshBasicMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const rows = new Map<
    string,
    {
      group: Group;
      dot: Mesh<CircleGeometry, MeshBasicMaterial>;
      text: Text;
    }
  >();
  scene.add(
    createImageLayer({
      specs: imageSpecs,
      sessionKey: () => props.sessionKey(),
      sampleImageUrl: (key) => props.sampleImageUrl(key),
      zoom: () => 1,
      requestRender: () => props.requestRender(),
      onLayout: (key, width, height, ready) => {
        props.list.setPreviewSize(key, ready ? { width, height } : undefined);
        const entry = rows.get(key);
        if (entry) entry.text.position.x = LIST_SAMPLE_LEFT + width + 12;
      },
    }),
  );
  createEffect(() => {
    const visible = props.list.rows();
    const wanted = new Set(visible.map((row) => row.id));
    for (const [key, entry] of rows) {
      if (wanted.has(key)) continue;
      scene.remove(entry.group);
      entry.dot.material.dispose();
      entry.text.dispose();
      rows.delete(key);
      props.list.setPreviewSize(key, undefined);
    }
    for (const row of visible) {
      let entry = rows.get(row.id);
      if (!entry) {
        const group = new Group();
        const dot = new Mesh(
          circle,
          new MeshBasicMaterial({
            transparent: true,
            depthTest: false,
            depthWrite: false,
          }),
        );
        const text = new Text();
        text.font = GEIST_FONT_URL;
        text.fontSize = 12;
        text.anchorX = 'left';
        text.anchorY = 'middle';
        text.material = textMaterial;
        text.renderOrder = 3;
        group.add(dot, text);
        scene.add(group);
        entry = { group, dot, text };
        rows.set(row.id, entry);
      }
      entry.group.position.y = -row.y;
      entry.dot.position.x = 14;
      // The base circle is 4px across; magnify it to 8px with the row lens.
      entry.dot.scale.setScalar(
        MathUtils.clamp(
          MathUtils.mapLinear(row.scale, LIST_MIN_SCALE, LIST_MAX_SCALE, 1, 2),
          1,
          2,
        ),
      );
      entry.dot.material.color.copy(
        getClusterColor({
          angle: getClusterColorAngle(row.item.computed?.clustering),
          colorSpace: props.colorSpace,
        }),
      );
      entry.dot.material.opacity = row.opacity;
      entry.text.fillOpacity = row.opacity;
      entry.text.position.x =
        LIST_SAMPLE_LEFT +
        (untrack(() => props.list.previewSizes[row.id]?.width) ??
          LIST_SAMPLE_WIDTH * row.scale) +
        12;
      entry.text.color = props.isDark() ? 0xd4d4d8 : 0x3f3f46;
      entry.text.text = row.item.meta.font_name;
      entry.text.sync(props.requestRender);
    }
    props.requestRender();
  });

  createEffect(() => {
    const { width, height } = props.list.bounds();
    camera.right = width;
    camera.bottom = -height;
    camera.updateProjectionMatrix();
    props.requestRender();
  });

  onCleanup(() => {
    for (const [key, entry] of rows) {
      props.list.setPreviewSize(key, undefined);
      entry.dot.material.dispose();
      entry.text.dispose();
    }
    textMaterial.dispose();
    circle.dispose();
  });

  return {
    render(renderer: WebGLRenderer) {
      const { x, y, width, height } = props.list.bounds();
      if (!props.list.rows().length || width <= 0 || height <= 0) return;
      const size = props.size();
      // Three's viewport/scissor APIs use CSS pixels and account for DPR.
      renderer.setViewport(x, size.height - y - height, width, height);
      renderer.setScissor(x, size.height - y - height, width, height);
      renderer.setScissorTest(true);
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Three property snapshot
      const previousAutoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.render(scene, camera);
      renderer.autoClear = previousAutoClear;
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, size.width, size.height);
    },
  };
}
