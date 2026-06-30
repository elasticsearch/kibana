/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getESQLResults, getESQLTimeFieldFromQuery } from '@kbn/esql-utils';
import dateMath from '@kbn/datemath';
import type { HttpStart } from '@kbn/core/public';
import type { ISearchGeneric } from '@kbn/search-types';

export type EsqlDataResult = Awaited<ReturnType<typeof getESQLResults>>['response'];

/**
 * Fetches ES|QL query results client-side via the data plugin's search service.
 *
 * Time field detection uses `getESQLTimeFieldFromQuery` which calls the server's
 * timefield API — AST parsing first, then `@timestamp` fieldCaps fallback. This means
 * queries that reference a date field indirectly (e.g. `BUCKET(@timestamp, 1 hour)`)
 * are also time-filtered correctly without requiring explicit `?_tstart`/`?_tend` params.
 * Results are LRU-cached so repeated calls for the same query have no extra network cost.
 */
export async function fetchEsqlData(
  search: ISearchGeneric,
  http: HttpStart,
  esqlQuery: string,
  timeRange: { from: string; to: string } | undefined,
  signal: AbortSignal
): Promise<EsqlDataResult> {
  let filter: unknown;
  if (timeRange) {
    const timeField = await getESQLTimeFieldFromQuery({ query: esqlQuery, http });
    if (timeField) {
      filter = {
        range: {
          [timeField]: {
            gte: dateMath.parse(timeRange.from)?.toISOString(),
            lt: dateMath.parse(timeRange.to, { roundUp: true })?.toISOString(),
            format: 'strict_date_optional_time',
          },
        },
      };
    }
  }

  const { response } = await getESQLResults({
    esqlQuery,
    search,
    signal,
    filter,
    timeRange,
  });

  return response;
}
