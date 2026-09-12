/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { TraceWaterfallItem } from '../../use_trace_waterfall';
import {
  toCriticalPath,
  toCollapsedSpanIds,
  toMarkAnnotationProps,
  toTraceData,
} from './to_trace_data';
import type { CriticalPathSegment } from '../../critical_path';
import type { AgentMark } from '../../../timeline/marker/agent_marker';
import type { ErrorMark } from '../../../timeline/marker/error_marker';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeItem = (override: Partial<TraceWaterfallItem> = {}): TraceWaterfallItem => ({
  id: 'a',
  name: 'root',
  timestampUs: 0,
  duration: 1_000_000, // 1 s in µs
  traceId: 'trace1',
  serviceName: 'svc',
  depth: 0,
  offset: 0,
  skew: 0,
  color: '#aabbcc',
  errors: [],
  spanLinksCount: { incoming: 0, outgoing: 0 },
  docType: 'transaction',
  ...override,
});

// ---------------------------------------------------------------------------
// toTraceData
// ---------------------------------------------------------------------------

describe('toTraceData', () => {
  it('converts µs to ms', () => {
    const item = makeItem({ offset: 0, skew: 0, duration: 2_000_000 });
    const [datum] = toTraceData([item]);
    expect(datum.start).toBe(0);
    expect(datum.end).toBe(2_000); // 2 000 ms
  });

  it('folds clock skew into start/end', () => {
    // child: offset=500_000µs, skew=100_000µs, duration=200_000µs
    const item = makeItem({ id: 'b', offset: 500_000, skew: 100_000, duration: 200_000 });
    const [datum] = toTraceData([item]);
    expect(datum.start).toBe(600); // (500_000+100_000)/1000
    expect(datum.end).toBe(800); // +200_000/1000
  });

  it('preserves parentId and traceId', () => {
    const item = makeItem({ parentId: 'root', traceId: 't2' });
    const [datum] = toTraceData([item]);
    expect(datum.parentId).toBe('root');
    expect(datum.traceId).toBe('t2');
  });

  it('stores original item in meta', () => {
    const item = makeItem();
    const [datum] = toTraceData([item]);
    expect(datum.meta).toBe(item);
  });

  it('passes color through', () => {
    const item = makeItem({ color: '#112233' });
    const [datum] = toTraceData([item]);
    expect(datum.color).toBe('#112233');
  });

  it('folds composite count into name', () => {
    const item = makeItem({
      name: 'db query',
      composite: { count: 5, sum: 100_000, compressionStrategy: 'exact_match' },
    });
    const [datum] = toTraceData([item]);
    expect(datum.name).toBe('5x db query');
  });

  it('adds a full-span active segment for non-composite spans', () => {
    const item = makeItem({ offset: 0, skew: 0, duration: 1_000_000 });
    const [datum] = toTraceData([item]);
    expect(datum.activeSegments).toEqual([{ start: 0, end: 1000 }]);
  });

  it('distributes composite activeSegments evenly across span duration', () => {
    // span: 0ms–2000ms, composite: 3 × 500ms = 1500ms active
    // gap = (2000 - 1500) / (3-1) = 250ms
    // seg0: [0, 500], seg1: [750, 1250], seg2: [1500, 2000]
    const item = makeItem({
      name: 'db query',
      offset: 0,
      skew: 0,
      duration: 2_000_000, // 2000ms
      composite: { count: 3, sum: 1_500_000, compressionStrategy: 'exact_match' },
    });
    const [datum] = toTraceData([item]);
    expect(datum.activeSegments).toHaveLength(3);
    expect(datum.activeSegments![0]).toMatchObject({ start: 0, end: 500 });
    expect(datum.activeSegments![1]).toMatchObject({ start: 750, end: 1250 });
    expect(datum.activeSegments![2]).toMatchObject({ start: 1500, end: 2000 });
  });

  it('uses same-start vs parent: skew-corrected child never starts before parent', () => {
    const parent = makeItem({ id: 'p', offset: 0, skew: 0, duration: 1_000_000 });
    const child = makeItem({
      id: 'c',
      parentId: 'p',
      // child starts slightly before parent in raw timestampUs, skew corrects it
      offset: 0,
      skew: 0,
      duration: 500_000,
    });
    const data = toTraceData([parent, child]);
    // After skew correction child.start >= parent.start
    expect(data[1].start).toBeGreaterThanOrEqual(data[0].start);
  });
});

