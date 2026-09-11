/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { LENS_DATASOURCE_ID } from '@kbn/lens-common';

import { v4 as uuidv4 } from 'uuid';
import type { SavedObjectReference } from '@kbn/core-saved-objects-common/src/server_types';
import type { DataViewSpec, DataView } from '@kbn/data-views-plugin/public';
import type {
  FormBasedPersistedState,
  GenericIndexPatternColumn,
  PersistedIndexPatternLayer,
  TextBasedLayerColumn,
  TextBasedPersistedState,
  LensDatasourceId,
} from '@kbn/lens-common';
import type { AggregateQuery } from '@kbn/es-query';
import { getIndexPatternFromESQLQuery } from '@kbn/esql-utils';
import type { Reference } from '@kbn/content-management-utils';
import type { DataViewsCommon } from './types';
import type {
  FormulaValueConfig,
  LensAnnotationLayer,
  LensAttributes,
  LensBaseConfig,
  LensBaseLayer,
  LensBaseXYLayer,
  LensConfig,
  LensDataset,
  LensDatatableDataset,
  LensDataviewDataset,
  LensESQLDataset,
} from './types';
import type { LensApiConfig, LensApiConfigESQL, LensApiConfigNoESQL } from './schema';
import type { DataSourceType } from './schema/data_source';

type DataSourceStateLayer =
  | FormBasedPersistedState['layers'] // metric chart can return 2 layers (one for the metric and one for the trendline)
  | PersistedIndexPatternLayer
  | TextBasedPersistedState['layers'][0];

export const getDefaultReferences = (
  index: string,
  dataLayerId: string
): SavedObjectReference[] => {
  return [
    {
      type: 'index-pattern',
      id: index,
      name: `indexpattern-datasource-layer-${dataLayerId}`,
    },
  ];
};

export function mapToFormula(layer: LensBaseLayer): FormulaValueConfig {
  const { label, decimals, format, compactValues: compact, normalizeByUnit, value } = layer;

  const formulaFormat: FormulaValueConfig['format'] | undefined = format
    ? {
        id: format,
        params: {
          decimals: decimals ?? 2,
          ...(!!compact ? { compact } : undefined),
        },
      }
    : undefined;

  return {
    formula: value,
    label,
    timeScale: normalizeByUnit,
    format: formulaFormat,
  };
}

export function extractReferences(dataviews: Record<string, DataView>): {
  references: Reference[];
  internalReferences: Reference[];
  adHocDataViews: Record<string, DataViewSpec>;
} {
  const adHocDataViews = getAdhocDataviews(dataviews);
  return {
    ...buildReferences(dataviews, adHocDataViews),
    adHocDataViews,
  };
}

export function buildReferences(
  dataviews: Record<string, DataView>,
  adHocDataViews: Record<string, DataViewSpec>
): {
  references: Reference[];
  internalReferences: Reference[];
} {
  const references = [];
  const internalReferences = [];

  for (const [layerId, dataview] of Object.entries(dataviews)) {
    if (dataview.id) {
      const defaultRefs = getDefaultReferences(dataview.id, layerId);
      if (adHocDataViews[dataview.id]) {
        internalReferences.push(...defaultRefs);
      } else {
        references.push(...defaultRefs);
      }
    }
  }

  return {
    references: references.flat(),
    internalReferences: internalReferences.flat(),
  };
}

const getAdhocDataView = (dataView: DataView): Record<string, DataViewSpec> => {
  return {
    [dataView.id ?? uuidv4()]: {
      ...dataView.toSpec(false),
    },
  };
};

// Getting the spec from a data view is a heavy operation, that's why the result is cached.
export const getAdhocDataviews = (dataviews: Record<string, DataView>) => {
  let adHocDataViews = {};

  [...Array.from(new Set(Object.values(dataviews)))].forEach((d) => {
    adHocDataViews = {
      ...adHocDataViews,
      ...getAdhocDataView(d),
    };
  });

  return adHocDataViews;
};

export function isSingleLayer(
  layer: DataSourceStateLayer
): layer is PersistedIndexPatternLayer | TextBasedPersistedState['layers'][0] {
  return layer && typeof layer === 'object' && ('columnOrder' in layer || 'columns' in layer);
}

