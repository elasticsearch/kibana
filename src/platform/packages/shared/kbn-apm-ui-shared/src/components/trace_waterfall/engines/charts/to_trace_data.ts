/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EuiAccordionProps } from '@elastic/eui';
import type {
  TraceCriticalPath,
  TraceCriticalInterval,
  TraceDatum,
  TraceActiveSegment,
} from '@elastic/charts';
import type { AgentMark } from '../../../timeline/marker/agent_marker';
import type { ErrorMark } from '../../../timeline/marker/error_marker';
import type { CriticalPathSegment } from '../../critical_path';
import type { TraceWaterfallItem } from '../../use_trace_waterfall';
import { isFailureOrError } from '../../utils/is_failure_or_error';

/**
 * Units: all Kibana waterfall values are in **microseconds** (µs).
 * The `@elastic/charts` Trace API works in **milliseconds** (ms).
 * Every value is divided by 1000 at this boundary, exactly once.
 */
const US_TO_MS = 1000;

// ---------------------------------------------------------------------------
// Span data
// ---------------------------------------------------------------------------

/**
 * Computes `activeSegments` for a span datum in `spanDisplay: 'segments'` mode:
 *
 * - **Composite spans**: N evenly-distributed segments based on `composite.count` and
 *   `composite.sum`. The gaps between segments are equal (remaining time / (count - 1)).
 * - **All other spans**: a single segment covering the full `[startMs, endMs]` extent, which
 *   makes the span render as a solid colored bar identical to `spanDisplay: 'duration'`.
 *
 * Passing explicit `activeSegments` overrides the chart's self-time auto-derivation. For
 * non-composite parent spans this means tooltip self-time = full duration (not actual self-time),
 * which is an accepted divergence for this spike: visual parity takes priority.
 */
const toActiveSegments = (
  item: TraceWaterfallItem,
  startMs: number,
  endMs: number
): TraceActiveSegment[] => {
  const { composite } = item;
  if (composite && composite.count > 0 && composite.sum > 0) {
    const spanDurationMs = endMs - startMs;
    const activeMs = composite.sum / US_TO_MS;
    const segMs = activeMs / composite.count;
    const gapMs = composite.count > 1 ? (spanDurationMs - activeMs) / (composite.count - 1) : 0;
    return Array.from({ length: composite.count }, (_, i) => ({
      start: startMs + i * (segMs + gapMs),
      end: startMs + i * (segMs + gapMs) + segMs,
    }));
  }
  return [{ start: startMs, end: endMs }];
};

/**
 * Converts a flat list of `TraceWaterfallItem`s (preorder, skew-corrected, root-relative,
 * orphans already reparented to root by `reparentOrphansToRoot`) into `TraceDatum[]` for
 * the `@elastic/charts` `<Trace>` component.
 *
 * - `start` / `end` are root-relative elapsed-ms, matching `xScaleType: 'linear'`.
 * - Clock skew is already folded into `offset`+`skew` by the context; the chart's own skew
 *   detection is therefore a no-op (corrected children start ≥ parent start).
 * - The original `TraceWaterfallItem` is stored in `meta` for badge derivation and event dispatch.
 */
export const toTraceData = (traceWaterfall: TraceWaterfallItem[]): TraceDatum[] =>
  traceWaterfall.map((item) => {
    const start = (item.offset + item.skew) / US_TO_MS;
    const end = (item.offset + item.skew + item.duration) / US_TO_MS;
    return {
      id: item.id,
      name: item.composite
        ? `${item.composite.count}${
            item.composite.compressionStrategy === 'exact_match' ? 'x' : ''
          } ${item.name}`
        : item.name,
      parentId: item.parentId,
      traceId: item.traceId,
      start,
      end,
      color: item.color || undefined,
      activeSegments: toActiveSegments(item, start, end),
      meta: item,
    };
  });

// ---------------------------------------------------------------------------
// Collapse / accordion
// ---------------------------------------------------------------------------

