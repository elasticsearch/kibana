/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { TypedLensSerializedState, XYPersistedState } from '@kbn/lens-common';
import type { SavedObjectReference } from '@kbn/core/server';
import type { XYConfig } from '../../schema';
import {
  getSharedChartLensStateToAPI,
  getSharedChartAPIToLensState,
  getDatasourceLayers,
} from './utils';
import type { LensAttributes } from '../../types';
import { buildDatasourceStates, buildReferences, getAdhocDataviews } from '../utils';
import { buildVisualizationAPI, buildVisualizationState } from './xy/chart';
import { buildFormBasedXYLayer, getValueColumns } from './xy/state_layers';
import { getIdForLayer, isAPIAnnotationLayer } from './xy/helpers';

type XYLens = Extract<TypedLensSerializedState['attributes'], { visualizationType: 'lnsXY' }>;
type XYLensState = Omit<XYLens['state'], 'filters' | 'query'>;

type XYLensWithoutQueryAndFilters = Omit<XYLens, 'state'> & {
  // Use XYPersistedState for visualization since the config builder works with persisted format
  state: Omit<XYLensState, 'visualization'> & { visualization: XYPersistedState };
};

export function fromAPItoLensState(config: XYConfig): XYLensWithoutQueryAndFilters {
  // convert layers and produce references from them
  const { layers, usedDataviews } = buildDatasourceStates(
    config,
    buildFormBasedXYLayer,
    getValueColumns
  );

  // By-value annotation layers persist their data view under the
  // `xy-visualization-layer-` reference name (regular and ad hoc alike), matching
  // Lens's own persistence logic so the XY runtime can resolve it. A manual-only
  // layer carries no data view at all and emits no such reference; the runtime
  // then falls back to the first index-pattern reference at load time (see
  // x-pack/.../lens/public/visualizations/xy/persistence.ts).
  const annotationLayerIds = new Set(
    config.layers
      .map((layer, index) =>
        isAPIAnnotationLayer(layer) && !('group_id' in layer)
          ? getIdForLayer(layer, index)
          : undefined
      )
      .filter((id): id is string => id != null)
  );

  const { adHocDataViews, internalReferences } = getAdhocDataviews(
    usedDataviews,
    annotationLayerIds
  );

  const regularDataViews = Object.entries(usedDataviews).filter(
    (v): v is [string, { id: string; type: 'dataView' }] => v[1].type === 'dataView'
  );

  const regularDataViewsMap = Object.fromEntries(
    regularDataViews.map(([key, { id }]) => [key, id])
  );

  const annotationGroupReferences: SavedObjectReference[] = [];

  const visualizationState = buildVisualizationState(config, annotationGroupReferences);

  const references = [
    ...annotationGroupReferences,
    ...buildReferences(regularDataViewsMap, annotationLayerIds),
  ];

  return {
    visualizationType: 'lnsXY',
    ...getSharedChartAPIToLensState(config),
    state: {
      datasourceStates: layers,
      ...(internalReferences.length ? { internalReferences } : {}),
      visualization: visualizationState,
      adHocDataViews,
    },
    references,
  };
}

export function fromLensStateToAPI(config: LensAttributes): XYConfig {
  const { state } = config;
  const visualizationState = state.visualization as XYPersistedState;
  const layers = getDatasourceLayers(state);

  return {
    ...getSharedChartLensStateToAPI(config),
    ...buildVisualizationAPI(
      visualizationState,
      layers,
      config.state.adHocDataViews ?? {},
      config.references,
      config.state.internalReferences ?? []
    ),
  };
}
