/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { LENS_DATASOURCE_ID } from '@kbn/lens-common';

import type { SavedObjectReference } from '@kbn/core-saved-objects-common/src/server_types';
import type {
  FormBasedLayer,
  FormBasedPersistedState,
  GenericIndexPatternColumn,
  PersistedIndexPatternLayer,
  TextBasedLayer,
  TextBasedLayerColumn,
  TextBasedPersistedState,
  LensDatasourceId,
} from '@kbn/lens-common';
import { cleanupFormulaReferenceColumns } from '@kbn/lens-common';
import { getIndexPatternFromESQLQuery, getTimeFieldFromESQLQuery } from '@kbn/esql-utils';
import { Sha256 } from '@kbn/crypto-browser';
import type { DataViewSpec } from '@kbn/data-views-plugin/common';
import { FILTERS, isOfAggregateQueryType, type Filter, type Query } from '@kbn/es-query';
import type { AsCodeFilter } from '@kbn/as-code-filters-schema';
import { fromStoredFilters, toStoredFilters } from '@kbn/as-code-filters-transforms';
import {
  AS_CODE_DATA_VIEW_REFERENCE_TYPE,
  AS_CODE_DATA_VIEW_SPEC_TYPE,
} from '@kbn/as-code-data-views-schema';
import type { AsCodeDataViewReference } from '@kbn/as-code-data-views-schema';
import type { LensAttributes } from '../types';
import type { LensApiAllOperations, LensApiConfig, NarrowByType } from '../schema';
import { fromBucketLensStateToAPI } from './columns/buckets';
import { getMetricApiColumnFromLensState } from './columns/metric';
import type { AnyLensStateColumn, APIAdHocDataView, APIDataView } from './columns/types';
import { isLensStateBucketColumnType } from './columns/utils';
import {
  LENS_LAYER_SUFFIX,
  LENS_XY_ANNOTATION_LAYER_SUFFIX,
  LENS_DEFAULT_TIME_FIELD,
  INDEX_PATTERN_ID,
} from './constants';
import {
  LENS_SAMPLING_DEFAULT_VALUE,
  LENS_IGNORE_GLOBAL_FILTERS_DEFAULT_VALUE,
} from '../schema/constants';
import type { LayerSettingsSchema } from '../schema/shared';
import type { LensApiFilterType } from '../schema/filter';
import type {
  DataSourceType,
  DataSourceTypeESQL,
  DataSourceTypeNoESQL,
} from '../schema/data_source';
import type { DataLayerTypeESQL } from '../schema/charts/xy';
import type { XScaleSchemaType } from '../schema/charts/shared';
import { fromFilterLensStateToAPI, toLensStateFilterLanguage } from './columns/filter';

export type DataSourceStateLayer =
  | FormBasedPersistedState['layers'] // metric chart can return 2 layers (one for the metric and one for the trendline)
  | PersistedIndexPatternLayer
  | TextBasedPersistedState['layers'][0];

function createDataViewReference(dataViewId: string, layerId: string): SavedObjectReference {
  return {
    type: INDEX_PATTERN_ID,
    id: dataViewId,
    name: `${LENS_LAYER_SUFFIX}${layerId}`,
  };
}

function createAnnotationLayerDataViewReference(
  dataViewId: string,
  layerId: string
): SavedObjectReference {
  return {
    type: INDEX_PATTERN_ID,
    id: dataViewId,
    name: `${LENS_XY_ANNOTATION_LAYER_SUFFIX}${layerId}`,
  };
}

// Need to dance a bit to satisfy TypeScript
function convertToTypedLayerColumns(layer: Omit<FormBasedLayer, 'indexPatternId'>): {
  columns: Record<string, AnyLensStateColumn>;
} {
  // @TODO move it to satisfies
  return layer as { columns: Record<string, AnyLensStateColumn> };
}

/**
 * given Lens State layer and column id, returns the corresponding Lens API operation
 * @param columnId
 * @param layer
 * @returns
 */
export const operationFromColumn = (
  columnId: string,
  layer: Omit<FormBasedLayer, 'indexPatternId'>
): LensApiAllOperations | undefined => {
  const cleanedLayer = cleanupFormulaReferenceColumns(layer);
  const typedLayer = convertToTypedLayerColumns(cleanedLayer);
  const column = typedLayer.columns[columnId];
  if (!column) return;

  // map columns to array of { column, id } in columnOrder sequence (matches visualization.columns order)
  const columnMap = cleanedLayer.columnOrder
    .filter((id) => cleanedLayer.columns[id] != null)
    .map((id) => ({
      // need to cast here as the GenericIndexPatternColumn type is not compatible with Reference based column types
      column: cleanedLayer.columns[id] as AnyLensStateColumn,
      id,
    }));

  if (isLensStateBucketColumnType(column)) {
    return fromBucketLensStateToAPI(column, columnMap);
  }
  return getMetricApiColumnFromLensState(column, typedLayer.columns);
};

