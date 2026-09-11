/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import memoizeOne from 'memoize-one';
import type {
  Datasource,
  DatasourceMap,
  DatasourceLayers,
  DatasourceStates,
  DataViewsState,
  FramePublicAPI,
  TableInspectorAdapter,
} from '@kbn/lens-common';

/**
 * Creates an updated FramePublicAPI with the new datasource state for a specific layer.
 */
export function getUpdatedFrameWithDatasourceState(
  framePublicAPI: FramePublicAPI,
  datasource: Datasource,
  newDatasourceState: unknown,
  layerId: string
): FramePublicAPI {
  const updatedDatasourceLayer = datasource.getPublicAPI({
    state: newDatasourceState,
    layerId,
    indexPatterns: framePublicAPI.dataViews.indexPatterns,
    activeDataTable: framePublicAPI.activeData?.[layerId],
  });
  return {
    ...framePublicAPI,
    datasourceLayers: {
      ...framePublicAPI.datasourceLayers,
      [layerId]: updatedDatasourceLayer,
    },
  };
}

export const getDatasourceLayers = memoizeOne(function getDatasourceLayers(
  datasourceStates: DatasourceStates,
  datasourceMap: DatasourceMap,
  indexPatterns: DataViewsState['indexPatterns'],
  activeData?: TableInspectorAdapter
): DatasourceLayers {
  const datasourceLayers: DatasourceLayers = {};
  Object.keys(datasourceMap)
    .filter((id) => datasourceStates[id] && !datasourceStates[id].isLoading)
    .forEach((id) => {
      const datasourceState = datasourceStates[id].state;
      const datasource = datasourceMap[id];

      const layers = datasource.getLayers(datasourceState);
      layers.forEach((layer) => {
        datasourceLayers[layer] = datasourceMap[id].getPublicAPI({
          state: datasourceState,
          layerId: layer,
          indexPatterns,
          activeDataTable: activeData?.[layer],
        });
      });
    });
  return datasourceLayers;
});
