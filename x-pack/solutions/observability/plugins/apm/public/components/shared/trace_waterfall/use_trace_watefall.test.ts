/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { renderHook } from '@testing-library/react';
import { WaterfallLegendType } from '../../../../common/waterfall/legend';
import type { TraceItem } from '../../../../common/waterfall/unified_trace_item';
import type { TraceWaterfallItem } from './use_trace_waterfall';
import {
  getTraceWaterfall,
  getTraceParentChildrenMap,
  getTraceWaterfallDuration,
  getClockSkew,
  getLegends,
  getColorByType,
  createColorLookupMap,
  getRootItemOrFallback,
  TraceDataState,
  useTraceWaterfall,
  getSubtreeIds,
} from './use_trace_waterfall';

jest.mock('@elastic/eui', () => ({
  euiPaletteColorBlind: jest.fn(({ rotations }) => {
    // Return a palette of 20 colors for testing
    return Array.from({ length: 10 * rotations }, (_, i) => `color${i}`);
  }),
}));

const root: TraceItem = {
  id: '1',
  timestampUs: new Date('2024-01-01T00:00:00.000Z').getTime() * 1000,
  name: 'root',
  traceId: 't1',
  duration: 1000,
  serviceName: 'svcA',
  errors: [],
  spanLinksCount: { incoming: 0, outgoing: 0 },
  docType: 'transaction',
};
const child1: TraceItem = {
  id: '2',
  parentId: '1',
  timestampUs: new Date('2024-01-01T00:00:00.500Z').getTime() * 1000,
  name: 'child1',
  traceId: 't1',
  duration: 400,
  serviceName: 'svcB',
  errors: [],
  spanLinksCount: { incoming: 0, outgoing: 0 },
  docType: 'span',
};
const child2: TraceItem = {
  id: '3',
  parentId: '1',
  timestampUs: new Date('2024-01-01T00:00:00.800Z').getTime() * 1000,
  name: 'child2',
  traceId: 't1',
  duration: 100,
  serviceName: 'svcC',
  errors: [],
  spanLinksCount: { incoming: 0, outgoing: 0 },
  docType: 'span',
};
const grandchild: TraceItem = {
  id: '4',
  parentId: '2',
  timestampUs: new Date('2024-01-01T00:00:01.000Z').getTime() * 1000,
  name: 'grandchild',
  traceId: 't1',
  duration: 50,
  serviceName: 'svcD',
  errors: [],
  spanLinksCount: { incoming: 0, outgoing: 0 },
  docType: 'span',
};

