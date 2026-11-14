import { createMemo, createRoot } from 'solid-js';
import { appState } from '@/store';
import { createDendrogramTopology } from '@/components/graph/dendrogram-topology';
import {
  createRadialTreeLayout,
  type RadialTreeLayout,
} from './radial-tree-layout';
import {
  createScatterPlotLayout,
  type ScatterPlotLayout,
} from './scatter-plot-layout';
import {
  createHorizontalTreeLayout,
  type HorizontalTreeLayout,
} from './horizontal-tree-layout';

export type GraphLayout =
  | RadialTreeLayout
  | HorizontalTreeLayout
  | ScatterPlotLayout;

const layoutState = createRoot(() => {
  const topology = createMemo(() => {
    const dendrogram = appState.dendrogram;
    return dendrogram
      ? createDendrogramTopology(dendrogram, appState.fonts.displayData)
      : null;
  });

  const layout = createMemo<GraphLayout | null>(() => {
    switch (appState.ui.graphMode) {
      case 'radial-tree': {
        const currentTopology = topology();
        return currentTopology ? createRadialTreeLayout(currentTopology) : null;
      }
      case 'horizontal-tree': {
        const currentTopology = topology();
        return currentTopology
          ? createHorizontalTreeLayout(currentTopology)
          : null;
      }
      case 'scatter-plot':
        return createScatterPlotLayout(appState.fonts.displayData);
    }
  });
  return layout;
});

export const activeGraphLayout = layoutState;

export const dendrogramTreeLayout = ():
  | RadialTreeLayout
  | HorizontalTreeLayout
  | null => {
  const layout = layoutState();
  return layout?.mode === 'radial-tree' || layout?.mode === 'horizontal-tree'
    ? layout
    : null;
};
