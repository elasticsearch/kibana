/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  FormBasedLayer,
  FormBasedPersistedState,
  ChoroplethChartState,
  PersistedIndexPatternLayer,
  TextBasedLayer,
  TypedLensSerializedState,
} from '@kbn/lens-common';
import type { DataViewSpec } from '@kbn/data-views-plugin/common';
import type { SavedObjectReference } from '@kbn/core/types';
import { LENS_ITEM_LATEST_VERSION } from '@kbn/lens-common/content_management/constants';
import type {
  LensApiConfig,
  RegionMapConfig,
  LensApiBucketOperations,
  RegionMapConfigESQL,
  RegionMapConfigNoESQL,
  LensApiFieldMetricOrFormulaOperation,
} from '../../schema';
import type { LensAttributes } from '../../types';
import { DEFAULT_LAYER_ID } from '../../constants';
import {
  addLayerColumn,
  buildDataSourceState,
  buildDatasourceStates,
  buildReferences,
  generateApiLayer,
  generateLayer,
  getAdhocDataviews,
  operationFromColumn,
  isTextBasedLayer,
} from '../utils';
import { getValueApiColumn, getValueColumn } from '../columns/esql_column';
import { fromMetricAPItoLensState } from '../columns/metric';
import { fromBucketLensApiToLensState } from '../columns/buckets';
import {
  getDatasourceLayers,
  getLensStateLayer,
  getSharedChartAPIToLensState,
  getSharedChartLensStateToAPI,
} from './utils';

const ACCESSOR = 'region_map_accessor';
function getAccessorName(type: 'metric' | 'region') {
  return `${ACCESSOR}_${type}`;
}

function buildVisualizationState(config: RegionMapConfig): ChoroplethChartState {
  const layer = config;

  return {
    layerId: DEFAULT_LAYER_ID,
    valueAccessor: getAccessorName('metric'),
    regionAccessor: getAccessorName('region'),
    ...(layer.region.ems
      ? { emsLayerId: layer.region.ems.boundaries, emsField: layer.region.ems.join }
      : {}),
  };
}

function getRegionMapDataset(
  layer: Omit<FormBasedLayer, 'indexPatternId'> | TextBasedLayer,
  adHocDataViews: Record<string, DataViewSpec>,
  references: SavedObjectReference[],
  adhocReferences: SavedObjectReference[] = [],
  layerId: string
): RegionMapConfig['data_source'] {
  const dataSource = buildDataSourceState(
    layer,
    layerId,
    adHocDataViews,
    references,
    adhocReferences
  );

  if (!dataSource || dataSource.type == null) {
    throw new Error('Unsupported DataSource type');
  }

  return dataSource;
}

function getRegionMapMetric(
  layer: Omit<FormBasedLayer, 'indexPatternId'> | TextBasedLayer,
  visualization: ChoroplethChartState
): RegionMapConfig['metric'] {
  if (visualization.valueAccessor == null) {
    throw new Error('Metric accessor is missing in the visualization state');
  }

  return isTextBasedLayer(layer)
    ? getValueApiColumn(visualization.valueAccessor, layer)
    : (operationFromColumn(
        visualization.valueAccessor,
        layer
      ) as LensApiFieldMetricOrFormulaOperation);
}

function getRegionMapRegion(
  layer: Omit<FormBasedLayer, 'indexPatternId'> | TextBasedLayer,
  visualization: ChoroplethChartState
): RegionMapConfig['region'] {
  if (visualization.regionAccessor == null) {
    throw new Error('Region accessor is missing in the visualization state');
  }

  return {
    ...(isTextBasedLayer(layer)
      ? getValueApiColumn(visualization.regionAccessor, layer)
      : (operationFromColumn(visualization.regionAccessor, layer) as LensApiBucketOperations)),
    ...(visualization.emsLayerId && visualization.emsField
      ? { ems: { boundaries: visualization.emsLayerId, join: visualization.emsField } }
      : {}),
  };
}

