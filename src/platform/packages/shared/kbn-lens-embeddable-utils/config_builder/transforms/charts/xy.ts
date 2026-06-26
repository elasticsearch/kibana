/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { TypedLensSerializedState, XYPersistedState } from '@kbn/lens-common';
import { LENS_ITEM_LATEST_VERSION } from '@kbn/lens-common/content_management/constants';
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
import { LENS_LAYER_SUFFIX } from '../constants';

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

  const { adHocDataViews, internalReferences } = getAdhocDataviews(usedDataviews);

  const regularDataViews = Object.entries(usedDataviews).filter(
    (v): v is [string, { id: string; type: 'dataView' }] => v[1].type === 'dataView'
  );

  const regularDataViewsMap = Object.fromEntries(
    regularDataViews.map(([key, { id }]) => [key, id])
  );
  // merge both internal references and regularDataViews into a single map { layerId => dataViewId }
  const dataViewLayerToIdMap: Record<string, string> = Object.fromEntries([
    ...Object.entries(regularDataViewsMap).map(([layerId, dataViewId]) => [layerId, dataViewId]),
    ...internalReferences.map((ref) => [ref.name.replace(LENS_LAYER_SUFFIX, ''), ref.id]),
  ]);

  const annotationGroupReferences: SavedObjectReference[] = [];

  const visualizationState = buildVisualizationState(
    config,
    dataViewLayerToIdMap,
    annotationGroupReferences
  );

  const references = [
    ...annotationGroupReferences,
    ...(regularDataViews.length ? buildReferences(regularDataViewsMap) : []),
  ];

  return {
    visualizationType: 'lnsXY',
    version: LENS_ITEM_LATEST_VERSION,
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
