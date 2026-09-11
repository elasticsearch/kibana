/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  Query,
  Filter,
  DataViewBase,
  TimeRange,
  EsQueryConfig,
  AggregateQuery,
} from '@kbn/es-query';
import {
  buildCustomFilter,
  buildEsQuery,
  FilterStateStore,
  isOfQueryType,
  isOfAggregateQueryType,
} from '@kbn/es-query';
import { i18n } from '@kbn/i18n';
import type { RecursiveReadonly } from '@kbn/utility-types';
import type { Capabilities } from '@kbn/core/public';
import { partition } from 'lodash';
import { LayerTypes } from '@kbn/expression-xy-plugin/public';
import type {
  TableInspectorAdapter,
  Datasource,
  DatasourcePublicAPI,
  IndexPatternMap,
} from '@kbn/lens-common';
import { showMemoizedErrorNotification } from '../lens_ui_errors';
import type { Visualization } from '..';

function getLayerType(visualization: Visualization, state: unknown, layerId: string) {
  return visualization.getLayerType(layerId, state) || LayerTypes.DATA;
}

/**
 * Joins a series of queries.
 *
 * Uses "AND" along dimension 1 and "OR" along dimension 2
 */
function joinQueries(queries: Query[][]) {
  // leave a single query alone
  if (queries.length === 1 && queries[0].length === 1) {
    return queries[0][0].query;
  }

  const expression = queries
    .filter((subQueries) => subQueries.length)
    .map((subQueries) =>
      // reduce the amount of round brackets in case of one query
      subQueries.length > 1
        ? `( ${subQueries.map(({ query: filterQuery }) => `( ${filterQuery} )`).join(' OR ')} )`
        : `( ${subQueries[0].query} )`
    )
    .join(' AND ');
  return queries.length > 1 ? `( ${expression} )` : expression;
}

interface LayerMetaInfo {
  id: string;
  columns: string[];
  filters: Record<
    'enabled' | 'disabled',
    {
      kuery: Query[][] | undefined;
      lucene: Query[][] | undefined;
    }
  >;
}

const sortByDateFieldsFirst = (
  datasourceAPI: DatasourcePublicAPI,
  fields: string[],
  indexPatterns: IndexPatternMap
) => {
  const dataViewId = datasourceAPI.getSourceId();
  if (!dataViewId) return;

  // for usability reasons we want to order the date fields first
  // the fields order responds to the columns order in Discover
  const dateFieldsFirst = fields.reduce((acc: string[], fieldName) => {
    const field = indexPatterns[dataViewId]?.getFieldByName(fieldName);
    if (field?.type === 'date') {
      return [fieldName, ...acc];
    }
    return [...acc, fieldName];
  }, []);

  return dateFieldsFirst;
};

/**
 * The config builder will create predictable ad hoc index pattern IDs that do not
 * necessarily match the data view IDs in the current Kibana instance.
 * This function tries to find a data view matching the given index pattern ID
 * either by ID or by title.
 */
export function findDataViewByIndexPatternId(
  indexPatternId: string,
  indexPatterns: IndexPatternMap
) {
  return (
    indexPatterns[indexPatternId] ??
    Object.values(indexPatterns).find((dv) => dv.title === indexPatternId)
  );
}

export function getLayerMetaInfo(
  currentDatasource: Datasource | undefined,
  datasourceState: unknown,
  activeVisualization: Visualization | undefined,
  visualizationState: unknown,
  activeData: TableInspectorAdapter | undefined,
  indexPatterns: IndexPatternMap,
  timeRange: TimeRange | undefined,
  capabilities: RecursiveReadonly<{
    navLinks: Capabilities['navLinks'];
    discover_v2?: Capabilities['discover_v2'];
  }>
): { meta: LayerMetaInfo | undefined; isVisible: boolean; error: string | undefined } {
  const isVisible = Boolean(capabilities.navLinks?.discover && capabilities.discover_v2?.show);
  // If Multiple tables, return
  // If there are time shifts, return
  // If dataViews have not loaded yet, return
  const datatables = Object.values(activeData || {});
  if (
    !datatables.length ||
    !currentDatasource ||
    !datasourceState ||
    !activeVisualization ||
    !Object.keys(indexPatterns).length
  ) {
    return {
      meta: undefined,
      error: i18n.translate('xpack.lens.app.showUnderlyingDataNoData', {
        defaultMessage: 'Visualization has no data available to show',
      }),
      isVisible,
    };
  }
  let datasourceAPI: DatasourcePublicAPI;

  try {
    const layerIds = currentDatasource.getLayers(datasourceState);
    const dataLayerIds = layerIds.filter(
      (layerId) =>
        getLayerType(activeVisualization, visualizationState, layerId) === LayerTypes.DATA
    );
    if (dataLayerIds.length > 1) {
      return {
        meta: undefined,
        error: i18n.translate('xpack.lens.app.showUnderlyingDataMultipleLayers', {
          defaultMessage: 'Cannot show underlying data for visualizations with multiple layers',
        }),
        isVisible,
      };
    }
    // The datasource may hold only non-data layers (e.g. a form-based reference
    // line layer next to ES|QL data layers); there is no underlying data to show.
    if (dataLayerIds.length === 0) {
      return {
        meta: undefined,
        error: i18n.translate('xpack.lens.app.showUnderlyingDataNoDataLayers', {
          defaultMessage: 'Visualization has no data layers to show underlying data for',
        }),
        isVisible,
      };
    }
    datasourceAPI = currentDatasource.getPublicAPI({
      layerId: dataLayerIds[0],
      state: datasourceState,
      indexPatterns,
    });
  } catch (error) {
    showMemoizedErrorNotification(error);

    return {
      meta: undefined,
      error: error.message,
      isVisible,
    };
  }

  const tableSpec = datasourceAPI.getTableSpec();

  const columnsWithNoTimeShifts = tableSpec.filter(
    ({ columnId }) => !datasourceAPI.getOperationForColumnId(columnId)?.hasTimeShift
  );
  if (columnsWithNoTimeShifts.length < tableSpec.length) {
    return {
      meta: undefined,
      error: i18n.translate('xpack.lens.app.showUnderlyingDataTimeShifts', {
        defaultMessage: "Cannot show underlying data when there's a time shift configured",
      }),
      isVisible,
    };
  }

  const filtersOrError = datasourceAPI.getFilters(activeData, timeRange);

  if ('error' in filtersOrError) {
    return {
      meta: undefined,
      error: filtersOrError.error,
      isVisible,
    };
  }

  const uniqueFields = [...new Set(columnsWithNoTimeShifts.map(({ fields }) => fields).flat())];
  const dateFieldsFirst = sortByDateFieldsFirst(datasourceAPI, uniqueFields, indexPatterns);

  return {
    meta: {
      id: datasourceAPI.getSourceId()!,
      columns: dateFieldsFirst ?? uniqueFields,
      filters: filtersOrError,
    },
    error: undefined,
    isVisible,
  };
}

