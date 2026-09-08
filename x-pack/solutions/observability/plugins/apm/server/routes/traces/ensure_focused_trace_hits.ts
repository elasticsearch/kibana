/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SearchHit } from '@elastic/elasticsearch/lib/api/types';
import type { APMEventClient } from '@kbn/apm-data-access-plugin/server';
import { ProcessorEvent } from '@kbn/observability-plugin/common';
import { rangeQuery, termQuery } from '@kbn/observability-plugin/server';
import {
  PARENT_ID,
  SPAN_ID,
  TRACE_ID,
  TRANSACTION_ID,
  TRANSACTION_MARKS_AGENT,
} from '../../../common/es_fields/apm';
import { ecsOnlyOptionalFields, fields, optionalFields } from './get_unified_trace_items_page';

const MAX_ANCESTOR_HOPS = 50;

export type FocusedTraceHit = Pick<SearchHit, 'fields'>;

export function getTraceHitId(hit: FocusedTraceHit): string | undefined {
  return firstStringField(hit.fields, SPAN_ID) ?? firstStringField(hit.fields, TRANSACTION_ID);
}

export function getTraceHitParentId(hit: FocusedTraceHit): string | undefined {
  return firstStringField(hit.fields, PARENT_ID);
}

function firstStringField(hitFields: SearchHit['fields'], fieldName: string): string | undefined {
  if (!hitFields) {
    return undefined;
  }

  const value = Reflect.get(hitFields, fieldName);
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].length > 0) {
    return value[0];
  }

  return undefined;
}

/**
 * Ranked waterfall pagination can drop the focused transaction when a large
 * multi-root trace spends `maxTraceItems` on long sibling roots. Fetch the
 * focused document and its ancestors, then merge them into the ranked hits
 * while staying at `maxTraceItems`.
 */
export async function ensureFocusedTraceHits<THit extends FocusedTraceHit>({
  apmEventClient,
  hits,
  focusedDocId,
  maxTraceItems,
  traceId,
  start,
  end,
  ecsOnly,
}: {
  apmEventClient: APMEventClient;
  hits: THit[];
  focusedDocId: string;
  maxTraceItems: number;
  traceId: string;
  start: number;
  end: number;
  ecsOnly: boolean;
}): Promise<THit[]> {
  const hitsById = new Map<string, THit>();
  for (const hit of hits) {
    const id = getTraceHitId(hit);
    if (id) {
      hitsById.set(id, hit);
    }
  }

  const reserved: THit[] = [];
  let idsToFetch = hitsById.has(focusedDocId) ? [] : [focusedDocId];
  let currentId = focusedDocId;

  for (let hop = 0; hop < MAX_ANCESTOR_HOPS; hop++) {
    if (idsToFetch.length > 0) {
      const fetchedHits = await fetchTraceHitsByIds({
        apmEventClient,
        traceId,
        start,
        end,
        ids: idsToFetch,
        ecsOnly,
      });

      for (const fetchedHit of fetchedHits) {
        const id = getTraceHitId(fetchedHit);
        if (!id || hitsById.has(id)) {
          continue;
        }
        // Intentional `as THit` type assertion as apmEventClient.search returns generic Elasticsearch SearchHit documents;
        const typedHit = fetchedHit as THit;
        hitsById.set(id, typedHit);
        reserved.push(typedHit);
      }
    }

    const currentHit = hitsById.get(currentId);
    const parentId = currentHit ? getTraceHitParentId(currentHit) : undefined;
    if (!parentId || hitsById.has(parentId)) {
      break;
    }

    currentId = parentId;
    idsToFetch = [parentId];
  }

  if (reserved.length === 0) {
    return hits;
  }

  const reservedIds = new Set(
    reserved.flatMap((hit) => {
      const id = getTraceHitId(hit);
      return id ? [id] : [];
    })
  );
  const rankedRemainder = hits.filter((hit) => {
    const id = getTraceHitId(hit);
    return id !== undefined && !reservedIds.has(id);
  });
  const remainingSlots = Math.max(0, maxTraceItems - reserved.length);

  return [...reserved, ...rankedRemainder.slice(0, remainingSlots)];
}

async function fetchTraceHitsByIds({
  apmEventClient,
  traceId,
  start,
  end,
  ids,
  ecsOnly,
}: {
  apmEventClient: APMEventClient;
  traceId: string;
  start: number;
  end: number;
  ids: string[];
  ecsOnly: boolean;
}): Promise<FocusedTraceHit[]> {
  if (ids.length === 0) {
    return [];
  }

  const response = await apmEventClient.search(
    'get_focused_trace_items',
    {
      apm: {
        events: [ProcessorEvent.span, ProcessorEvent.transaction],
      },
      track_total_hits: false,
      size: ids.length,
      query: {
        bool: {
          filter: [...termQuery(TRACE_ID, traceId), ...rangeQuery(start, end)],
          should: [{ terms: { [TRANSACTION_ID]: ids } }, { terms: { [SPAN_ID]: ids } }],
          minimum_should_match: 1,
        },
      },
      fields: [...fields, ...(ecsOnly ? ecsOnlyOptionalFields : optionalFields)],
      _source: [TRANSACTION_MARKS_AGENT],
    },
    { skipProcessorEventFilter: !ecsOnly }
  );

  return response.hits.hits;
}
