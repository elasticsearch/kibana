/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';
import dateMath from '@kbn/datemath';
import type { DatatableColumn } from '@kbn/expressions-plugin/common';
import type { KibanaExecutionContext } from '@kbn/core/public';
import type { ISearchGeneric } from '@kbn/search-types';
import type { TimeRange } from '@kbn/es-query';
import { getTimeZoneFromSettings } from '@kbn/es-query';
import { esFieldTypeToKibanaFieldType } from '@kbn/field-types';
import type { ESQLColumn, ESQLSearchResponse, ESQLSearchParams } from '@kbn/es-types';
import { lastValueFrom } from 'rxjs';
import { type ESQLControlVariable } from '@kbn/esql-types';
import { getESQLQueryVariables } from './query_parsing_helpers';

export const hasStartEndParams = (query: string) => /\?_tstart|\?_tend/i.test(query);

export const getStartEndParams = (query: string, time?: TimeRange) => {
  const startNamedParams = /\?_tstart/i.test(query);
  const endNamedParams = /\?_tend/i.test(query);
  if (time && (startNamedParams || endNamedParams)) {
    const timeParams = {
      start: startNamedParams ? dateMath.parse(time.from)?.toISOString() : undefined,
      end: endNamedParams ? dateMath.parse(time.to, { roundUp: true })?.toISOString() : undefined,
    };
    const namedParams = [];
    if (timeParams?.start) {
      namedParams.push({ _tstart: timeParams.start });
    }
    if (timeParams?.end) {
      namedParams.push({ _tend: timeParams.end });
    }
    return namedParams;
  }
  return [];
};

export const getNamedParams = (
  query: string,
  timeRange?: TimeRange,
  variables?: ESQLControlVariable[]
) => {
  const namedParams: ESQLSearchParams['params'] = getStartEndParams(query, timeRange);
  if (variables?.length) {
    const usedVariables = new Set(getESQLQueryVariables(query));
    variables
      .filter(({ key }) => usedVariables.has(key))
      .forEach(({ key, value }) => {
        namedParams.push({ [key]: value });
      });
  }
  return namedParams;
};

export function formatESQLColumns(columns: ESQLColumn[]): DatatableColumn[] {
  return columns.map(({ name, type }) => {
    const kibanaType = esFieldTypeToKibanaFieldType(type);
    return {
      id: name,
      name,
      meta: { type: kibanaType, esType: type },
    } as DatatableColumn;
  });
}

// Returns the columns exactly as being returned by the _query endpoint
// Based on the search api from the data plugin
export async function getESQLQueryColumnsRaw({
  esqlQuery,
  search,
  signal,
  filter,
  dropNullColumns,
  timeRange,
  variables,
}: {
  esqlQuery: string;
  search: ISearchGeneric;
  signal?: AbortSignal;
  dropNullColumns?: boolean;
  filter?: unknown;
  timeRange?: TimeRange;
  variables?: ESQLControlVariable[];
}): Promise<ESQLColumn[]> {
  try {
    const namedParams = getNamedParams(esqlQuery, timeRange, variables);
    const response = await lastValueFrom(
      search(
        {
          params: {
            ...(filter ? { filter } : {}),
            query: `${esqlQuery} | limit 0`,
            ...(dropNullColumns ? { dropNullColumns: true } : {}),
            ...(namedParams.length ? { params: namedParams } : {}),
          },
        },
        {
          abortSignal: signal,
          strategy: 'esql_async',
        }
      )
    );

    const table = response.rawResponse as unknown as ESQLSearchResponse;
    const hasEmptyColumns = table.all_columns && table.all_columns?.length > table.columns.length;
    const lookup = new Set(hasEmptyColumns ? table.columns?.map(({ name }) => name) || [] : []);

    const allColumns =
      (table.all_columns ?? table.columns)?.map(({ name, type, original_types }) => {
        return {
          name,
          type,
          original_types,
          isNull: hasEmptyColumns ? !lookup.has(name) : false,
        };
      }) ?? [];

    return allColumns ?? [];
  } catch (error) {
    throw new Error(
      i18n.translate('esqlUtils.columnsErrorMsg', {
        defaultMessage: 'Unable to load columns. {errorMessage}',
        values: { errorMessage: error.message },
      })
    );
  }
}

// Returns the columns with the kibana format
// Based on the search api from the data plugin
export async function getESQLQueryColumns({
  esqlQuery,
  search,
  signal,
  filter,
  dropNullColumns,
  timeRange,
  variables,
}: {
  esqlQuery: string;
  search: ISearchGeneric;
  signal?: AbortSignal;
  filter?: unknown;
  dropNullColumns?: boolean;
  timeRange?: TimeRange;
  variables?: ESQLControlVariable[];
}): Promise<DatatableColumn[]> {
  try {
    const rawColumns = await getESQLQueryColumnsRaw({
      esqlQuery,
      search,
      filter,
      dropNullColumns,
      signal,
      timeRange,
      variables,
    });
    const columns = formatESQLColumns(rawColumns) ?? [];
    return columns;
  } catch (error) {
    throw new Error(
      i18n.translate('esqlUtils.columnsErrorMsg', {
        defaultMessage: 'Unable to load columns. {errorMessage}',
        values: { errorMessage: error.message },
      })
    );
  }
}

// Returns the table as being returned by the _query endpoint
// Based on the search api from the data plugin
export async function getESQLResults({
  esqlQuery,
  search,
  signal,
  filter,
  dropNullColumns,
  timeRange,
  variables,
  timezone,
  executionContext,
}: {
  esqlQuery: string;
  search: ISearchGeneric;
  signal?: AbortSignal;
  filter?: unknown;
  dropNullColumns?: boolean;
  timeRange?: TimeRange;
  variables?: ESQLControlVariable[];
  timezone?: string;
  executionContext?: KibanaExecutionContext;
}): Promise<{
  response: ESQLSearchResponse;
  params: ESQLSearchParams;
}> {
  const namedParams = getNamedParams(esqlQuery, timeRange, variables);
  const result = await lastValueFrom(
    search(
      {
        params: {
          ...(filter ? { filter } : {}),
          query: esqlQuery,
          ...(dropNullColumns ? { dropNullColumns: true } : {}),
          ...(namedParams.length ? { params: namedParams } : {}),
          ...(timezone ? { time_zone: getTimeZoneFromSettings(timezone) } : {}),
        },
      },
      {
        abortSignal: signal,
        strategy: 'esql_async',
        ...(executionContext ? { executionContext } : {}),
      }
    )
  );

  const rawResponse = result.rawResponse as unknown as ESQLSearchResponse;

  // Normalize response.values: if all arrays are empty, convert to single empty array
  const normalizedValues =
    rawResponse.values && rawResponse.values.every((row) => Array.isArray(row) && row.length === 0)
      ? []
      : rawResponse.values;

  const response = {
    ...rawResponse,
    values: normalizedValues,
  };

  return {
    response,
    params: result.requestParams as unknown as ESQLSearchParams,
  };
}
