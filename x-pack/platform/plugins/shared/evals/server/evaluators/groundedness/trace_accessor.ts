/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ESQLSearchResponse } from '@kbn/es-types';
import { LOGS_INDEX_PATTERN, TRACES_INDEX_PATTERN } from '@kbn/evals-common';
import type { TraceAccessor } from '../types';

export interface TraceAccessorWithEsql extends TraceAccessor {
  runEsql(query: string): Promise<ESQLSearchResponse>;
}

const TRACE_FILTER_FIELD: Record<string, string> = {
  [TRACES_INDEX_PATTERN]: 'trace.id',
  [LOGS_INDEX_PATTERN]: 'trace_id',
};

const injectTraceFilter = (query: string, traceId: string): string => {
  const fromMatch = query.match(/FROM\s+([\w.*-]+)/i);
  if (!fromMatch) {
    throw new Error('ES|QL query must contain a FROM clause');
  }

  const index = fromMatch[1];
  const filterField = TRACE_FILTER_FIELD[index];
  if (!filterField) {
    throw new Error(
      `Unknown index pattern "${index}". Expected one of: ${Object.keys(TRACE_FILTER_FIELD).join(
        ', '
      )}`
    );
  }

  const traceFilter = `${filterField} == "${traceId}"`;
  const whereMatch = query.match(/\|\s*WHERE\s+/i);

  if (whereMatch) {
    return query.replace(/\|\s*WHERE\s+/i, `| WHERE ${traceFilter} AND `);
  }

  return query.replace(/(FROM\s+[\w.*-]+)/i, `$1\n| WHERE ${traceFilter}`);
};

export const createTraceAccessor = (traceAccessor: TraceAccessor): TraceAccessorWithEsql => {
  return {
    ...traceAccessor,
    runEsql: async (query: string) => {
      const scopedQuery = injectTraceFilter(query, traceAccessor.traceId);
      return (await traceAccessor.esClient.esql.query({
        query: scopedQuery,
      })) as ESQLSearchResponse;
    },
  };
};
