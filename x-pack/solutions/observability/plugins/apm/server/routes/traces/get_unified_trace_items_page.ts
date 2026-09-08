/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Sort, SortResults } from '@elastic/elasticsearch/lib/api/types';
import type { APMEventClient } from '@kbn/apm-data-access-plugin/server';
import { ProcessorEvent } from '@kbn/observability-plugin/common';
import { rangeQuery, termQuery } from '@kbn/observability-plugin/server';
import {
  AGENT_NAME,
  AT_TIMESTAMP,
  ATTRIBUTE_HTTP_SCHEME,
  ATTRIBUTE_HTTP_STATUS_CODE,
  DURATION,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  EVENT_OUTCOME,
  FAAS_COLDSTART,
  KIND,
  OTEL_SPAN_LINKS_TRACE_ID,
  PARENT_ID,
  PROCESSOR_EVENT,
  SERVICE_ENVIRONMENT,
  SERVICE_NAME,
  SPAN_COMPOSITE_COMPRESSION_STRATEGY,
  SPAN_COMPOSITE_COUNT,
  SPAN_COMPOSITE_SUM,
  SPAN_DURATION,
  SPAN_ID,
  SPAN_LINKS_TRACE_ID,
  SPAN_NAME,
  SPAN_DESTINATION_SERVICE_RESOURCE,
  SPAN_SUBTYPE,
  SPAN_SYNC,
  SPAN_TYPE,
  STATUS_CODE,
  TIMESTAMP_US,
  TRACE_ID,
  TRANSACTION_DURATION,
  TRANSACTION_ID,
  TRANSACTION_MARKS_AGENT,
  TRANSACTION_NAME,
  TRANSACTION_RESULT,
} from '../../../common/es_fields/apm';
import { asMutableArray } from '../../../common/utils/as_mutable_array';
import { ensureFocusedTraceHits, getTraceHitId } from './ensure_focused_trace_hits';
import { MAX_ITEMS_PER_PAGE } from './trace_constants';

export const fields = asMutableArray(['@timestamp', 'trace.id', 'service.name'] as const);

export const ecsOnlyOptionalFields = asMutableArray([
  SPAN_ID,
  SPAN_NAME,
  SPAN_DURATION,
  TRANSACTION_DURATION,
  TRANSACTION_ID,
  TRANSACTION_NAME,
  TRANSACTION_RESULT,
  PROCESSOR_EVENT,
  PARENT_ID,
  TIMESTAMP_US,
  EVENT_OUTCOME,
  SPAN_TYPE,
  SPAN_SUBTYPE,
  SPAN_SYNC,
  SPAN_LINKS_TRACE_ID,
  AGENT_NAME,
  FAAS_COLDSTART,
  SPAN_COMPOSITE_COUNT,
  SPAN_COMPOSITE_SUM,
  SPAN_COMPOSITE_COMPRESSION_STRATEGY,
  SPAN_DESTINATION_SERVICE_RESOURCE,
  SERVICE_ENVIRONMENT,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
] as const);

export const optionalFields = asMutableArray([
  ...ecsOnlyOptionalFields,
  DURATION,
  STATUS_CODE,
  KIND,
  OTEL_SPAN_LINKS_TRACE_ID,
  ATTRIBUTE_HTTP_SCHEME,
  ATTRIBUTE_HTTP_STATUS_CODE,
] as const);