// This enforces on assignment time that the two props are not the same
type QueryLanguage = 'lucene' | 'kuery';

/**
 * Translates an arbitrarily-large set of @type {Query}s (including those supplied in @type {LayerMetaInfo})
 * and existing Kibana @type {Filter}s into a single query and a new set of @type {Filter}s. This allows them to
 * function as an equivalent context in Discover.
 *
 * If some of the queries are in KQL and some in Lucene, all the queries in one language will be merged into
 * a large query to be shown in the query bar, while the queries in the other language will be encoded as an
 * extra filter pill.
 */
export function combineQueryAndFilters(
  query: Query | Query[] | AggregateQuery | undefined,
  filters: Filter[],
  meta: LayerMetaInfo,
  dataViews: DataViewBase[] | undefined,
  esQueryConfig: EsQueryConfig
) {
  const queries: {
    kuery: Query[];
    lucene: Query[];
  } = {
    kuery: [],
    lucene: [],
  };

  const allQueries = Array.isArray(query) ? query : query && isOfQueryType(query) ? [query] : [];
  const nonEmptyQueries = allQueries.filter(
    (q) =>
      !isOfAggregateQueryType(q) && Boolean(typeof q.query === 'string' ? q.query.trim() : q.query)
  );

  [queries.lucene, queries.kuery] = partition(nonEmptyQueries, (q) => q.language === 'lucene');

  const queryLanguage: QueryLanguage =
    (nonEmptyQueries[0]?.language as QueryLanguage | undefined) || 'kuery';

  const newQuery = {
    language: queryLanguage,
    query: joinQueries([
      ...queries[queryLanguage].map((q) => [q]),
      ...(meta.filters.enabled[queryLanguage] || []),
    ]),
  };

  const filtersLanguage = queryLanguage === 'lucene' ? 'kuery' : 'lucene';

  // make a copy as the original filters are readonly
  const newFilters = [...filters];

  const dataView = dataViews?.find(({ id }) => id === meta.id);

  const hasQueriesInFiltersLanguage = Boolean(
    meta.filters.enabled[filtersLanguage]?.length || queries[filtersLanguage].length
  );

  if (hasQueriesInFiltersLanguage) {
    const queryExpression = joinQueries([
      ...queries[filtersLanguage].map((q) => [q]),
      ...(meta.filters.enabled[filtersLanguage] || []),
    ]);

    // Create new filter to encode the rest of the query information
    newFilters.push(
      buildCustomFilter(
        meta.id!,
        buildEsQuery(
          dataView,
          { language: filtersLanguage, query: queryExpression },
          [],
          esQueryConfig
        ),
        false,
        false,
        i18n.translate('xpack.lens.app.lensContext', {
          defaultMessage: 'Lens context ({language})',
          values: { language: filtersLanguage },
        }),
        FilterStateStore.APP_STATE
      )
    );
  }

  // for each disabled filter create a new custom filter and disable it
  // note that both languages go into the filter bar
  for (const language of ['lucene', 'kuery'] as const) {
    const [disabledQueries] = meta.filters.disabled[language] || [];
    for (const disabledQuery of disabledQueries || []) {
      let label = disabledQuery.query as string;
      if (language === 'lucene') {
        label += ` (${language})`;
      }
      newFilters.push(
        buildCustomFilter(
          meta.id!,
          buildEsQuery(dataView, disabledQuery, [], esQueryConfig),
          true,
          false,
          label,
          FilterStateStore.APP_STATE
        )
      );
    }
  }

  return { filters: newFilters, query: newQuery };
}