function reverseBuildVisualizationState(
  visualization: ChoroplethChartState,
  layer: Omit<FormBasedLayer, 'indexPatternId'> | TextBasedLayer,
  layerId: string,
  adHocDataViews: Record<string, DataViewSpec>,
  references: SavedObjectReference[],
  adhocReferences?: SavedObjectReference[]
): RegionMapConfig {
  const dataSource = getRegionMapDataset(
    layer,
    adHocDataViews,
    references,
    adhocReferences,
    layerId
  );
  const metric = getRegionMapMetric(layer, visualization);
  const region = getRegionMapRegion(layer, visualization);

  return {
    type: 'region_map',
    data_source: dataSource,
    ...generateApiLayer(layer),
    metric,
    region,
  } as RegionMapConfig;
}

function buildFormBasedLayer(layer: RegionMapConfigNoESQL): FormBasedPersistedState['layers'] {
  const columns = fromMetricAPItoLensState(layer.metric);

  const layers: Record<string, PersistedIndexPatternLayer> = generateLayer(DEFAULT_LAYER_ID, layer);
  const defaultLayer = layers[DEFAULT_LAYER_ID];

  addLayerColumn(defaultLayer, getAccessorName('metric'), columns);
  const breakdownColumn = fromBucketLensApiToLensState(
    layer.region,
    columns.map((col) => ({ column: col, id: getAccessorName('metric') }))
  );
  addLayerColumn(defaultLayer, getAccessorName('region'), breakdownColumn, true);

  return layers;
}

function getValueColumns(layer: RegionMapConfigESQL) {
  return [
    getValueColumn(getAccessorName('metric'), layer.metric, 'number'),
    getValueColumn(getAccessorName('region'), layer.region),
  ];
}

type RegionMapAttributes = Extract<
  TypedLensSerializedState['attributes'],
  { visualizationType: 'lnsChoropleth' }
>;

type RegionMapAttributesWithoutFiltersAndQuery = Omit<RegionMapAttributes, 'state'> & {
  state: Omit<RegionMapAttributes['state'], 'filters' | 'query'>;
};

export function fromAPItoLensState(
  config: RegionMapConfig
): RegionMapAttributesWithoutFiltersAndQuery {
  const _buildDataLayer = (cfg: unknown, i: number) =>
    buildFormBasedLayer(cfg as RegionMapConfigNoESQL);

  const { layers, usedDataviews } = buildDatasourceStates(config, _buildDataLayer, getValueColumns);

  const visualization = buildVisualizationState(config);

  const { adHocDataViews, internalReferences } = getAdhocDataviews(usedDataviews);
  const regularDataViews = Object.values(usedDataviews).filter(
    (v): v is { id: string; type: 'dataView' } => v.type === 'dataView'
  );
  const references = regularDataViews.length
    ? buildReferences({ [DEFAULT_LAYER_ID]: regularDataViews[0]?.id })
    : [];

  return {
    visualizationType: 'lnsChoropleth',
    ...getSharedChartAPIToLensState(config),
    references,
    state: {
      datasourceStates: layers,
      internalReferences,
      visualization,
      adHocDataViews,
    },
    version: LENS_ITEM_LATEST_VERSION,
  };
}

export function fromLensStateToAPI(
  config: LensAttributes
): Extract<LensApiConfig, { type: 'region_map' }> {
  const { state } = config;
  const visualization = state.visualization as ChoroplethChartState;
  const layers = getDatasourceLayers(state);
  const [layerId, layer] = getLensStateLayer(layers, visualization.layerId);

  const visualizationState = {
    ...getSharedChartLensStateToAPI(config),
    ...reverseBuildVisualizationState(
      visualization,
      layer,
      layerId ?? DEFAULT_LAYER_ID,
      config.state.adHocDataViews ?? {},
      config.references,
      config.state.internalReferences
    ),
  };

  return visualizationState;
}
