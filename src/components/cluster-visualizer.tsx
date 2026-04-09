import {
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  untrack,
} from 'solid-js';
import { emit } from '@tauri-apps/api/event';
import { convertFileSrc } from '@tauri-apps/api/core';
import {
  Application,
  Container,
  Graphics,
  Particle,
  ParticleContainer,
  Rectangle,
  Sprite,
  Texture,
} from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { CircleSlash2Icon } from 'lucide-solid';
import { type FontWeight } from '../types/font';
import { WeightSelector } from './weight-selector';
import { ZoomControls } from './zoom-controls';
import { ImageVisibilityControl } from './image-visibility-control';
import { useElementSize } from '../hooks/use-element-size';
import { appState } from '../store';
import { setSelectedFontKey } from '../actions';
import { getClusterTintColor } from '../lib/cluster-colors-pixi';
import {
  GRAPH_CENTER,
  WORLD_SIZE,
  buildFontQuadtree,
  buildPointsMap,
  buildVisualizedPoints,
  type VisualizedPoint,
} from '../lib/visualizer-points';

const ZOOM_FACTOR_RATIO = 1.05;
const IMAGE_WIDTH = 128;
const IMAGE_HEIGHT = 28;
const IMAGE_OFFSET_Y = 6;
const BASE_POINT_SIZE = 3;
const FAMILY_POINT_RADIUS = 3;
const SELECTED_POINT_RADIUS = 4.5;
const MAX_RENDERER_RESOLUTION = 2;
const POINT_TEXTURE_SIZE = 16;

