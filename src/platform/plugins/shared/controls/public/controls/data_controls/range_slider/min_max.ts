/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { estypes } from '@elastic/elasticsearch';
import type { DataView, DataViewField } from '@kbn/data-views-plugin/public';
import type { AggregateQuery, BoolQuery, Filter, Query, TimeRange } from '@kbn/es-query';
import type {
  FetchContext,
  PublishesDataViews,
  PublishingSubject,
} from '@kbn/presentation-publishing';
import type { Observable } from 'rxjs';
import { combineLatest, lastValueFrom, switchMap, tap } from 'rxjs';
import { ControlValuesSource } from '@kbn/controls-constants';
import { max, min } from 'lodash';
import type { ESQLControlVariable } from '@kbn/esql-types';
import { dataService } from '../../../services/kibana_services';
import { buildESQLPreFilter, getFetchContextFilters, getFetchContextTimeRange } from '../utils';
import { getESQLSingleColumnValues } from '../../../../common/options_list';
import { getControlsTimezone } from '../../utils';

export function minMax$({
  controlFetch$,
  dataViews$,
  fieldName$,
  useGlobalFilters$,
  esqlQuery$,
  valuesSource$,
  setIsLoading,
}: {
  controlFetch$: Observable<FetchContext>;
  dataViews$: PublishesDataViews['dataViews$'];
  fieldName$: PublishingSubject<string | undefined>;
  useGlobalFilters$: PublishingSubject<boolean | undefined>;
  esqlQuery$: PublishingSubject<string | undefined>;
  valuesSource$: PublishingSubject<ControlValuesSource | undefined>;
  setIsLoading: (isLoading: boolean) => void;
}) {
  let prevRequestAbortController: AbortController | undefined;
  return combineLatest([
    controlFetch$,
    dataViews$,
    fieldName$,
    useGlobalFilters$,
    esqlQuery$,
    valuesSource$,
  ]).pipe(
    tap(() => {
      if (prevRequestAbortController) {
        prevRequestAbortController.abort();
        prevRequestAbortController = undefined;
      }
    }),
    switchMap(
      async ([
        controlFetchContext,
        dataViews,
        fieldName,
        useGlobalFilters,
        esqlQuery,
        valuesSource,
      ]) => {
        const dataView = dataViews?.[0];
        const dataViewField =
          dataView && fieldName ? dataView.getFieldByName(fieldName) : undefined;
        if (!dataView || !dataViewField) {
          return { max: undefined, min: undefined };
        }

        try {
          setIsLoading(true);
          const abortController = new AbortController();
          prevRequestAbortController = abortController;
          return await getMinMax({
            abortSignal: abortController.signal,
            dataView,
            field: dataViewField,
            ...controlFetchContext,
            query:
              valuesSource === ControlValuesSource.ESQL && esqlQuery !== undefined
                ? { esql: esqlQuery }
                : controlFetchContext.query,
            timeRange: getFetchContextTimeRange(controlFetchContext, useGlobalFilters),
            filters: getFetchContextFilters(controlFetchContext, useGlobalFilters),
            // Pre-filter the ES|QL pipeline by the dashboard's fetch context. Built only from
            // the *dashboard* query/filters (not the per-row `query` above which may carry the
            // ES|QL itself), so it mirrors how field-based controls inherit the filter bar.
            esqlPreFilter:
              valuesSource === ControlValuesSource.ESQL
                ? buildESQLPreFilter({
                    fetchContext: controlFetchContext,
                    useGlobalFilters,
                    dataView,
                    timeRange: getFetchContextTimeRange(controlFetchContext, useGlobalFilters),
                    esqlQuery,
                  })
                : undefined,
          });
        } catch (error) {
          return { error, max: undefined, min: undefined };
        }
      }
    ),
    tap(() => {
      setIsLoading(false);
    })
  );
}

export async function getMinMax({
  abortSignal,
  dataView,
  field,
  filters,
  query,
  timeRange,
  esqlVariables,
  esqlPreFilter,
}: {
  abortSignal: AbortSignal;
  dataView: DataView;
  field: DataViewField;
  filters?: Filter[];
  query?: Query | AggregateQuery;
  timeRange?: TimeRange;
  esqlVariables?: ESQLControlVariable[];
  esqlPreFilter?: { bool: BoolQuery };
}): Promise<{ min: number | undefined; max: number | undefined }> {
  if (query && 'esql' in query) {
    const result = await getESQLSingleColumnValues({
      query: query.esql,
      timeRange,
      filter: esqlPreFilter,
      signal: abortSignal,
      search: dataService.search.search,
      esqlVariables: esqlVariables ?? [],
      timezone: getControlsTimezone(),
    });
    if (getESQLSingleColumnValues.isNumericResult(result)) {
      return { min: min(result.values), max: max(result.values) };
    } else {
      const error = getESQLSingleColumnValues.isSuccess(result)
        ? new Error('Range slider values query returned a non-numeric field')
        : result.errors[0];
      throw error;
    }
  }

  const searchSource = await dataService.search.searchSource.create();
  searchSource.setField('size', 0);
  searchSource.setField('index', dataView);

  const allFilters = filters ? [...filters] : [];
  if (timeRange) {
    const timeFilter = dataService.query.timefilter.timefilter.createFilter(dataView, timeRange);
    if (timeFilter) allFilters.push(timeFilter);
  }
  if (allFilters.length) {
    searchSource.setField('filter', allFilters);
  }

  if (query) {
    searchSource.setField('query', query);
  }

  const aggBody: any = {};
  if (field.scripted) {
    aggBody.script = {
      source: field.script,
      lang: field.lang,
    };
  } else {
    aggBody.field = field.name;
  }

  const aggs = {
    maxAgg: {
      max: aggBody,
    },
    minAgg: {
      min: aggBody,
    },
  };
  searchSource.setField('aggs', aggs);

  const resp = await lastValueFrom(searchSource.fetch$({ abortSignal }));
  return {
    min:
      (resp.rawResponse?.aggregations?.minAgg as estypes.AggregationsSingleMetricAggregateBase)
        ?.value ?? undefined,
    max:
      (resp.rawResponse?.aggregations?.maxAgg as estypes.AggregationsSingleMetricAggregateBase)
        ?.value ?? undefined,
  };
}