export function isFormBasedLayer(
  layer: DataSourceStateLayer
): layer is Omit<FormBasedLayer, 'indexPatternId'> {
  return 'columnOrder' in layer;
}

export function isTextBasedLayer(layer: DataSourceStateLayer): layer is TextBasedLayer {
  return 'columns' in layer && Array.isArray(layer.columns) && 'query' in layer;
}

function sha256Sync(str: string): string {
  return new Sha256().update(str).digest('hex');
}

// Normalize whitespace and convert to lowercase to make the id more predictable and hit cache more often
function normalizeWhitespace(str: string): string {
  return str.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function generateAdHocDataViewId(
  dataView: Pick<APIAdHocDataView, 'index' | 'timeFieldName' | 'esqlQuery' | 'dataSourceType'>
): string {
  const base = `${dataView.index}${dataView.timeFieldName ? `-${dataView.timeFieldName}` : ''}`;
  // When timeFieldName is not explicitly provided in the query, then it is not persisted during the transformations and
  // at runtime we fallback to @timestamp if it exists in the index.
  // But different ES|QL queries against the same index can resolve to different time fields. See: https://github.com/elastic/kibana/pull/256764
  // Including a hash of the query in the ID ensures each distinct query gets its own cached DataView, preventing stale time-field resolution.
  if (dataView.dataSourceType === 'esql' && !dataView.timeFieldName && dataView.esqlQuery) {
    return `${base}-${sha256Sync(normalizeWhitespace(dataView.esqlQuery))}`;
  }
  return base;
}

export function getAdHocDataViewSpec(dataView: APIAdHocDataView) {
  return {
    // Improve id genertation to be more predictable and hit cache more often
    id: generateAdHocDataViewId(dataView),
    title: dataView.index,
    name: dataView.index,
    timeFieldName: dataView.timeFieldName,
    sourceFilters: [],
    fieldFormats: {},
    runtimeFieldMap: {},
    fieldAttrs: {},
    allowNoIndex: false,
    allowHidden: false,
    ...(dataView.dataSourceType ? { type: dataView.dataSourceType } : {}),
  };
}

export const getAdhocDataviews = (
  dataviews: Record<string, APIDataView | APIAdHocDataView>,
  annotationLayerIds: ReadonlySet<string> = new Set()
) => {
  // filter out ad hoc dataViews only
  const adHocDataViewsFiltered = Object.entries(dataviews).filter(
    ([_layerId, dataViewEntry]) => dataViewEntry.type === 'adHocDataView'
  ) as [string, APIAdHocDataView][];

  const internalReferencesMap = new Map<APIAdHocDataView, { layerIds: string[]; id: string }>();

  // dedupe and map multiple layer references to the same ad hoc dataview
  for (const [layerId, dataViewEntry] of adHocDataViewsFiltered) {
    if (!internalReferencesMap.has(dataViewEntry)) {
      internalReferencesMap.set(dataViewEntry, {
        layerIds: [],
        id: generateAdHocDataViewId(dataViewEntry),
      });
    }
    const internalRef = internalReferencesMap.get(dataViewEntry)!;
    internalRef.layerIds.push(layerId);
  }

  const adHocDataViews: Record<string, DataViewSpec> = {};
  const internalReferences: SavedObjectReference[] = [];
  for (const [baseSpec, { layerIds, id }] of Array.from(internalReferencesMap.entries())) {
    adHocDataViews[id] = getAdHocDataViewSpec(baseSpec);
    for (const layerId of layerIds) {
      // XY annotation layers reference their data view (ad hoc included) under the
      // `xy-visualization-layer-` name, matching Lens's own persistence logic, so
      // the runtime can resolve it. Other layers use the default datasource name.
      internalReferences.push(
        annotationLayerIds.has(layerId)
          ? createAnnotationLayerDataViewReference(id, layerId)
          : createDataViewReference(id, layerId)
      );
    }
  }

  return { adHocDataViews, internalReferences };
};

export function buildDataSourceStateESQL(layer: TextBasedLayer): DataSourceTypeESQL {
  return {
    type: 'esql',
    query: layer.query?.esql ?? '',
  };
}

export function isDataViewSpec(spec: unknown): spec is DataViewSpec {
  return spec != null && typeof spec === 'object' && 'title' in spec;
}

function getReferenceCriteria(layerId: string) {
  return (ref: SavedObjectReference) => ref.name === `${LENS_LAYER_SUFFIX}${layerId}`;
}

export function buildDataSourceStateNoESQL(
  layer: FormBasedLayer | Omit<FormBasedLayer, 'indexPatternId'>,
  layerId: string,
  adHocDataViews: Record<string, unknown>,
  references: SavedObjectReference[],
  adhocReferences: SavedObjectReference[] = []
): DataSourceTypeNoESQL {
  const referenceCriteria = getReferenceCriteria(layerId);
  const adhocReference = adhocReferences?.find(referenceCriteria);

  if (adhocReference && adHocDataViews?.[adhocReference.id]) {
    const dataViewSpec = adHocDataViews[adhocReference.id];
    if (isDataViewSpec(dataViewSpec) && dataViewSpec.title) {
      return {
        type: AS_CODE_DATA_VIEW_SPEC_TYPE,
        index_pattern: dataViewSpec.title,
        time_field: dataViewSpec.timeFieldName,
      };
    }
  }

  const reference = references?.find(referenceCriteria);
  if (reference) {
    return {
      type: AS_CODE_DATA_VIEW_REFERENCE_TYPE,
      ref_id: reference.id,
    };
  }

  return {
    type: AS_CODE_DATA_VIEW_REFERENCE_TYPE,
    ref_id: 'indexPatternId' in layer ? layer.indexPatternId ?? '' : '',
  };
}

/**
 * Builds Data Source State from the layer configuration
 *
 * @deprecated use `buildDatasetStateESQL` or `buildDatasetStateNoESQL` instead
 */
export function buildDataSourceState(
  layer: FormBasedLayer | Omit<FormBasedLayer, 'indexPatternId'> | TextBasedLayer,
  layerId: string,
  adHocDataViews: Record<string, unknown>,
  references: SavedObjectReference[],
  adhocReferences: SavedObjectReference[] = []
): DataSourceType {
  if (isTextBasedLayer(layer)) {
    return buildDataSourceStateESQL(layer);
  }

  return buildDataSourceStateNoESQL(layer, layerId, adHocDataViews, references, adhocReferences);
}

/**
 * Builds Lens State data view references from a `{ layerId => dataViewId }` map.
 *
 * Most layers persist their data view under the `indexpattern-datasource-layer-`
 * reference name. By-value XY annotation layers are the exception: their data
 * view must be persisted under the `xy-visualization-layer-` name so the XY
 * runtime can resolve it (otherwise it falls back to the first index-pattern
 * reference and the panel fails to render). Pass those layer ids via
 * `annotationLayerIds` so they get the correct prefix.
 * See x-pack/.../lens/public/visualizations/xy/persistence.ts and
 * https://github.com/elastic/kibana/issues/268821.
 */
export function buildReferences(
  dataviews: Record<string, string>,
  annotationLayerIds: ReadonlySet<string> = new Set()
): SavedObjectReference[] {
  return Object.entries(dataviews).map(([layerId, dataViewId]) =>
    annotationLayerIds.has(layerId)
      ? createAnnotationLayerDataViewReference(dataViewId, layerId)
      : createDataViewReference(dataViewId, layerId)
  );
}

export function isSingleLayer(
  layer: DataSourceStateLayer
): layer is PersistedIndexPatternLayer | TextBasedPersistedState['layers'][0] {
  return layer && typeof layer === 'object' && ('columnOrder' in layer || 'columns' in layer);
}

/**
 * Gets DataView from the DataSource configuration
 *
 * @param dataSource
 * @param dataViewsAPI
 * @returns
 */
export function getDataSourceIndex(dataSource: DataSourceType) {
  const timeFieldName: string = LENS_DEFAULT_TIME_FIELD;
  switch (dataSource.type) {
    case AS_CODE_DATA_VIEW_SPEC_TYPE:
      return {
        index: dataSource.index_pattern,
        timeFieldName: dataSource.time_field ?? timeFieldName,
      };
    case 'esql':
      return {
        index: getIndexPatternFromESQLQuery(dataSource.query),
        timeFieldName: getTimeFieldFromESQLQuery(dataSource.query),
        esqlQuery: dataSource.query,
      };
    case AS_CODE_DATA_VIEW_REFERENCE_TYPE:
      return {
        index: dataSource.ref_id,
        timeFieldName,
      };
    default:
      throw Error('Data Source type not supported');
  }
}

// internal function used to build datasource states layer
function buildDatasourceStatesLayer(
  layer: unknown,
  i: number,
  dataSource: DataSourceType,
  dataSourceIndex: { index: string; timeFieldName: string | undefined; esqlQuery?: string },
  buildDataLayer: (
    config: unknown,
    i: number,
    index: { index: string; timeFieldName: string | undefined }
  ) => FormBasedPersistedState['layers'] | PersistedIndexPatternLayer | undefined,
  getValueColumns: (
    layer: unknown,
    i: number,
    xAxisScale?: XScaleSchemaType
  ) => TextBasedLayerColumn[], // ValueBasedLayerColumn[]
  fullConfig: LensApiConfig
): [LensDatasourceId, DataSourceStateLayer | undefined] {
  function buildESQLLayer(
    config: unknown,
    ds: NarrowByType<DataSourceType, 'esql'>
  ): TextBasedPersistedState['layers'][0] {
    const layerWithSettings = config as Partial<LayerSettingsSchema>;
    const xAxisScale =
      fullConfig.type === 'xy' && fullConfig.axis?.x ? fullConfig.axis.x.scale : undefined;
    const columns = getValueColumns(config, i, xAxisScale);

    return {
      index: generateAdHocDataViewId({ ...dataSourceIndex, dataSourceType: 'esql' }),
      query: { esql: ds.query },
      timeField: dataSourceIndex.timeFieldName || undefined,
      columns,
      ignoreGlobalFilters: layerWithSettings.ignore_global_filters,
    };
  }

  if (dataSource.type === 'esql') {
    return [LENS_DATASOURCE_ID.TEXT_BASED, buildESQLLayer(layer, dataSource)];
  }
  return [LENS_DATASOURCE_ID.FORM_BASED, buildDataLayer(layer, i, dataSourceIndex)];
}

/**
 * Builds lens config datasource states from LensApiConfig
 *
 * @param config lens api state
 * @param dataviews list to which dataviews are added
 * @param buildFormulaLayers function used when data_source type is index or dataView
 * @param getValueColumns function used when data_source type is table or esql
 * @param dataViewsAPI dataViews service
 * @returns lens datasource states
 *
 */
export const buildDatasourceStates = (
  config: LensApiConfig,
  buildDataLayers: (
    config: unknown,
    i: number,
    index: { index: string; timeFieldName: string | undefined }
  ) => PersistedIndexPatternLayer | FormBasedPersistedState['layers'] | undefined,
  getValueColumns: (config: any, i: number, xAxisScale?: XScaleSchemaType) => TextBasedLayerColumn[]
): {
  layers: LensAttributes['state']['datasourceStates'];
  usedDataviews: Record<string, APIDataView | APIAdHocDataView>;
} => {
  let layers: Partial<LensAttributes['state']['datasourceStates']> = {};

  // XY charts have data_source encoded per layer not at the root level
  const mainDataset = ('data_source' in config && config.data_source) || undefined;
  const usedDataviews: Record<string, APIDataView | APIAdHocDataView> = {};
  // a few charts types support multiple layers
  const hasMultipleLayers = 'layers' in config;
  const configLayers = hasMultipleLayers ? config.layers : [config];

  for (let layerPosition = 0; layerPosition < configLayers.length; layerPosition++) {
    const layer = configLayers[layerPosition];
    const layerId =
      hasMultipleLayers && 'type' in layer
        ? `${layer.type}_${layerPosition}`
        : `layer_${layerPosition}`;
    const dataSource = 'data_source' in layer ? layer.data_source : mainDataset;

    if (!dataSource) {
      if ('type' in layer && layer.type === 'annotation_group' && 'group_id' in layer) {
        // by-ref annotation layers don't require a data_source
        continue;
      }
      if ('type' in layer && layer.type === 'annotations') {
        // Query annotations actually query an index, so they require a data
        // source. Manual point/range annotations are positioned purely by
        // timestamp and may omit their data_source: they share the data view of
        // the chart's data layers, which the Lens XY runtime resolves at load
        // time. Either way an annotation layer produces no datasource state, so
        // there's nothing to build here.
        const hasQueryEvent =
          'events' in layer &&
          Array.isArray(layer.events) &&
          layer.events.some((event) => event?.type === 'query');
        if (hasQueryEvent) {
          throw Error('A data source is required for annotation layers with query events');
        }
        continue;
      }
      throw Error('DataSource must be defined');
    }

    // This datasetIndex is always defined, but it can be empty if the data_source is a table
    // TODO evaluate the table data_source type and return the correct data_source index
    const dataSourceIndex = getDataSourceIndex(dataSource);
    if (!dataSourceIndex) {
      throw Error('DataSource index must be defined');
    }

    const [type, layerConfig] = buildDatasourceStatesLayer(
      layer,
      layerPosition,
      dataSource,
      dataSourceIndex,
      buildDataLayers,
      getValueColumns,
      config
    );
    if (layerConfig) {
      layers = {
        ...layers,
        [type]: {
          layers: isSingleLayer(layerConfig)
            ? { ...layers[type]?.layers, [layerId]: layerConfig }
            : // metric chart can return 2 layers (one for the metric and one for the trendline)
              { ...layers[type]?.layers, ...layerConfig },
        },
      };

      // keep record of all dataviews used by layers
      const newLayerIds =
        isSingleLayer(layerConfig) || Object.keys(layerConfig).length === 0
          ? [layerId]
          : Object.keys(layerConfig);
      for (const id of newLayerIds) {
        usedDataviews[id] =
          dataSource.type === AS_CODE_DATA_VIEW_REFERENCE_TYPE
            ? { type: 'dataView', id: (dataSource as AsCodeDataViewReference).ref_id }
            : {
                type: 'adHocDataView',
                ...dataSourceIndex,
                ...(dataSource.type === 'esql'
                  ? { dataSourceType: 'esql', esqlQuery: dataSource.query }
                  : {}),
              };
      }
    }
  }

  return { layers, usedDataviews };
};

// adds new column to existing layer
export const addLayerColumn = (
  layer: PersistedIndexPatternLayer,
  columnName: string,
  config: GenericIndexPatternColumn | GenericIndexPatternColumn[],
  first = false,
  postfix = ''
) => {
  const [column, referenceColumn] = Array.isArray(config) ? config : [config];
  const name = columnName + postfix;

  layer.columns = {
    ...layer.columns,
    [name]: column,
  };

  const referenceColumnId = `${name}_reference`;
  if (referenceColumn && 'references' in column) {
    column.references = [referenceColumnId];
    layer.columns[referenceColumnId] = referenceColumn;
  }

  if (first) {
    layer.columnOrder.unshift(name);
    if (referenceColumn) {
      layer.columnOrder.unshift(referenceColumnId);
    }
  } else {
    layer.columnOrder.push(name);
    if (referenceColumn) {
      layer.columnOrder.push(referenceColumnId);
    }
  }
};

/**
 * Generates the base layer
 *
 * @param id
 * @param options
 * @returns
 */
export const generateLayer = (
  id: string,
  options: LayerSettingsSchema
): Record<string, PersistedIndexPatternLayer> => {
  return {
    [id]: {
      sampling: options.sampling,
      ignoreGlobalFilters: options.ignore_global_filters,
      columns: {},
      columnOrder: [],
    },
  };
};

export const generateApiLayer = (options: PersistedIndexPatternLayer | TextBasedLayer) => {
  if (!('columnOrder' in options)) {
    return {
      sampling: LENS_SAMPLING_DEFAULT_VALUE,
      ignore_global_filters:
        options.ignoreGlobalFilters ?? LENS_IGNORE_GLOBAL_FILTERS_DEFAULT_VALUE,
    };
  }
  // mind this is already filled by schema validate
  return {
    sampling: options.sampling ?? LENS_SAMPLING_DEFAULT_VALUE,
    ignore_global_filters: options.ignoreGlobalFilters ?? LENS_IGNORE_GLOBAL_FILTERS_DEFAULT_VALUE,
  };
};

function injectFilterReferences(filters: Filter[], references: SavedObjectReference[]): Filter[] {
  const dataViewReferences = references.filter((r) => r.type === INDEX_PATTERN_ID);

  const inject = (filter: Filter): Filter => {
    const injectedParams =
      filter.meta.type === FILTERS.COMBINED && Array.isArray(filter.meta.params)
        ? (filter.meta.params as unknown[]).map((p) => inject(p as Filter))
        : filter.meta.params;

    if (!filter.meta.index) {
      return injectedParams !== undefined
        ? { ...filter, meta: { ...filter.meta, params: injectedParams } }
        : filter;
    }

    const reference = dataViewReferences.find((ref) => ref.name === filter.meta.index);
    return {
      ...filter,
      meta: {
        ...filter.meta,
        // If no reference has been found, keep the current "index" property (used for ad-hoc data views)
        index: reference ? reference.id : filter.meta.index,
        ...(injectedParams !== undefined ? { params: injectedParams } : {}),
      },
    };
  };

  return filters.map(inject);
}

function extractFilterReferences(filters: Filter[], references: SavedObjectReference[]) {
  const extractedReferences: SavedObjectReference[] = [];
  const extract = (filter: Filter): Filter => {
    const extractedParams =
      filter.meta.type === FILTERS.COMBINED && Array.isArray(filter.meta.params)
        ? (filter.meta.params as unknown[]).map((p) => extract(p as Filter))
        : filter.meta.params;

    if (!filter.meta.index || typeof filter.meta.index !== 'string') {
      return extractedParams !== undefined
        ? { ...filter, meta: { ...filter.meta, params: extractedParams } }
        : filter;
    }

    const referenceName = `filter-ref-${filter.meta.index}`;
    const existingRef = extractedReferences.find((r) => r.name === referenceName);

    if (!existingRef) {
      extractedReferences.push({
        type: INDEX_PATTERN_ID,
        name: referenceName,
        id: filter.meta.index,
      });
    }

    return {
      ...filter,
      meta: {
        ...filter.meta,
        index: referenceName,
        ...(extractedParams !== undefined ? { params: extractedParams } : {}),
      },
    };
  };

  return { filters: filters.map(extract), references: extractedReferences };
}

export const queryToLensState = (query: LensApiFilterType): Query => {
  return {
    query: query.expression,
    language: toLensStateFilterLanguage(query.language),
  };
};

export const filtersAndQueryToApiFormat = (
  state: LensAttributes
): {
  filters?: AsCodeFilter[];
  query?: LensApiFilterType;
} => {
  const injectedStoredFilters = injectFilterReferences(
    state.state.filters ?? [],
    state.references ?? []
  );
  const filters = fromStoredFilters(injectedStoredFilters) ?? [];

  const query =
    state.state.query && !isOfAggregateQueryType(state.state.query)
      ? fromFilterLensStateToAPI(state.state.query)
      : undefined;

  return {
    ...(filters.length ? { filters } : {}),
    ...(query?.expression.length ? { query } : {}),
  };
};

function extraQueryFromAPIState(state: LensApiConfig): { esql: string } | Query | undefined {
  if ('data_source' in state && state.data_source.type === 'esql') {
    return { esql: state.data_source.query };
  }
  if ('layers' in state && Array.isArray(state.layers)) {
    // pick only the first one for now
    const esqlLayer = state.layers.find(
      (layer): layer is DataLayerTypeESQL =>
        layer.type !== 'reference_lines' &&
        layer.type !== 'annotations' &&
        'data_source' in layer &&
        layer.data_source?.type === 'esql'
    );
    if (esqlLayer && 'query' in esqlLayer.data_source) {
      return { esql: esqlLayer.data_source.query };
    }
  }
  if ('query' in state && state.query) {
    return queryToLensState(state.query satisfies LensApiFilterType);
  }
  return undefined;
}

export const filtersAndQueryToLensState = (
  state: LensApiConfig,
  references: SavedObjectReference[]
) => {
  const query = extraQueryFromAPIState(state);
  const convertedFilters = state.filters
    ? toStoredFilters(state.filters as AsCodeFilter[]) ?? []
    : [];
  const { filters: extractedFilters, references: extractedReferences } = extractFilterReferences(
    convertedFilters,
    references
  );

  return {
    references: extractedReferences,
    filters: extractedFilters,
    ...(query ? { query } : {}),
  };
};

export type DeepMutable<T> = T extends (...args: never[]) => unknown
  ? T // don't mutate functions
  : T extends ReadonlyArray<infer U>
  ? DeepMutable<U>[] // handle readonly arrays
  : T extends object
  ? {
      -readonly [P in keyof T]: DeepMutable<T[P]>;
    }
  : T;

export type DeepPartial<T> = T extends (...args: never[]) => unknown
  ? T // don't mutate functions
  : T extends ReadonlyArray<infer U>
  ? DeepPartial<U>[] // handle readonly arrays
  : T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

export function nonNullable<T>(v: T): v is NonNullable<T> {
  return v != null;
}
