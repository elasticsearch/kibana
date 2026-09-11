/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  AggregationsAggregate,
  AggregationsAggregationContainer,
  QueryDslQueryContainer,
} from '@elastic/elasticsearch/lib/api/types';
import { isValidTraceId } from '@opentelemetry/api';
import { LOGS_INDEX_PATTERN, TRACES_INDEX_PATTERN } from '@kbn/evals-common';
import type { TraceAccessor } from './types';

const TRACE_SOURCE = {
  traces: { index: TRACES_INDEX_PATTERN, field: 'trace.id' },
  logs: { index: LOGS_INDEX_PATTERN, field: 'trace_id' },
} as const;

export type TraceSource = keyof typeof TRACE_SOURCE;

export interface TraceFilterTerm {
  type: 'term';
  field: string;
  value: string;
}

export interface TraceFilterExistence {
  type: 'exists' | 'not_exists';
  field: string;
}

export type TraceFilter = TraceFilterTerm | TraceFilterExistence;

export interface TraceSearchSort {
  field: string;
  order: 'asc' | 'desc';
  unmappedType?: 'keyword';
}

export interface TraceSearchParams {
  filter?: TraceFilter[];
  fields?: string[];
  sort?: TraceSearchSort | TraceSearchSort[];
  size?: number;
  aggs?: Record<string, AggregationsAggregationContainer>;
}

export interface TraceSearchResult<TAggregations = Record<string, AggregationsAggregate>> {
  documents: Array<Record<string, unknown>>;
  aggregations?: TAggregations;
}

export interface TraceAccessorWithSearch extends TraceAccessor {
  runSearch<TAggregations = Record<string, AggregationsAggregate>>(
    source: TraceSource,
    params: TraceSearchParams
  ): Promise<TraceSearchResult<TAggregations>>;
}

export const createTraceAccessor = (traceAccessor: TraceAccessor): TraceAccessorWithSearch => ({
  ...traceAccessor,
  runSearch: async <TAggregations = Record<string, AggregationsAggregate>>(
    source: TraceSource,
    params: TraceSearchParams
  ) => {
    if (!isValidTraceId(traceAccessor.traceId)) {
      throw new Error('Invalid trace_id: must be a 32-character hex string');
    }

    const { index, field } = TRACE_SOURCE[source];
    const { filter = [], fields, sort, size, aggs } = params;
    const sortFields = sort ? (Array.isArray(sort) ? sort : [sort]) : undefined;

    const filterClauses: QueryDslQueryContainer[] = [{ term: { [field]: traceAccessor.traceId } }];
    const mustNotClauses: QueryDslQueryContainer[] = [];
    for (const clause of filter) {
      if (clause.type === 'term') {
        filterClauses.push({ term: { [clause.field]: clause.value } });
      } else if (clause.type === 'exists') {
        filterClauses.push({ exists: { field: clause.field } });
      } else {
        mustNotClauses.push({ exists: { field: clause.field } });
      }
    }

    const response = await traceAccessor.esClient.search<Record<string, unknown>>({
      index,
      ignore_unavailable: true,
      _source: fields,
      size,
      aggs,
      sort: sortFields?.map(({ field: sortField, order, unmappedType }) => ({
        [sortField]: {
          order,
          ...(unmappedType ? { unmapped_type: unmappedType } : {}),
        },
      })),
      query: {
        bool: {
          filter: filterClauses,
          ...(mustNotClauses.length > 0 ? { must_not: mustNotClauses } : {}),
        },
      },
    });

    return {
      documents: response.hits.hits.flatMap((hit) => (hit._source ? [hit._source] : [])),
      aggregations: response.aggregations as TAggregations | undefined,
    };
  },
});
