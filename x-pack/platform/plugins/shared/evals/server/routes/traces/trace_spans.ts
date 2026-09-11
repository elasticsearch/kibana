/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SearchHit } from '@elastic/elasticsearch/lib/api/types';
import type { TraceSpan } from '@kbn/evals-common';

/** Raw shape of a span document in the traces-* indices. */
export interface TraceSpanSource {
  span_id?: string;
  parent_span_id?: string;
  trace_id?: string;
  name?: string;
  kind?: string;
  status?: { code?: string };
  '@timestamp'?: string;
  duration?: number;
  attributes?: Record<string, unknown>;
}

/** Ceiling on the span documents fetched by one traces-* search. */
export const MAX_SPANS_PER_TRACE_SEARCH = 10_000;

/** Shapes one traces-* hit into the API's span, converting OTel nanosecond durations to ms. */
export const shapeTraceSpan = (
  hit: SearchHit<TraceSpanSource>,
  fallbackTraceId: string
): TraceSpan | null => {
  const source = hit._source;
  if (!source) {
    return null;
  }

  const durationNs = source.duration ?? 0;

  return {
    span_id: source.span_id ?? hit._id ?? '',
    trace_id: source.trace_id ?? fallbackTraceId,
    parent_span_id: source.parent_span_id,
    name: source.name ?? 'unknown',
    kind: source.kind,
    status: source.status?.code,
    start_time: source['@timestamp'] ?? '',
    duration_ms: durationNs / 1_000_000,
    attributes: source.attributes ?? {},
  };
};

/** Wall-clock duration of a trace: earliest span start to latest span end. */
export const computeTraceDurationMs = (spans: TraceSpan[]): number => {
  if (spans.length === 0) {
    return 0;
  }
  const startTimes = spans.map((span) => new Date(span.start_time).getTime());
  const earliestStart = Math.min(...startTimes);
  const latestEnd = Math.max(...spans.map((span, i) => startTimes[i] + span.duration_ms));
  return latestEnd - earliestStart;
};