async function getUnifiedTraceItemsPage({
  apmEventClient,
  size,
  traceId,
  start,
  end,
  serviceName,
  searchAfter,
  ecsOnly,
}: {
  apmEventClient: APMEventClient;
  size: number;
  traceId: string;
  start: number;
  end: number;
  serviceName?: string;
  searchAfter?: SortResults;
  ecsOnly: boolean;
}) {
  const query = ecsOnly
    ? {
        bool: {
          filter: [
            ...termQuery(TRACE_ID, traceId),
            ...rangeQuery(start, end),
            ...termQuery(SERVICE_NAME, serviceName),
          ],
          should: { exists: { field: PARENT_ID } },
        },
      }
    : {
        bool: {
          must: [
            {
              bool: {
                filter: [
                  ...termQuery(TRACE_ID, traceId),
                  ...rangeQuery(start, end),
                  ...termQuery(SERVICE_NAME, serviceName),
                ],
                should: { exists: { field: PARENT_ID } },
              },
            },
          ],
          should: [
            { terms: { [PROCESSOR_EVENT]: [ProcessorEvent.span, ProcessorEvent.transaction] } },
            { bool: { must_not: { exists: { field: PROCESSOR_EVENT } } } },
          ],
          minimum_should_match: 1,
        },
      };

  const sortScript = ecsOnly
    ? `$('${TRANSACTION_DURATION}', $('${SPAN_DURATION}', 0))`
    : `$('${TRANSACTION_DURATION}', $('${SPAN_DURATION}', $('${DURATION}', 0)))`;

  const response = await apmEventClient.search(
    'get_unified_trace_items',
    {
      apm: {
        events: [ProcessorEvent.span, ProcessorEvent.transaction],
      },
      track_total_hits: true,
      size,
      query,
      fields: [...fields, ...(ecsOnly ? ecsOnlyOptionalFields : optionalFields)],
      _source: [TRANSACTION_MARKS_AGENT],
      sort: [
        { _score: 'asc' },
        {
          _script: {
            type: 'number',
            script: {
              lang: 'painless',
              source: sortScript,
            },
            order: 'desc',
          },
        },
        { [AT_TIMESTAMP]: 'asc' },
        { _doc: 'asc' },
      ] as Sort,
      ...(searchAfter ? { search_after: searchAfter } : {}),
    },
    { skipProcessorEventFilter: !ecsOnly }
  );

  return {
    hits: response.hits.hits,
    total: response.hits.total?.value ?? 0,
  };
}

type PageHits = Awaited<ReturnType<typeof getUnifiedTraceItemsPage>>['hits'];

async function paginate({
  apmEventClient,
  maxTraceItems,
  traceId,
  start,
  end,
  serviceName,
  hits,
  seenIds,
  searchAfter,
  ecsOnly,
}: {
  apmEventClient: APMEventClient;
  maxTraceItems: number;
  traceId: string;
  start: number;
  end: number;
  serviceName?: string;
  hits: PageHits;
  seenIds: Set<string>;
  searchAfter?: SortResults;
  ecsOnly: boolean;
}): Promise<{ hits: PageHits; total: number }> {
  const size = Math.min(maxTraceItems - hits.length, MAX_ITEMS_PER_PAGE);
  const response = await getUnifiedTraceItemsPage({
    apmEventClient,
    size,
    traceId,
    start,
    end,
    serviceName,
    searchAfter,
    ecsOnly,
  });

  // A document can be indexed in multiple indices (e.g. traces-apm and apm-*) and appear
  // more than once in the same response. Previously handled with collapse, which only works
  // within a single page. seenIds deduplicates across both within-page and cross-page results.
  const newHits = response.hits.filter((hit) => {
    const id = getTraceHitId(hit);
    if (!id || seenIds.has(id)) return false;
    seenIds.add(id);
    return true;
  });

  hits.push(...newHits);
  const hitLimit = hits.length >= maxTraceItems;
  if (hitLimit) hits.length = maxTraceItems;
  const truncatedHits = hits;

  const lastSort = response.hits[response.hits.length - 1]?.sort;
  if (
    hitLimit ||
    hits.length >= response.total ||
    response.hits.length === 0 ||
    response.hits.length < size ||
    !lastSort
  ) {
    return { hits: truncatedHits, total: response.total };
  }

  return paginate({
    apmEventClient,
    maxTraceItems,
    traceId,
    start,
    end,
    serviceName,
    hits: truncatedHits,
    seenIds,
    searchAfter: lastSort as SortResults,
    ecsOnly,
  });
}

export async function getUnifiedTraceItemsPaginated({
  apmEventClient,
  maxTraceItems,
  traceId,
  start,
  end,
  serviceName,
  ecsOnly = false,
  focusedDocId,
}: {
  apmEventClient: APMEventClient;
  maxTraceItems: number;
  traceId: string;
  start: number;
  end: number;
  serviceName?: string;
  ecsOnly?: boolean;
  focusedDocId?: string;
}): Promise<{ hits: PageHits; total: number }> {
  const result = await paginate({
    apmEventClient,
    maxTraceItems,
    traceId,
    start,
    end,
    serviceName,
    hits: [],
    seenIds: new Set(),
    ecsOnly,
  });

  if (!focusedDocId) {
    return result;
  }

  const hits = await ensureFocusedTraceHits({
    apmEventClient,
    hits: result.hits,
    focusedDocId,
    maxTraceItems,
    traceId,
    start,
    end,
    ecsOnly,
  });

  return { hits, total: result.total };
}
