import { type GraphPointData } from './types';

/** Visual emphasis applied to one ordinary font point. Merge aliases keep
 * their separate dendrogram-node presentation because they use another key
 * space and topology. */
export type GraphPointEmphasis =
  | 'none'
  | 'family'
  | 'alias-source'
  | 'selected';

/**
 * The complete primitive presentation of one ordinary font point. Rendering
 * layers consume these values without consulting graph mode, toolbar toggles,
 * filtering, selection, or thinning state themselves.
 */
export interface GraphPointPresentation {
  readonly point: GraphPointData;
  readonly showSample: boolean;
  readonly showLabel: boolean;
  readonly showCore: boolean;
  readonly isActive: boolean;
  readonly emphasis: GraphPointEmphasis;
}

interface GraphPointPresentationOptions {
  points: readonly GraphPointData[];
  activeKeys: ReadonlySet<string>;
  visibleDetailKeys: ReadonlySet<string>;
  selectedKey: string | null;
  selectedAliasSourceKey: string | null;
  selectedFamilyName: string | null;
  showSamples: boolean;
  showLabels: boolean;
  showCores: boolean;
}

/** Derives the single presentation source consumed by every font-point layer. */
export function deriveGraphPointPresentations(
  options: GraphPointPresentationOptions,
): GraphPointPresentation[] {
  return options.points.map((point) => {
    const showSample =
      (options.showSamples && options.visibleDetailKeys.has(point.key)) ||
      options.selectedKey === point.key;
    let emphasis: GraphPointEmphasis =
      options.selectedFamilyName === point.item.meta.family_name
        ? 'family'
        : 'none';
    if (options.selectedAliasSourceKey === point.key) {
      emphasis = 'alias-source';
    } else if (options.selectedKey === point.key) {
      emphasis = 'selected';
    }

    return {
      point,
      showSample,
      showLabel: options.showLabels && options.visibleDetailKeys.has(point.key),
      showCore: options.showCores && !showSample,
      isActive: options.activeKeys.has(point.key),
      emphasis,
    };
  });
}