/**
 * Retrieves an existing data view by its title (index) or creates an Ad-Hoc Dataview if it does not exist.
 *
 * Behavior:
 * - If an explicit `id` is provided, a new ad-hoc data view is picked from the cache or created with that `id`.
 * - If no `id` is provided, the function first attempts to retrieve an existing data view whose id matches `index`.
 *   - If retrieval succeeds, the existing data view is returned.
 *   - If retrieval fails (e.g. it does not exist), a new data view is created using `index` as the title.
 *
 * @param params.index The index pattern or title to use for lookup or creation.
 * @param params.timeFieldName The name of the time field to associate with the data view.
 * @param dataViewsAPI The DataViews service API used to get or create data views.
 * @param id Optional explicit id to assign to the data view; if provided, creation is forced.
 * @returns A promise resolving to the retrieved or newly created data view.
 * @throws Re-throws any error coming from the underlying DataViews API when creation fails.
 */
export async function getDataView(
  { index, timeFieldName }: { index: string; timeFieldName: string },
  dataViewsAPI: DataViewsCommon,
  id?: string
) {
  if (id) {
    return dataViewsAPI.create({ id, title: index, timeFieldName });
  }
  try {
    return await dataViewsAPI.get(index, false);
  } catch {
    return dataViewsAPI.create({ title: index, timeFieldName });
  }
}

export function getDatasetIndex(dataset: LensDataset) {
  if (isDataViewDataset(dataset)) {
    return { index: dataset.index, timeFieldName: dataset.timeFieldName ?? '@timestamp' };
  } else if (isESQLDataset(dataset)) {
    return { index: getIndexPatternFromESQLQuery(dataset.esql), timeFieldName: '@timestamp' };
  }
}

function buildDatasourceStatesLayer(
  layer: LensBaseLayer | LensBaseXYLayer,
  i: number,
  dataset: LensDataset,
  dataView: DataView | undefined,
  buildFormulaLayers: (
    config: unknown,
    i: number,
    dataView: DataView
  ) => FormBasedPersistedState['layers'] | PersistedIndexPatternLayer | undefined,
  getValueColumns: (config: unknown, i: number) => TextBasedLayerColumn[] // ValueBasedLayerColumn[]
): [LensDatasourceId, DataSourceStateLayer | undefined] {
  function buildValueLayer(
    config: LensBaseLayer | LensBaseXYLayer
  ): TextBasedPersistedState['layers'][0] {
    const table = dataset as LensDatatableDataset;
    const newLayer = {
      table,
      columns: getValueColumns(layer, i),
      allColumns: table.columns.map(
        (column) =>
          ({
            fieldName: column.name,
            columnId: column.id,
            meta: column.meta,
          } as TextBasedLayerColumn)
      ),
      index: '',
      query: undefined,
    };

    return newLayer;
  }

  function buildESQLLayer(
    config: LensBaseLayer | LensBaseXYLayer
  ): TextBasedPersistedState['layers'][0] {
    const columns = getValueColumns(layer, i);

    const newLayer = {
      index: dataView!.id!,
      query: { esql: (dataset as LensESQLDataset).esql } as AggregateQuery,
      timeField: dataView!.timeFieldName,
      columns,
      allColumns: columns,
    };

    return newLayer;
  }

  if (isESQLDataset(dataset)) {
    return [LENS_DATASOURCE_ID.TEXT_BASED, buildESQLLayer(layer)];
  } else if ('type' in dataset) {
    return [LENS_DATASOURCE_ID.TEXT_BASED, buildValueLayer(layer)];
  }
  return [LENS_DATASOURCE_ID.FORM_BASED, buildFormulaLayers(layer, i, dataView!)];
}
export const buildDatasourceStates = async (
  config:
    | (LensBaseConfig & { layers: Array<LensBaseXYLayer | LensAnnotationLayer> })
    | (LensBaseLayer & LensBaseConfig),
  dataviews: Record<string, DataView>,
  buildFormulaLayers: (
    config: unknown,
    i: number,
    dataView: DataView
  ) => PersistedIndexPatternLayer | FormBasedPersistedState['layers'] | undefined,
  getValueColumns: (config: any, i: number) => TextBasedLayerColumn[],
  dataViewsAPI: DataViewsCommon
) => {
  let layers: Partial<LensAttributes['state']['datasourceStates']> = {};

  const mainDataset = config.dataset;
  const configLayers = 'layers' in config ? config.layers : [config];
  for (let i = 0; i < configLayers.length; i++) {
    const layer = configLayers[i];
    const layerId = `layer_${i}`;

    if ('type' in layer && (layer as LensAnnotationLayer).type === 'annotation') {
      continue; // manual annotations need no data view
    }

    if ('type' in layer && layer.type === 'points') {
      continue; // points layers fetch their own data client-side, no datasource state needed
    }

    const dataset = layer.dataset ?? mainDataset;

    if (!dataset) {
      throw Error('dataset must be defined');
    }

    const index = getDatasetIndex(dataset);
    const dataView = index
      ? await getDataView(
          index,
          dataViewsAPI,
          isESQLDataset(dataset) ? JSON.stringify(index) : undefined
        )
      : undefined;

    const [type, layerConfig] = buildDatasourceStatesLayer(
      layer,
      i,
      dataset,
      dataView,
      buildFormulaLayers,
      getValueColumns
    );
    if (layerConfig) {
      layers = {
        ...layers,
        [type]: {
          layers: isSingleLayer(layerConfig)
            ? { ...layers[type]?.layers, [layerId]: layerConfig }
            : // metric chart can return 2 layers (one for the metric and one for the trendline)
              { ...layerConfig },
        },
      };
    }

    if (dataView) {
      Object.keys(layers[type]?.layers ?? []).forEach((id) => {
        dataviews[id] = dataView;
      });
    }
  }

  return layers;
};