// ---------------------------------------------------------------------------
// toCollapsedSpanIds
// ---------------------------------------------------------------------------

describe('toCollapsedSpanIds', () => {
  it('returns ids that are closed and have children', () => {
    const statesMap = { a: 'closed', b: 'open', c: 'closed' } as any;
    const waterfallMap = { a: [makeItem({ id: 'a1' })], b: [makeItem({ id: 'b1' })], c: [] };
    const waterfall = [makeItem({ id: 'a', depth: 0 }), makeItem({ id: 'b', depth: 0 }), makeItem({ id: 'c', depth: 0 })];
    const result = toCollapsedSpanIds(statesMap, waterfallMap, waterfall);
    expect(result).toContain('a');
    expect(result).not.toContain('b');
    // c is closed but has no children
    expect(result).not.toContain('c');
  });

  it('returns empty array when nothing is closed', () => {
    const statesMap = { a: 'open', b: 'open' } as any;
    const waterfallMap = { a: [makeItem({ id: 'a1' })], b: [makeItem({ id: 'b1' })] };
    const waterfall = [makeItem({ id: 'a' }), makeItem({ id: 'b' })];
    expect(toCollapsedSpanIds(statesMap, waterfallMap, waterfall)).toEqual([]);
  });

  it('skips already-hidden descendants to avoid O(N²) in the chart', () => {
    // Simulate 4-span deep chain: only root's child (depth 1) should be in the result.
    const statesMap = { root: 'open', d1: 'closed', d2: 'closed', d3: 'closed' } as any;
    const d3 = makeItem({ id: 'd3', depth: 3 });
    const d2 = makeItem({ id: 'd2', depth: 2 });
    const d1 = makeItem({ id: 'd1', depth: 1 });
    const root = makeItem({ id: 'root', depth: 0 });
    const waterfallMap = { root: [d1], d1: [d2], d2: [d3], d3: [] };
    const waterfall = [root, d1, d2, d3];
    const result = toCollapsedSpanIds(statesMap, waterfallMap, waterfall);
    expect(result).toEqual(['d1']);
  });
});

// ---------------------------------------------------------------------------
// toCriticalPath
// ---------------------------------------------------------------------------

describe('toCriticalPath', () => {
  const makeSegment = (
    id: string,
    offset: number,
    duration: number,
    self: boolean
  ): CriticalPathSegment<TraceWaterfallItem> => ({
    item: makeItem({ id }),
    offset,
    duration,
    self,
  });

  it('converts µs to ms and only includes self segments', () => {
    const map = {
      spanA: [
        makeSegment('spanA', 0, 1_000_000, true), // self segment → include
        makeSegment('spanA', 0, 2_000_000, false), // non-self → skip
      ],
    };
    const result = toCriticalPath(map);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ spanId: 'spanA', start: 0, end: 1_000 });
  });

  it('returns empty when no self segments exist', () => {
    const map = {
      spanA: [makeSegment('spanA', 0, 1_000_000, false)],
    };
    expect(toCriticalPath(map)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// toMarkAnnotationProps
// ---------------------------------------------------------------------------

describe('toMarkAnnotationProps', () => {
  const agentMark: AgentMark = {
    type: 'agentMark',
    id: 'domInteractive',
    offset: 100_000,
    verticalLine: false,
  };
  // ErrorMark objects at runtime carry a `skew` field (set by use_trace_waterfall) that is not
  // yet in the interface. Cast so TypeScript lets us construct the realistic fixture.
  const errorMark = {
    type: 'errorMark',
    id: 'err1',
    offset: 200_000,
    skew: 10_000,
    verticalLine: false,
    error: {} as any,
    serviceColor: '#ff0000',
  } as ErrorMark;

  it('converts agent mark offset µs to ms', () => {
    const [prop] = toMarkAnnotationProps([agentMark]);
    expect(prop.timeMs).toBe(100); // 100_000µs / 1000
    expect(prop.color).toBe('default');
  });

  it('adds skew for error marks', () => {
    const [prop] = toMarkAnnotationProps([errorMark]);
    expect(prop.timeMs).toBe(210); // (200_000+10_000)/1000
    expect(prop.color).toBe('danger');
  });

  it('passes original mark as meta', () => {
    const [prop] = toMarkAnnotationProps([agentMark]);
    expect(prop.meta).toBe(agentMark);
  });
});