describe('getFlattenedTraceWaterfall', () => {
  afterAll(() => {
    jest.clearAllMocks();
  });

  const parentChildMap = {
    root: [root],
    '1': [child1, child2],
    '2': [grandchild],
  };

  it('returns a flattened waterfall with correct depth, offset, and skew', () => {
    const result = getTraceWaterfall({
      rootItem: root,
      parentChildMap,
      orphans: [],
    });

    expect(result.map((i) => i.id)).toEqual(['1', '2', '4', '3']);

    expect(result[0]).toMatchObject({
      id: '1',
      depth: 0,
      offset: 0,
      skew: 0,
    });

    expect(result[1]).toMatchObject({
      id: '2',
      depth: 1,
    });

    expect(result[2]).toMatchObject({
      id: '4',
      depth: 2,
    });

    expect(result[3]).toMatchObject({
      id: '3',
      depth: 1,
    });

    expect(result[1].offset).toBe(500000); // child1: 0.5s after root
    expect(result[2].offset).toBe(1000000); // grandchild: 1s after root
    expect(result[3].offset).toBe(800000); // child2: 0.8s after root
  });

  it('returns only the root if there are no children', () => {
    const result = getTraceWaterfall({
      rootItem: root,
      parentChildMap: {},
      orphans: [],
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
    expect(result[0].depth).toBe(0);
  });

  it('sorts children by timestamp', () => {
    const unorderedMap = {
      root: [root],
      '1': [child2, child1], // child2 timestamp is after child1
      '2': [grandchild],
    };
    const result = getTraceWaterfall({
      rootItem: root,
      parentChildMap: unorderedMap,
      orphans: [],
    });
    expect(result.map((i) => i.id)).toEqual(['1', '2', '4', '3']);
  });

  it('reparents orphan spans', () => {
    const result = getTraceWaterfall({
      rootItem: root,
      parentChildMap: {},
      orphans: [grandchild],
    });

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('1');
    expect(result[0].depth).toBe(0);
    expect(result[1].id).toBe('4');
    expect(result[1].depth).toBe(1);
  });

  it('keeps stable preorder output for deeper trees', () => {
    const deepRootTimestamp = new Date('2024-01-01T00:00:00.000Z').getTime() * 1000;

    const deepRoot: TraceItem = {
      id: 'root-deep',
      timestampUs: deepRootTimestamp,
      name: 'root-deep',
      traceId: 'trace-deep',
      duration: 5000000,
      serviceName: 'svcRoot',
      errors: [],
      spanLinksCount: { incoming: 0, outgoing: 0 },
      docType: 'transaction',
    };

    const deepChildren: TraceItem[] = Array.from({ length: 12 }, (_, index) => {
      const id = `deep-${index + 1}`;
      return {
        id,
        parentId: index === 0 ? deepRoot.id : `deep-${index}`,
        timestampUs: deepRootTimestamp + (index + 1) * 1000,
        name: id,
        traceId: 'trace-deep',
        duration: 1000 - index,
        serviceName: `svc-${index + 1}`,
        errors: [],
        spanLinksCount: { incoming: 0, outgoing: 0 },
        docType: 'span',
      };
    });

    const siblingEarly: TraceItem = {
      id: 'sibling-early',
      parentId: deepRoot.id,
      timestampUs: deepRootTimestamp + 500,
      name: 'sibling-early',
      traceId: 'trace-deep',
      duration: 20,
      serviceName: 'svcSiblingEarly',
      errors: [],
      spanLinksCount: { incoming: 0, outgoing: 0 },
      docType: 'span',
    };

    const siblingLate: TraceItem = {
      id: 'sibling-late',
      parentId: deepRoot.id,
      timestampUs: deepRootTimestamp + 2000,
      name: 'sibling-late',
      traceId: 'trace-deep',
      duration: 30,
      serviceName: 'svcSiblingLate',
      errors: [],
      spanLinksCount: { incoming: 0, outgoing: 0 },
      docType: 'span',
    };

    const deepMap = getTraceParentChildrenMap(
      [deepRoot, ...deepChildren, siblingEarly, siblingLate],
      false
    );

    const result = getTraceWaterfall({
      rootItem: deepRoot,
      parentChildMap: deepMap,
      orphans: [],
    });

    expect(result.map((item) => item.id)).toEqual([
      'root-deep',
      'sibling-early',
      'deep-1',
      'deep-2',
      'deep-3',
      'deep-4',
      'deep-5',
      'deep-6',
      'deep-7',
      'deep-8',
      'deep-9',
      'deep-10',
      'deep-11',
      'deep-12',
      'sibling-late',
    ]);

    expect(result.map((item) => item.depth)).toEqual([
      0, // root-deep
      1, // sibling-early
      1, // deep-1
      2, // deep-2
      3, // deep-3
      4, // deep-4
      5, // deep-5
      6, // deep-6
      7, // deep-7
      8, // deep-8
      9, // deep-9
      10, // deep-10
      11, // deep-11
      12, // deep-12
      1, // sibling-late
    ]);
  });

  it('errors when it encounters invalid trace documents', () => {
    // We have a duplicate span id, that is both a root span and a child span
    // This indicates an instrumentation error. We should never be hitting this
    // particular case in normal/correctly configured tracing.
    const invalidSpans: TraceItem[] = [
      {
        id: 'b5',
        timestampUs: 1761915724030561,
        name: 'GET /a/{b}',
        traceId: 'dd31',
        duration: 22750,
        status: { fieldName: 'event.outcome', value: 'success' },
        errors: [],
        serviceName: 'svcA',
        spanLinksCount: { incoming: 0, outgoing: 0 },
        docType: 'transaction',
      },
      {
        id: 'd8',
        timestampUs: 1761915725590821,
        name: 'a/2',
        traceId: 'dd31',
        duration: 140000,
        status: { fieldName: 'event.outcome', value: 'unknown' },
        errors: [],
        serviceName: 'svcb',
        parentId: 'b5',
        spanLinksCount: { incoming: 0, outgoing: 0 },
        docType: 'span',
      },
      {
        id: '9d',
        timestampUs: 1761915725590821,
        name: 'Redirect',
        traceId: 'dd31',
        duration: 54000,
        status: { fieldName: 'event.outcome', value: 'unknown' },
        errors: [],
        parentId: 'd8',
        serviceName: 'svcb',
        type: 'browser-timing',
        spanLinksCount: { incoming: 0, outgoing: 0 },
        docType: 'span',
      },
      {
        id: 'b5',
        timestampUs: 1761915725645821,
        name: 'Request',
        traceId: 'dd31',
        duration: 24000,
        status: { fieldName: 'event.outcome', value: 'unknown' },
        errors: [],
        parentId: 'd8',
        serviceName: 'svcb',
        type: 'browser-timing',
        spanLinksCount: { incoming: 0, outgoing: 0 },
        docType: 'span',
      },
    ];

    const invalidMap = getTraceParentChildrenMap(invalidSpans, false);

    const { orphans, rootItem } = getRootItemOrFallback(invalidMap, invalidSpans);

    expect(() =>
      getTraceWaterfall({
        rootItem: rootItem!,
        parentChildMap: invalidMap,
        orphans: orphans!,
      })
    ).toThrowError('Duplicate span id detected');
  });
});

describe('getLegends', () => {
  afterAll(() => {
    jest.clearAllMocks();
  });
  it('assigns a unique color to each resource', () => {
    const traceItems: TraceItem[] = [
      {
        id: '1',
        timestampUs: 0,
        name: '',
        traceId: '',
        duration: 1,
        serviceName: 'svcA',
        errors: [],
        spanLinksCount: { incoming: 0, outgoing: 0 },
        docType: 'transaction',
      },
      {
        id: '2',
        timestampUs: 0,
        name: '',
        traceId: '',
        duration: 1,
        serviceName: 'svcB',
        errors: [],
        spanLinksCount: { incoming: 0, outgoing: 0 },
        docType: 'span',
      },
      {
        id: '3',
        timestampUs: 0,
        name: '',
        traceId: '',
        duration: 1,
        serviceName: 'svcC',
        errors: [],
        spanLinksCount: { incoming: 0, outgoing: 0 },
        docType: 'span',
      },
      {
        id: '4',
        timestampUs: 0,
        name: '',
        traceId: '',
        duration: 1,
        serviceName: 'svcC',
        type: 'db',
        errors: [],
        spanLinksCount: { incoming: 0, outgoing: 0 },
        docType: 'span',
      },
      {
        id: '5',
        timestampUs: 0,
        name: '',
        traceId: '',
        duration: 1,
        serviceName: 'svcC',
        type: 'http',
        errors: [],
        spanLinksCount: { incoming: 0, outgoing: 0 },
        docType: 'span',
      },
      {
        id: '6',
        timestampUs: 0,
        name: '',
        traceId: '',
        duration: 1,
        serviceName: 'svcC',
        type: 'cache',
        errors: [],
        spanLinksCount: { incoming: 0, outgoing: 0 },
        docType: 'span',
      },
    ];

    const result = getLegends(traceItems);
    expect(result).toEqual([
      { type: WaterfallLegendType.ServiceName, value: 'svcA', color: 'color0' },
      { type: WaterfallLegendType.ServiceName, value: 'svcB', color: 'color1' },
      { type: WaterfallLegendType.ServiceName, value: 'svcC', color: 'color2' },
      { type: WaterfallLegendType.Type, value: '', color: 'color3' }, // needed in the legends component to display the service name when colorBy is Type
      { type: WaterfallLegendType.Type, value: 'db', color: 'color4' },
      { type: WaterfallLegendType.Type, value: 'http', color: 'color5' },
      { type: WaterfallLegendType.Type, value: 'cache', color: 'color6' },
    ]);
  });

  it('handles duplicate resource names gracefully', () => {
    const traceItems: TraceItem[] = [
      {
        id: '1',
        timestampUs: 0,
        name: '',
        traceId: '',
        duration: 1,
        serviceName: 'svcA',
        errors: [],
        spanLinksCount: { incoming: 0, outgoing: 0 },
        docType: 'transaction',
      },
      {
        id: '2',
        timestampUs: 0,
        name: '',
        traceId: '',
        duration: 1,
        serviceName: 'svcA',
        errors: [],
        spanLinksCount: { incoming: 0, outgoing: 0 },
        docType: 'span',
      },
      {
        id: '3',
        timestampUs: 0,
        name: '',
        traceId: '',
        duration: 1,
        serviceName: 'svcB',
        errors: [],
        spanLinksCount: { incoming: 0, outgoing: 0 },
        docType: 'span',
      },
      {
        id: '5',
        timestampUs: 0,
        name: '',
        traceId: '',
        duration: 1,
        serviceName: 'svcB',
        type: 'http',
        errors: [],
        spanLinksCount: { incoming: 0, outgoing: 0 },
        docType: 'span',
      },
      {
        id: '6',
        timestampUs: 0,
        name: '',
        traceId: '',
        duration: 1,
        serviceName: 'svcB',
        type: 'http',
        errors: [],
        spanLinksCount: { incoming: 0, outgoing: 0 },
        docType: 'span',
      },
    ];

    const result = getLegends(traceItems);

    expect(result).toEqual([
      { type: WaterfallLegendType.ServiceName, value: 'svcA', color: 'color0' },
      { type: WaterfallLegendType.ServiceName, value: 'svcB', color: 'color1' },
      { type: WaterfallLegendType.Type, value: '', color: 'color2' }, // needed in the legends component to display the service name when colorBy is Type
      { type: WaterfallLegendType.Type, value: 'http', color: 'color3' },
    ]);
  });

  it('returns an empty object if no traceItems are provided', () => {
    const result = getLegends([]);
    expect(result).toEqual([]);
  });

  it('rotates the palette if there are more than 10 unique resources', () => {
    const traceItems: TraceItem[] = Array.from({ length: 15 }, (_, i) => ({
      id: `${i}`,
      timestampUs: 0,
      name: '',
      traceId: '',
      duration: 1,
      serviceName: `svc${i}`,
      errors: [],
      spanLinksCount: { incoming: 0, outgoing: 0 },
      docType: i === 0 ? 'transaction' : 'span',
    })) as TraceItem[];

    const result = getLegends(traceItems);

    expect(Object.keys(result)).toHaveLength(16); // 15+1 for legends component to display the service name when colorBy is Type

    expect(result[0].color).toBe('color0');
    expect(result[10].color).toBe('color10');
    expect(result[14].color).toBe('color14');
  });
});

describe('getColorByType', () => {
  const traceItems: TraceItem[] = [
    {
      id: '1',
      timestampUs: 0,
      name: '',
      traceId: '',
      duration: 1,
      serviceName: 'svcA',
      errors: [],
      spanLinksCount: { incoming: 0, outgoing: 0 },
      docType: 'transaction',
    },
    {
      id: '2',
      timestampUs: 0,
      name: '',
      traceId: '',
      duration: 1,
      serviceName: 'svcB',
      errors: [],
      spanLinksCount: { incoming: 0, outgoing: 0 },
      docType: 'span',
    },
    {
      id: '3',
      timestampUs: 0,
      name: '',
      traceId: '',
      duration: 1,
      serviceName: 'svcC',
      errors: [],
      spanLinksCount: { incoming: 0, outgoing: 0 },
      docType: 'span',
    },
    {
      id: '4',
      timestampUs: 0,
      name: '',
      traceId: '',
      duration: 1,
      serviceName: 'svcC',
      type: 'db',
      errors: [],
      spanLinksCount: { incoming: 0, outgoing: 0 },
      docType: 'span',
    },
    {
      id: '5',
      timestampUs: 0,
      name: '',
      traceId: '',
      duration: 1,
      serviceName: 'svcC',
      type: 'http',
      errors: [],
      spanLinksCount: { incoming: 0, outgoing: 0 },
      docType: 'span',
    },
    {
      id: '6',
      timestampUs: 0,
      name: '',
      traceId: '',
      duration: 1,
      serviceName: 'svcC',
      type: 'cache',
      errors: [],
      spanLinksCount: { incoming: 0, outgoing: 0 },
      docType: 'span',
    },
  ];

  it('returns color by service name if more than one different service is present', () => {
    const legends = getLegends(traceItems);

    expect(getColorByType(legends)).toBe(WaterfallLegendType.ServiceName);
  });

  it('returns color by type if only one service is present and types have values', () => {
    const legends = getLegends(traceItems.slice(3));

    expect(getColorByType(legends)).toBe(WaterfallLegendType.Type);
  });

  it('returns color by service name if only one service is present and types are empty', () => {
    const legends = getLegends(traceItems.slice(0, 1));

    expect(getColorByType(legends)).toBe(WaterfallLegendType.ServiceName);
  });

  it('defaults to color by type if no legends provided', () => {
    const legends = getLegends([]);

    expect(getColorByType(legends)).toBe(WaterfallLegendType.Type);
  });
});

describe('createColorLookupMap', () => {
  afterAll(() => {
    jest.clearAllMocks();
  });

  it('create map of colors', () => {
    const legends = [
      { type: WaterfallLegendType.ServiceName, value: 'svcA', color: 'red' },
      { type: WaterfallLegendType.ServiceName, value: 'svcB', color: 'blue' },
      { type: WaterfallLegendType.Type, value: 'db', color: 'green' },
    ];

    const result = createColorLookupMap(legends);

    expect(result.get('serviceName:svcA')).toBe('red');
    expect(result.get('serviceName:svcB')).toBe('blue');
    expect(result.get('type:db')).toBe('green');
  });
});

describe('getTraceParentChildrenMap', () => {
  afterAll(() => {
    jest.clearAllMocks();
  });
  it('maps root and children correctly', () => {
    const items: TraceItem[] = [
      {
        id: '1',
        timestampUs: 0,
        name: 'root',
        traceId: 't1',
        duration: 100,
        serviceName: 'svcA',
        errors: [],
        spanLinksCount: { incoming: 0, outgoing: 0 },
        docType: 'transaction',
      },
      {
        id: '2',
        timestampUs: 0,
        name: 'child1',
        traceId: 't1',
        duration: 50,
        serviceName: 'svcB',
        parentId: '1',
        errors: [],
        spanLinksCount: { incoming: 0, outgoing: 0 },
        docType: 'span',
      },
      {
        id: '3',
        timestampUs: 0,
        name: 'child2',
        traceId: 't1',
        duration: 30,
        serviceName: 'svcC',
        parentId: '1',
        errors: [],
        spanLinksCount: { incoming: 0, outgoing: 0 },
        docType: 'span',
      },
      {
        id: '4',
        timestampUs: 0,
        name: 'grandchild',
        traceId: 't1',
        duration: 10,
        serviceName: 'svcD',
        parentId: '2',
        errors: [],
        spanLinksCount: { incoming: 0, outgoing: 0 },
        docType: 'span',
      },
    ];

    const result = getTraceParentChildrenMap(items, false);

    expect(result.root).toEqual([expect.objectContaining({ id: '1' })]);
    expect(result['1']).toEqual([
      expect.objectContaining({ id: '2' }),
      expect.objectContaining({ id: '3' }),
    ]);
    expect(result['2']).toEqual([expect.objectContaining({ id: '4' })]);
  });

  it('returns only root if there are no children', () => {
    const items: TraceItem[] = [
      {
        id: '1',
        timestampUs: 0,
        name: 'root',
        traceId: 't1',
        duration: 100,
        serviceName: 'svcA',
        errors: [],
        spanLinksCount: { incoming: 0, outgoing: 0 },
        docType: 'transaction',
      },
    ];

    const result = getTraceParentChildrenMap(items, false);

    expect(result.root).toEqual([expect.objectContaining({ id: '1' })]);
    expect(Object.keys(result)).toHaveLength(1);
  });

  it('handles multiple roots (should only keep the last as root)', () => {
    const items: TraceItem[] = [
      {
        id: '1',
        timestampUs: 0,
        name: 'root1',
        traceId: 't1',
        duration: 100,
        serviceName: 'svcA',
        errors: [],
        spanLinksCount: { incoming: 0, outgoing: 0 },
        docType: 'transaction',
      },
      {
        id: '2',
        timestampUs: 0,
        name: 'root2',
        traceId: 't1',
        duration: 100,
        serviceName: 'svcB',
        errors: [],
        spanLinksCount: { incoming: 0, outgoing: 0 },
        docType: 'transaction',
      },
    ];

    const result = getTraceParentChildrenMap(items, false);

    expect(result.root).toEqual([expect.objectContaining({ id: '2' })]);
  });

  it("elects a root if there isn't one for a filtered trace", () => {
    const items: TraceItem[] = [
      {
        id: '1',
        timestampUs: 0,
        name: 'span1',
        parentId: '0',
        traceId: 't1',
        duration: 100,
        serviceName: 'svcA',
        errors: [],
        spanLinksCount: { incoming: 0, outgoing: 0 },
        docType: 'span',
      },
      {
        id: '2',
        timestampUs: 0,
        name: 'span2',
        parentId: '1',
        traceId: 't1',
        duration: 100,
        serviceName: 'svcB',
        errors: [],
        spanLinksCount: { incoming: 0, outgoing: 0 },
        docType: 'span',
      },
    ];

    const result = getTraceParentChildrenMap(items, true);

    expect(result.root).toEqual([expect.objectContaining({ id: '1' })]);
  });

  it('returns an empty object for empty input', () => {
    const result = getTraceParentChildrenMap([], false);
    expect(result).toEqual({});
  });
});

describe('getRootItemOrFallback', () => {
  it('should return a FULL state and a rootItem for a complete trace', () => {
    const traceData = [root, child1, child2, grandchild];

    const result = getRootItemOrFallback(getTraceParentChildrenMap(traceData, false), traceData);

    expect(result.rootItem).toEqual(root);
    expect(result.traceState).toBe(TraceDataState.Full);
    expect(result.orphans).toEqual([]);
  });

  it('should return an EMPTY state for an empty trace', () => {
    const result = getRootItemOrFallback({}, []);

    expect(result.rootItem).toBeUndefined();
    expect(result.traceState).toBe(TraceDataState.Empty);
    expect(result.orphans).toBeUndefined();
  });

  it('should return a PARTIAL state for an incomplete trace with no root span', () => {
    const traceData = [child1, grandchild];

    const result = getRootItemOrFallback(getTraceParentChildrenMap(traceData, false), traceData);

    expect(result.rootItem).toEqual(child1);
    expect(result.traceState).toBe(TraceDataState.Partial);
    expect(result.orphans).toEqual([]);
  });

  it('should return a PARTIAL state for an incomplete trace with orphan child spans', () => {
    const traceData = [root, child2, grandchild];

    const result = getRootItemOrFallback(getTraceParentChildrenMap(traceData, false), traceData);

    expect(result.rootItem).toEqual(root);
    expect(result.traceState).toBe(TraceDataState.Partial);
    expect(result.orphans).toEqual([grandchild]);
  });

  it('should return a FULL state for a filtered service trace with no orphan child spans', () => {
    const serviceChild = { ...grandchild, serviceName: 'svcB' };

    const traceData = [child1, serviceChild];

    const result = getRootItemOrFallback(getTraceParentChildrenMap(traceData, true), traceData);

    expect(result.rootItem).toEqual(child1);
    expect(result.traceState).toBe(TraceDataState.Full);
    expect(result.orphans).toEqual([]);
  });
});

describe('getTraceWaterfallDuration', () => {
  afterAll(() => {
    jest.clearAllMocks();
  });
  it('returns the max sum of offset + skew + duration', () => {
    const items: TraceWaterfallItem[] = [
      {
        id: '1',
        timestampUs: 0,
        name: '',
        traceId: '',
        duration: 100,
        serviceName: 'svcA',
        depth: 0,
        offset: 0,
        skew: 0,
        color: 'red',
        errors: [],
        isOrphan: false,
        spanLinksCount: { incoming: 0, outgoing: 0 },
        docType: 'transaction',
      },
      {
        id: '2',
        timestampUs: 0,
        name: '',
        traceId: '',
        duration: 50,
        serviceName: 'svcB',
        depth: 1,
        offset: 80,
        skew: 10,
        color: 'blue',
        errors: [],
        isOrphan: false,
        spanLinksCount: { incoming: 0, outgoing: 0 },
        docType: 'span',
      },
      {
        id: '3',
        timestampUs: 0,
        name: '',
        traceId: '',
        duration: 30,
        serviceName: 'svcC',
        depth: 1,
        offset: 120,
        skew: 5,
        color: 'green',
        errors: [],
        isOrphan: false,
        spanLinksCount: { incoming: 0, outgoing: 0 },
        docType: 'span',
      },
    ];
    expect(getTraceWaterfallDuration(items)).toBe(155);
  });

  it('returns 0 for empty input', () => {
    expect(getTraceWaterfallDuration([])).toBe(0);
  });
});

describe('getclockSkew', () => {
  afterAll(() => {
    jest.clearAllMocks();
  });
  const parent = {
    timestampUs: new Date('2024-01-01T00:00:00.000Z').getTime() * 1000,
    duration: 1000,
    skew: 0,
  } as unknown as TraceWaterfallItem;

  it('returns 0 if no parent is provided', () => {
    const result = getClockSkew({ itemTimestamp: 1000000, itemDuration: 500 });
    expect(result).toBe(0);
  });

  it('returns 0 when item started after its parent', () => {
    const result = getClockSkew({
      itemTimestamp: new Date('2024-01-01T00:00:10.000Z').getTime() * 1000,
      itemDuration: 500,
      parent,
    });
    expect(result).toBe(0);
  });

  it('returns correct skew when item started before its parent', () => {
    const result = getClockSkew({
      itemTimestamp: new Date('2024-01-01T00:00:00.000Z').getTime() * 1000,
      itemDuration: 500,
      parent: { ...parent, timestampUs: new Date('2024-01-01T00:00:01.000Z').getTime() * 1000 },
    });
    expect(result).toBe(1000250);
  });

  it('latency is never negative', () => {
    const parentWithSkew = {
      ...parent,
      timestampUs: new Date('2024-01-01T00:00:01.000Z').getTime() * 1000,
      duration: 400,
      skew: 0,
    } as unknown as TraceWaterfallItem;
    const result = getClockSkew({
      itemTimestamp: new Date('2024-01-01T00:00:00.000Z').getTime() * 1000,
      itemDuration: 500,
      parent: parentWithSkew,
    });
    expect(result).toBe(1000000);
  });

  it('uses parent.skew in parentStart calculation', () => {
    const parentWithSkew = {
      ...parent,
      timestampUs: new Date('2024-01-01T00:00:01.000Z').getTime() * 1000,
      skew: 100,
    } as unknown as TraceWaterfallItem;

    const result = getClockSkew({
      itemTimestamp: new Date('2024-01-01T00:00:00.000Z').getTime() * 1000,
      itemDuration: 500,
      parent: parentWithSkew,
    });
    expect(result).toBe(1000350);
  });
});

describe('getSubtreeIds', () => {
  const parentChildMap = {
    root: [root],
    '1': [child1, child2],
    '2': [grandchild],
  };

  it('returns the root id and all descendant ids', () => {
    const result = getSubtreeIds(parentChildMap, '1');
    expect(result).toEqual(expect.arrayContaining(['1', '2', '3', '4']));
    expect(result).toHaveLength(4);
  });

  it('returns only the given id when it has no children', () => {
    const result = getSubtreeIds(parentChildMap, '3');
    expect(result).toEqual(['3']);
  });

  it('returns a partial subtree starting from a non-root node', () => {
    const result = getSubtreeIds(parentChildMap, '2');
    expect(result).toEqual(expect.arrayContaining(['2', '4']));
    expect(result).toHaveLength(2);
  });
});

describe('useTraceWaterfall - legends from filtered subtree', () => {
  it('does not treat an orphan ancestor of the selected transaction as a duplicate span', () => {
    const traceItems: TraceItem[] = [
      {
        id: 'service-parent',
        parentId: 'upstream-root',
        timestampUs: 0,
        name: 'service-parent',
        traceId: 'trace1',
        duration: 1000,
        serviceName: 'checkout-service',
        errors: [],
        spanLinksCount: { incoming: 0, outgoing: 0 },
        docType: 'transaction',
      },
      {
        id: 'entry-transaction',
        parentId: 'service-parent',
        timestampUs: 100,
        name: 'entry-transaction',
        traceId: 'trace1',
        duration: 500,
        serviceName: 'checkout-service',
        errors: [],
        spanLinksCount: { incoming: 0, outgoing: 0 },
        docType: 'transaction',
      },
      {
        id: 'entry-child-span',
        parentId: 'entry-transaction',
        timestampUs: 150,
        name: 'entry-child-span',
        traceId: 'trace1',
        duration: 100,
        serviceName: 'checkout-service',
        errors: [],
        spanLinksCount: { incoming: 0, outgoing: 0 },
        docType: 'span',
      },
    ];

    const { result } = renderHook(() =>
      useTraceWaterfall({
        traceItems,
        entryTransactionId: 'entry-transaction',
      })
    );

    expect(result.current.traceState).toBe(TraceDataState.Partial);
    expect(result.current.traceWaterfall.map((item) => item.id)).toEqual([
      'entry-transaction',
      'entry-child-span',
    ]);
  });

  it('reparents non-ancestor orphans below the selected transaction', () => {
    const traceItems: TraceItem[] = [
      {
        id: 'entry-transaction',
        parentId: 'service-parent',
        timestampUs: 100,
        name: 'entry-transaction',
        traceId: 'trace1',
        duration: 500,
        serviceName: 'checkout-service',
        errors: [],
        spanLinksCount: { incoming: 0, outgoing: 0 },
        docType: 'transaction',
      },
      {
        id: 'entry-child-span',
        parentId: 'entry-transaction',
        timestampUs: 150,
        name: 'entry-child-span',
        traceId: 'trace1',
        duration: 100,
        serviceName: 'checkout-service',
        errors: [],
        spanLinksCount: { incoming: 0, outgoing: 0 },
        docType: 'span',
      },
      {
        id: 'genuine-orphan',
        parentId: 'missing-parent',
        timestampUs: 200,
        name: 'genuine-orphan',
        traceId: 'trace1',
        duration: 50,
        serviceName: 'checkout-service',
        errors: [],
        spanLinksCount: { incoming: 0, outgoing: 0 },
        docType: 'span',
      },
    ];

    const { result } = renderHook(() =>
      useTraceWaterfall({
        traceItems,
        entryTransactionId: 'entry-transaction',
      })
    );

    expect(result.current.traceState).toBe(TraceDataState.Partial);
    expect(result.current.traceWaterfall.map((item) => item.id)).toEqual([
      'entry-transaction',
      'entry-child-span',
      'genuine-orphan',
    ]);
    expect(result.current.traceWaterfall[2]).toMatchObject({
      id: 'genuine-orphan',
      parentId: 'entry-transaction',
      isOrphan: true,
    });
  });

  it('calculates legends only from visible subtree when entryTransactionId is provided', () => {
    const traceItems: TraceItem[] = [
      {
        id: 'root',
        timestampUs: 0,
        name: 'root-tx',
        traceId: 'trace1',
        duration: 1000,
        serviceName: 'api-gateway',
        errors: [],
        spanLinksCount: { incoming: 0, outgoing: 0 },
        docType: 'transaction',
      },
      {
        id: 'child',
        parentId: 'root',
        timestampUs: 100,
        name: 'child-span',
        traceId: 'trace1',
        duration: 500,
        serviceName: 'email-worker',
        errors: [],
        spanLinksCount: { incoming: 0, outgoing: 0 },
        docType: 'span',
      },
      {
        id: 'unrelated-root',
        timestampUs: 0,
        name: 'unrelated-tx',
        traceId: 'trace1',
        duration: 2000,
        serviceName: 'unrelated-service',
        errors: [],
        spanLinksCount: { incoming: 0, outgoing: 0 },
        docType: 'transaction',
      },
    ];

    const { result } = renderHook(() =>
      useTraceWaterfall({
        traceItems,
        entryTransactionId: 'child',
      })
    );

    const legendValues = result.current.legends.map((l) => l.value);

    expect(legendValues).toContain('email-worker');

    expect(legendValues).not.toContain('unrelated-service');
    expect(legendValues).not.toContain('api-gateway');
  });

  it('includes orphans in legends calculation', () => {
    const traceItems: TraceItem[] = [
      {
        id: 'root-tx-1',
        timestampUs: 0,
        name: 'root-tx',
        traceId: 'trace1',
        duration: 1000,
        serviceName: 'api-gateway',
        errors: [],
        spanLinksCount: { incoming: 0, outgoing: 0 },
        docType: 'transaction',
      },
      {
        id: 'orphan',
        parentId: 'missing-parent',
        timestampUs: 100,
        name: 'orphan-span',
        traceId: 'trace1',
        duration: 500,
        serviceName: 'orphan-service',
        errors: [],
        spanLinksCount: { incoming: 0, outgoing: 0 },
        docType: 'span',
      },
    ];

    const { result } = renderHook(() =>
      useTraceWaterfall({
        traceItems,
      })
    );

    const legendValues = result.current.legends.map((l) => l.value);

    expect(legendValues).toContain('orphan-service');
    expect(legendValues).toContain('api-gateway');
  });

  it('calculates legends from full trace when no entryTransactionId is provided', () => {
    const traceItems: TraceItem[] = [
      {
        id: 'root-tx-1',
        timestampUs: 0,
        name: 'root-tx',
        traceId: 'trace1',
        duration: 1000,
        serviceName: 'api-gateway',
        errors: [],
        spanLinksCount: { incoming: 0, outgoing: 0 },
        docType: 'transaction',
      },
      {
        id: 'child',
        parentId: 'root-tx-1',
        timestampUs: 100,
        name: 'child-span',
        traceId: 'trace1',
        duration: 500,
        serviceName: 'email-worker',
        errors: [],
        spanLinksCount: { incoming: 0, outgoing: 0 },
        docType: 'span',
      },
    ];

    const { result } = renderHook(() =>
      useTraceWaterfall({
        traceItems,
      })
    );

    const legendValues = result.current.legends.map((l) => l.value);

    expect(legendValues).toContain('api-gateway');
    expect(legendValues).toContain('email-worker');
  });
});