export const addLayerColumn = (
  layer: PersistedIndexPatternLayer,
  columnName: string,
  config: GenericIndexPatternColumn,
  first = false
) => {
  layer.columns = {
    ...layer.columns,
    [columnName]: config,
  };
  if (first) {
    layer.columnOrder.unshift(columnName);
  } else {
    layer.columnOrder.push(columnName);
  }
};

export const addLayerFormulaColumns = (
  layer: PersistedIndexPatternLayer,
  columns: PersistedIndexPatternLayer,
  postfix = ''
) => {
  const altObj = Object.fromEntries(
    Object.entries(columns.columns).map(([key, value]) =>
      // Modify key here
      [`${key}${postfix}`, value]
    )
  );

  layer.columns = {
    ...layer.columns,
    ...altObj,
  };
  layer.columnOrder.push(...columns.columnOrder.map((c) => `${c}${postfix}`));
};

function isESQLDataset(dataset: LensDataset): dataset is LensESQLDataset {
  return 'esql' in dataset;
}
export function isDataViewDataset(dataset: LensDataset): dataset is LensDataviewDataset {
  return 'index' in dataset;
}

export function isLensAPIFormat(config: unknown): config is LensApiConfig {
  return typeof config === 'object' && config !== null && 'type' in config;
}

export function isLensLegacyFormat(config: unknown): config is LensConfig {
  return typeof config === 'object' && config !== null && 'chartType' in config;
}

export function isLensLegacyAttributes(config: unknown): config is LensAttributes {
  return (
    typeof config === 'object' && config !== null && 'state' in config && 'references' in config
  );
}

export function isEsqlTableTypeDataSource(
  dataSource: DataSourceType
): dataSource is Extract<DataSourceType, { type: 'esql' }> {
  return dataSource.type === 'esql';
}

export function groupIsNotCollapsed(def: {
  collapse_by?: string;
}): def is { collapse_by: undefined } {
  return def.collapse_by == null;
}

export function isLensESQLConfig(config: LensApiConfig): config is LensApiConfigESQL {
  if (config.type === 'xy')
    return config.layers.some(
      (layer) => 'data_source' in layer && layer.data_source?.type === 'esql'
    );
  return config.data_source?.type === 'esql';
}

export function isLensDSLConfig(config: LensApiConfig): config is LensApiConfigNoESQL {
  return !isLensESQLConfig(config);
}