/**
 * Returns the IDs of spans whose accordion is `'closed'` and that have at least one child,
 * matching the `<Trace collapsedSpanIds>` contract (controlled collapse, ADR 0026).
 *
 * Walks `traceWaterfall` in preorder and skips subtrees that are already hidden under a
 * collapsed ancestor — this prevents passing hundreds of intermediate IDs to the chart when
 * a deep-nested trace is auto-collapsed. Passing all of them would cause `collapseLanes` in
 * elastic-charts to do O(N²) work (it calls `collectDescendants` for every collapsed span in
 * the chain, re-walking the tail each time).
 */
export const toCollapsedSpanIds = (
  accordionStatesMap: Record<string, EuiAccordionProps['forceState']>,
  traceWaterfallMap: Record<string, TraceWaterfallItem[]>,
  traceWaterfall: TraceWaterfallItem[]
): string[] => {
  const result: string[] = [];
  let collapsedAt = -1;
  for (const item of traceWaterfall) {
    if (collapsedAt !== -1 && item.depth > collapsedAt) continue;
    collapsedAt = -1;
    if (accordionStatesMap[item.id] === 'closed' && (traceWaterfallMap[item.id]?.length ?? 0) > 0) {
      result.push(item.id);
      collapsedAt = item.depth;
    }
  }
  return result;
};

// ---------------------------------------------------------------------------
// Critical path
// ---------------------------------------------------------------------------

/**
 * Converts Kibana critical-path segments (grouped by span ID) into
 * `TraceCriticalPath` intervals for the `<Trace criticalPath>` prop.
 *
 * Only "self" segments are included — same filter as `getCriticalPathOverlays` in
 * `trace_item_row.tsx`. Intervals are root-relative elapsed-ms.
 */
export const toCriticalPath = (
  criticalPathSegmentsById: Record<string, CriticalPathSegment<TraceWaterfallItem>[]>
): TraceCriticalPath => {
  const intervals: TraceCriticalInterval[] = [];
  for (const [spanId, segments] of Object.entries(criticalPathSegmentsById)) {
    for (const seg of segments) {
      if (!seg.self) continue;
      intervals.push({
        spanId,
        start: seg.offset / US_TO_MS,
        end: (seg.offset + seg.duration) / US_TO_MS,
      });
    }
  }
  return intervals;
};

// ---------------------------------------------------------------------------
// Time annotations (marks)
// ---------------------------------------------------------------------------

/**
 * Maps an `AgentMark` or `ErrorMark` from the waterfall context to the fields
 * needed to render a `<TraceTimeAnnotation>`. The caller renders the JSX.
 */
export interface MarkAnnotationProps {
  id: string;
  timeMs: number;
  /** Semantic color intent for the annotation. */
  color: 'default' | 'danger';
  ariaLabel: string;
  /** Original mark carried in annotation `meta` for `onElementClick` dispatch. */
  meta: AgentMark | ErrorMark;
}

export const toMarkAnnotationProps = (marks: Array<AgentMark | ErrorMark>): MarkAnnotationProps[] =>
  marks.map((mark) => {
    // ErrorMark objects created in use_trace_waterfall carry a runtime `skew` field that is not
    // yet reflected in the ErrorMark interface. Access it via narrowing to avoid unsafe any.
    const skew =
      mark.type === 'errorMark' && 'skew' in mark ? (mark as ErrorMark & { skew: number }).skew : 0;
    return {
      id: mark.id,
      timeMs: (mark.offset + skew) / US_TO_MS,
      color: mark.type === 'errorMark' ? 'danger' : 'default',
      ariaLabel: mark.id,
      meta: mark,
    };
  });

/** Returns the ids of spans whose status is failure or error, for lane annotation. */
export const toFailureSpanIds = (traceWaterfall: TraceWaterfallItem[]): string[] =>
  traceWaterfall
    .filter((item) => item.status != null && isFailureOrError(item.status.value))
    .map((item) => item.id);