export function ClusterVisualizer() {
  const [showImages, setShowImages] = createSignal(true);
  const [isMoving, setIsMoving] = createSignal(false);
  const [rendererResolution, setRendererResolution] = createSignal(1);
  const [visualizerWeights, setVisualizerWeights] = createSignal<FontWeight[]>([
    400,
  ]);

  const { ref: setHostSizeRef, size: hostSize } =
    useElementSize<HTMLDivElement>();

  let hostElement: HTMLDivElement | undefined;
  let app: Application | undefined;
  let viewport: Viewport | undefined;
  let guideGraphics: Graphics | undefined;
  let inactivePointLayer: ParticleContainer<Particle> | undefined;
  let activePointLayer: ParticleContainer<Particle> | undefined;
  let selectionGraphics: Graphics | undefined;
  let imageLayer: Container | undefined;
  let pointTexture: Texture | undefined;
  let pointTextureResolution = 0;

  let interactionTimer: number | undefined;
  let hasInitializedViewport = false;
  let isInitializing = false;
  let lastAutoCenteredKey: string | null = null;

  const imageSprites = new Map<string, Sprite>();
  const imageTextureCache = new Map<string, Texture>();

  const allPoints = createMemo(() =>
    buildVisualizedPoints(appState.fonts.data),
  );

  const pointsMap = createMemo(() => buildPointsMap(allPoints()));

  const familyPointsMap = createMemo(() => {
    const map = new Map<string, VisualizedPoint[]>();

    for (const point of allPoints()) {
      const familyPoints = map.get(point.metadata.family_name);
      if (familyPoints) {
        familyPoints.push(point);
      } else {
        map.set(point.metadata.family_name, [point]);
      }
    }

    return map;
  });

  const fontQuadtree = createMemo(() =>
    buildFontQuadtree(
      pointsMap(),
      appState.fonts.filteredKeys,
      visualizerWeights(),
    ),
  );

  createEffect(() => {
    const sessionWeights =
      (appState.session.config?.weights as FontWeight[]) || [];
    if (sessionWeights.length > 0) {
      setVisualizerWeights(sessionWeights);
    }
  });

  const pointScale = () => {
    if (!viewport) return 1;
    return Math.max(viewport.scale.x || 1, 0.0001);
  };

  const getPreferredRendererResolution = () => {
    if (typeof window === 'undefined') return 1;

    return Math.min(window.devicePixelRatio || 1, MAX_RENDERER_RESOLUTION);
  };

  const getGuideColor = () =>
    document.documentElement.classList.contains('dark') ? 0x3f3f46 : 0xd4d4d8;

  const getImageSource = (point: VisualizedPoint) => {
    if (!appState.session.directory) return '';

    return convertFileSrc(
      `${appState.session.directory}/samples/${point.key}/sample.png`,
    );
  };

  const getImageTexture = (point: VisualizedPoint) => {
    const src = getImageSource(point);
    if (!src) return null;

    const cached = imageTextureCache.get(src);
    if (cached) return cached;

    const texture = Texture.from(src);
    imageTextureCache.set(src, texture);
    return texture;
  };

  const clearTransientLayers = () => {
    for (const sprite of imageSprites.values()) {
      sprite.destroy();
    }
    imageSprites.clear();

    if (imageLayer) {
      imageLayer.removeChildren();
    }
  };

  const drawPoint = (
    graphics: Graphics,
    x: number,
    y: number,
    radius: number,
    color: number,
    alpha: number,
  ) => {
    graphics.circle(x, y, radius).fill({ color, alpha });
  };

  const createPointTexture = () => {
    if (!app) return;

    const resolution = rendererResolution();
    if (pointTexture && pointTextureResolution === resolution) {
      return;
    }

    const pointGraphic = new Graphics()
      .circle(
        POINT_TEXTURE_SIZE / 2,
        POINT_TEXTURE_SIZE / 2,
        POINT_TEXTURE_SIZE / 2,
      )
      .fill({ color: 0xffffff });

    const nextTexture = app.renderer.generateTexture({
      target: pointGraphic,
      resolution,
      antialias: true,
    });

    const previousTexture = pointTexture;
    pointTexture = nextTexture;
    pointTextureResolution = resolution;

    if (inactivePointLayer) {
      inactivePointLayer.texture = nextTexture;
    }
    if (activePointLayer) {
      activePointLayer.texture = nextTexture;
    }

    pointGraphic.destroy();
    previousTexture?.destroy(true);
  };

  const redrawGuide = () => {
    if (!guideGraphics) return;

    const strokeWidth = 1 / pointScale();
    const color = getGuideColor();

    guideGraphics.clear();
    guideGraphics.alpha = 0.5;
    guideGraphics
      .moveTo(GRAPH_CENTER - 10, GRAPH_CENTER - 10)
      .lineTo(GRAPH_CENTER + 10, GRAPH_CENTER + 10)
      .moveTo(GRAPH_CENTER + 10, GRAPH_CENTER - 10)
      .lineTo(GRAPH_CENTER - 10, GRAPH_CENTER + 10)
      .stroke({ color, width: strokeWidth });
    guideGraphics.circle(GRAPH_CENTER, GRAPH_CENTER, 200).stroke({
      color,
      width: strokeWidth,
    });
    guideGraphics.circle(GRAPH_CENTER, GRAPH_CENTER, 400).stroke({
      color,
      width: strokeWidth,
    });
    guideGraphics.circle(GRAPH_CENTER, GRAPH_CENTER, 600).stroke({
      color,
      width: strokeWidth,
    });
  };

  const rebuildPointLayers = () => {
    if (!inactivePointLayer || !activePointLayer || !pointTexture) return;

    const activeWeights = new Set(visualizerWeights());
    const filteredKeys = appState.fonts.filteredKeys;

    inactivePointLayer.removeParticles();
    activePointLayer.removeParticles();

    for (const point of allPoints()) {
      if (!activeWeights.has(point.metadata.weight as FontWeight)) {
        continue;
      }

      const particle = new Particle({
        texture: pointTexture,
        x: point.x,
        y: point.y,
        anchorX: 0.5,
        anchorY: 0.5,
        scaleX: BASE_POINT_SIZE / POINT_TEXTURE_SIZE,
        scaleY: BASE_POINT_SIZE / POINT_TEXTURE_SIZE,
        tint: getClusterTintColor(point.metadata.computed?.k),
        alpha: filteredKeys.has(point.key) ? 1 : 0.2,
      });

      const color = getClusterTintColor(point.metadata.computed?.k);
      if (filteredKeys.has(point.key)) {
        particle.tint = color;
        activePointLayer.addParticle(particle);
      } else {
        particle.tint = color;
        inactivePointLayer.addParticle(particle);
      }
    }

    inactivePointLayer.update();
    activePointLayer.update();
  };

  const redrawSelection = () => {
    if (!selectionGraphics) return;

    const selectedKey = appState.ui.selectedFontKey;
    const selectedFamily = appState.ui.selectedFontFamily;
    const selectedPoint = selectedKey
      ? pointsMap().get(selectedKey)
      : undefined;
    const familyPoints = selectedFamily
      ? (familyPointsMap().get(selectedFamily) ?? [])
      : [];
    const activeWeights = new Set(visualizerWeights());
    const strokeWidth = 1.5 / pointScale();

    selectionGraphics.clear();

    for (const point of familyPoints) {
      if (
        point.key === selectedKey ||
        !activeWeights.has(point.metadata.weight as FontWeight)
      ) {
        continue;
      }

      const color = getClusterTintColor(point.metadata.computed?.k);

      drawPoint(
        selectionGraphics,
        point.x,
        point.y,
        FAMILY_POINT_RADIUS / pointScale(),
        color,
        1,
      );
      selectionGraphics
        .moveTo(point.x - 8 / pointScale(), point.y)
        .lineTo(point.x + 8 / pointScale(), point.y)
        .moveTo(point.x, point.y - 12 / pointScale())
        .lineTo(point.x, point.y + 12 / pointScale())
        .stroke({ color, width: strokeWidth });
      selectionGraphics.circle(point.x, point.y, 20 / pointScale()).stroke({
        color,
        width: strokeWidth,
      });
    }

    if (
      selectedPoint &&
      activeWeights.has(selectedPoint.metadata.weight as FontWeight)
    ) {
      const color = getClusterTintColor(selectedPoint.metadata.computed?.k);

      drawPoint(
        selectionGraphics,
        selectedPoint.x,
        selectedPoint.y,
        SELECTED_POINT_RADIUS / pointScale(),
        color,
        1,
      );
      selectionGraphics
        .moveTo(selectedPoint.x - 10 / pointScale(), selectedPoint.y)
        .lineTo(selectedPoint.x + 10 / pointScale(), selectedPoint.y)
        .moveTo(selectedPoint.x, selectedPoint.y - 15 / pointScale())
        .lineTo(selectedPoint.x, selectedPoint.y + 15 / pointScale())
        .stroke({ color, width: strokeWidth });
      selectionGraphics
        .circle(selectedPoint.x, selectedPoint.y, 40 / pointScale())
        .stroke({
          color,
          width: strokeWidth,
        });
    }
  };

  const isPointInsideVisibleBounds = (
    point: VisualizedPoint,
    paddingPixels = 0,
  ) => {
    if (!viewport) return false;

    const bounds = viewport.getVisibleBounds();
    const padding = paddingPixels / pointScale();

    return (
      point.x >= bounds.x - padding &&
      point.x <= bounds.x + bounds.width + padding &&
      point.y >= bounds.y - padding &&
      point.y <= bounds.y + bounds.height + padding
    );
  };

  const ensureImageSprite = (point: VisualizedPoint) => {
    const existing = imageSprites.get(point.key);
    if (existing) return existing;

    const texture = getImageTexture(point);
    if (!texture) return null;

    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5, 0);
    sprite.eventMode = 'none';
    imageLayer?.addChild(sprite);
    imageSprites.set(point.key, sprite);
    return sprite;
  };

  const syncImageLayer = () => {
    if (!viewport) return;

    const selectedKey = appState.ui.selectedFontKey;
    const activeWeights = new Set(visualizerWeights());
    const filteredKeys = appState.fonts.filteredKeys;
    const allowImages = showImages() && !isMoving();
    const scale = pointScale();
    const visibleKeys = new Set<string>();

    for (const point of allPoints()) {
      if (!activeWeights.has(point.metadata.weight as FontWeight)) {
        continue;
      }

      const isSelected = point.key === selectedKey;
      const shouldRenderImage =
        isPointInsideVisibleBounds(point, IMAGE_WIDTH) &&
        (allowImages || isSelected);

      if (!shouldRenderImage) {
        continue;
      }

      const sprite = ensureImageSprite(point);
      if (!sprite) continue;

      sprite.tint = getClusterTintColor(point.metadata.computed?.k);
      sprite.alpha = filteredKeys.has(point.key) ? 1 : 0.2;
      sprite.position.set(point.x, point.y + IMAGE_OFFSET_Y / scale);
      sprite.width = IMAGE_WIDTH / scale;
      sprite.height = IMAGE_HEIGHT / scale;
      sprite.visible = true;
      visibleKeys.add(point.key);
    }

    for (const [key, sprite] of imageSprites) {
      sprite.visible = visibleKeys.has(key);
    }
  };

  const syncLabelLayer = () => {
    // Text labels are temporarily disabled.
  };

  const syncOverlays = () => {
    redrawGuide();
    redrawSelection();
    syncImageLayer();
    syncLabelLayer();
  };

  const centerPointIfNeeded = (
    point: VisualizedPoint,
    activeWeights: Set<FontWeight>,
  ) => {
    if (!viewport) return;

    if (!activeWeights.has(point.metadata.weight as FontWeight)) {
      return;
    }

    if (isPointInsideVisibleBounds(point, 120)) {
      return;
    }

    viewport.animate({
      position: { x: point.x, y: point.y },
      time: 240,
      removeOnInterrupt: true,
    });
  };

  const scheduleInteractionEnd = () => {
    if (interactionTimer) window.clearTimeout(interactionTimer);

    interactionTimer = window.setTimeout(() => {
      untrack(() => {
        setIsMoving(false);
        syncImageLayer();
        syncLabelLayer();
      });
      interactionTimer = undefined;
    }, 180);
  };

  const handleViewportMove = () => {
    setIsMoving(true);
    syncImageLayer();
    scheduleInteractionEnd();
  };

  const handleViewportZoom = () => {
    setIsMoving(true);
    redrawGuide();
    redrawSelection();
    syncImageLayer();
    scheduleInteractionEnd();
  };

  const selectPointAtClientPosition = async (
    clientX: number,
    clientY: number,
    modifiers: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
    options?: { allowCopy?: boolean },
  ) => {
    if (!viewport || !app?.canvas) return;

    const rect = app.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const worldPoint = viewport.toWorld({ x, y });
    const selectionRadius = 40 / pointScale();
    const nearest = fontQuadtree().find(
      worldPoint.x,
      worldPoint.y,
      selectionRadius,
    );
    const nextSelectedKey = nearest?.key ?? null;
    const currentSelectedKey = appState.ui.selectedFontKey;

    if (nearest) {
      if (nextSelectedKey !== currentSelectedKey) {
        setSelectedFontKey(nextSelectedKey);
      }
      if (
        options?.allowCopy !== false &&
        nextSelectedKey !== currentSelectedKey &&
        (modifiers.shiftKey || modifiers.ctrlKey || modifiers.metaKey)
      ) {
        await emit('copy_family_name', {
          toast: false,
          isFontName: modifiers.ctrlKey || modifiers.metaKey,
        });
      }
      return;
    }

    if (currentSelectedKey !== null) {
      setSelectedFontKey(null);
    }
  };

  const handleZoom = (factor: number) => {
    if (!viewport) return;

    viewport.animate({
      position: { x: viewport.center.x, y: viewport.center.y },
      scale: viewport.scale.x / factor,
      time: 160,
      removeOnInterrupt: true,
    });
  };

  const handleReset = () => {
    if (!viewport) return;

    viewport.animate({
      position: { x: GRAPH_CENTER, y: GRAPH_CENTER },
      width: WORLD_SIZE,
      height: WORLD_SIZE,
      time: 200,
      removeOnInterrupt: true,
    });
  };

  createEffect(() => {
    const currentPoints = allPoints();
    if (!currentPoints.length) {
      clearTransientLayers();
      lastAutoCenteredKey = null;
      return;
    }

    clearTransientLayers();
    rebuildPointLayers();
    syncOverlays();
  });

  createEffect(() => {
    const tracked = {
      weights: visualizerWeights(),
      filteredKeys: appState.fonts.filteredKeys,
    };
    void tracked;
    rebuildPointLayers();
    syncOverlays();
  });

  createEffect(() => {
    const tracked = {
      selectedFontKey: appState.ui.selectedFontKey,
      selectedFontFamily: appState.ui.selectedFontFamily,
    };
    void tracked;
    redrawSelection();
  });

  createEffect(() => {
    const tracked = {
      sessionDirectory: appState.session.directory,
      imagesVisible: showImages(),
    };
    void tracked;
    syncImageLayer();
  });

  createEffect(() => {
    const moving = isMoving();
    void moving;
    syncImageLayer();
  });

  createEffect(() => {
    const size = hostSize();
    const resolution = rendererResolution();
    if (!app || !viewport || size.width <= 0 || size.height <= 0) return;

    app.renderer.resize(size.width, size.height, resolution);
    viewport.resize(size.width, size.height, WORLD_SIZE, WORLD_SIZE);

    if (!hasInitializedViewport) {
      viewport.fitWorld(true);
      hasInitializedViewport = true;
    }

    if (app) {
      createPointTexture();
      rebuildPointLayers();
    }
    syncOverlays();
  });

  createEffect(() => {
    const selectedKey = appState.ui.selectedFontKey;
    const activeWeights = new Set(visualizerWeights());
    if (!selectedKey) {
      lastAutoCenteredKey = null;
      return;
    }

    const point = pointsMap().get(selectedKey);
    if (!point || selectedKey === lastAutoCenteredKey) return;

    centerPointIfNeeded(point, activeWeights);
    lastAutoCenteredKey = selectedKey;
  });

  createEffect(() => {
    if (!hostElement || app || isInitializing) return;

    const initialize = async () => {
      isInitializing = true;
      try {
        setRendererResolution(getPreferredRendererResolution());
        app = new Application();
        await app.init({
          width: Math.max(hostSize().width, 1),
          height: Math.max(hostSize().height, 1),
          antialias: true,
          autoDensity: true,
          backgroundAlpha: 0,
          preference: 'webgl',
          resolution: rendererResolution(),
        });
        app.ticker.maxFPS = 0;

        app.canvas.className = 'size-full';
        hostElement?.appendChild(app.canvas);

        viewport = new Viewport({
          screenWidth: Math.max(hostSize().width, 1),
          screenHeight: Math.max(hostSize().height, 1),
          worldWidth: WORLD_SIZE,
          worldHeight: WORLD_SIZE,
          events: app.renderer.events,
          disableOnContextMenu: true,
          passiveWheel: false,
        });

        createPointTexture();

        viewport
          .drag({ mouseButtons: 'right' })
          .wheel()
          .pinch()
          .decelerate()
          .clamp({ direction: 'all' })
          .clampZoom({
            minWidth: 120,
            minHeight: 120,
            maxWidth: WORLD_SIZE * 2,
            maxHeight: WORLD_SIZE * 2,
          });

        guideGraphics = new Graphics();
        inactivePointLayer = new ParticleContainer({
          dynamicProperties: {
            position: false,
            rotation: false,
            vertex: false,
            uvs: false,
            color: false,
          },
          texture: pointTexture,
        });
        activePointLayer = new ParticleContainer({
          dynamicProperties: {
            position: false,
            rotation: false,
            vertex: false,
            uvs: false,
            color: false,
          },
          texture: pointTexture,
        });
        inactivePointLayer.boundsArea = new Rectangle(
          0,
          0,
          WORLD_SIZE,
          WORLD_SIZE,
        );
        activePointLayer.boundsArea = new Rectangle(
          0,
          0,
          WORLD_SIZE,
          WORLD_SIZE,
        );
        imageLayer = new Container();
        selectionGraphics = new Graphics();

        viewport.addChild(guideGraphics);
        viewport.addChild(inactivePointLayer);
        viewport.addChild(activePointLayer);
        viewport.addChild(imageLayer);
        viewport.addChild(selectionGraphics);
        app.stage.addChild(viewport);

        viewport.on('moved', handleViewportMove);
        viewport.on('zoomed', handleViewportZoom);
        viewport.on('moved-end', scheduleInteractionEnd);
        viewport.on('zoomed-end', scheduleInteractionEnd);

        app.canvas.addEventListener('pointerdown', (event) => {
          if (event.button !== 0) return;

          void selectPointAtClientPosition(
            event.clientX,
            event.clientY,
            {
              shiftKey: event.shiftKey,
              ctrlKey: event.ctrlKey,
              metaKey: event.metaKey,
            },
            { allowCopy: true },
          );
        });

        app.canvas.addEventListener('pointermove', (event) => {
          if ((event.buttons & 1) === 0) return;

          void selectPointAtClientPosition(
            event.clientX,
            event.clientY,
            {
              shiftKey: event.shiftKey,
              ctrlKey: event.ctrlKey,
              metaKey: event.metaKey,
            },
            { allowCopy: false },
          );
        });

        viewport.fitWorld(true);
        hasInitializedViewport = true;
        rebuildPointLayers();
        syncOverlays();
      } finally {
        isInitializing = false;
      }
    };

    void initialize();
  });

  onCleanup(() => {
    if (interactionTimer) window.clearTimeout(interactionTimer);

    clearTransientLayers();
    pointTexture?.destroy(true);
    viewport?.destroy();
    app?.destroy(true, { children: true });
    viewport = undefined;
    app = undefined;
    pointTexture = undefined;
    pointTextureResolution = 0;
    isInitializing = false;
  });

  createEffect(() => {
    if (typeof window === 'undefined') return;

    const updateResolution = () => {
      setRendererResolution(getPreferredRendererResolution());
    };

    updateResolution();
    window.addEventListener('resize', updateResolution);

    onCleanup(() => {
      window.removeEventListener('resize', updateResolution);
    });
  });

  return (
    <div class='relative flex size-full items-center justify-center rounded-md border bg-background shadow-sm'>
      <Show when={allPoints().length > 0}>
        <div class='pointer-events-none absolute bottom-2.5 right-2.5 z-10 flex items-end gap-2.5'>
          <div class='pointer-events-auto'>
            <ImageVisibilityControl
              showImages={showImages()}
              onToggle={() => setShowImages(!showImages())}
            />
          </div>
          <div class='pointer-events-auto'>
            <ZoomControls
              onZoomIn={() => handleZoom(1 / ZOOM_FACTOR_RATIO ** 5)}
              onZoomOut={() => handleZoom(ZOOM_FACTOR_RATIO ** 5)}
              onReset={handleReset}
            />
          </div>
          <div class='pointer-events-auto'>
            <WeightSelector
              weights={(appState.session.config?.weights as FontWeight[]) || []}
              selectedWeights={visualizerWeights()}
              onWeightChange={setVisualizerWeights}
              isVertical
            />
          </div>
        </div>
      </Show>

      <div
        ref={(el) => {
          hostElement = el;
          setHostSizeRef(el);
        }}
        class='size-full overflow-hidden rounded-md'
      />

      <Show when={allPoints().length === 0}>
        <div class='absolute inset-0 flex size-full flex-col items-center justify-center rounded-md bg-muted text-sm text-muted-foreground'>
          <CircleSlash2Icon class='mb-4 size-6' />
          <h2>No results found</h2>
          <p class='text-xs'>Complete processing to see results</p>
        </div>
      </Show>
    </div>
  );
}
