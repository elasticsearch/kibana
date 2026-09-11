/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { mapPointsResponse, mapPointsFromDatatable, type EsqlRawResponse } from './metric_points';
import type { Datatable } from '@kbn/expressions-plugin/common';

const METRIC = 'system.cpu.total.norm.pct';

function makeRaw(
  extraColumns: Array<{ name: string; type: string }> = [],
  extraValues: unknown[][] = []
): EsqlRawResponse {
  const columns = [
    { name: '@timestamp', type: 'date' },
    { name: METRIC, type: 'double' },
    ...extraColumns,
  ];
  const values = extraValues.length ? extraValues : [['2024-01-01T00:00:00.000Z', 0.42]];
  return { columns, values };
}

describe('mapPointsResponse', () => {
  it('maps a well-formed response to PointData', () => {
    const result = mapPointsResponse(makeRaw(), METRIC);
    expect(result).toEqual([
      { x: new Date('2024-01-01T00:00:00.000Z').getTime(), y: 0.42, details: [] },
    ]);
  });

  it('accepts epoch ms timestamps', () => {
    const ts = 1704067200000;
    const raw = makeRaw([], [[ts, 0.5]]);
    const result = mapPointsResponse(raw, METRIC);
    expect(result[0].x).toBe(ts);
  });

  it('coerces string y values to numbers', () => {
    const raw = makeRaw([], [['2024-01-01T00:00:00.000Z', '0.75']]);
    const result = mapPointsResponse(raw, METRIC);
    expect(result[0].y).toBe(0.75);
  });

  it('returns empty array when @timestamp column is missing', () => {
    const raw: EsqlRawResponse = {
      columns: [{ name: METRIC, type: 'double' }],
      values: [[0.42]],
    };
    expect(mapPointsResponse(raw, METRIC)).toEqual([]);
  });

  it('returns empty array when yAccessor column is missing', () => {
    const raw: EsqlRawResponse = {
      columns: [{ name: '@timestamp', type: 'date' }],
      values: [['2024-01-01T00:00:00.000Z']],
    };
    expect(mapPointsResponse(raw, METRIC)).toEqual([]);
  });

  it('filters out rows with null timestamp or y value', () => {
    const raw = makeRaw(
      [],
      [
        [null, 0.5],
        ['2024-01-01T00:00:00.000Z', null],
        ['2024-01-01T00:00:00.000Z', 0.3],
      ]
    );
    const result = mapPointsResponse(raw, METRIC);
    expect(result).toHaveLength(1);
    expect(result[0].y).toBe(0.3);
  });

  it('filters out rows with unparseable timestamp or y value', () => {
    const raw = makeRaw(
      [],
      [
        ['not-a-date', 0.5],
        ['2024-01-01T00:00:00.000Z', 'not-a-number'],
        ['2024-01-01T00:00:00.000Z', 0.9],
      ]
    );
    const result = mapPointsResponse(raw, METRIC);
    expect(result).toHaveLength(1);
    expect(result[0].y).toBe(0.9);
  });

  it('collects extra columns as details', () => {
    const raw = makeRaw(
      [{ name: 'trace.id', type: 'keyword' }],
      [['2024-01-01T00:00:00.000Z', 0.42, 'abc-123']]
    );
    const result = mapPointsResponse(raw, METRIC);
    expect(result[0].details).toEqual([{ field: 'trace.id', value: 'abc-123' }]);
  });

  it('omits detail entries with empty values', () => {
    const raw = makeRaw(
      [{ name: 'trace.id', type: 'keyword' }],
      [['2024-01-01T00:00:00.000Z', 0.42, null]]
    );
    const result = mapPointsResponse(raw, METRIC);
    expect(result[0].details).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// mapPointsFromDatatable — receives a Kibana Datatable (from esql expression fn)
// ---------------------------------------------------------------------------

function makeDatatable(
  extraCols: Array<{ id: string; name: string }> = [],
  rows: Array<Record<string, unknown>> = []
): Datatable {
  const columns = [
    { id: '@timestamp', name: '@timestamp', meta: { type: 'date' as const } },
    { id: METRIC, name: METRIC, meta: { type: 'number' as const } },
    ...extraCols.map((c) => ({ id: c.id, name: c.name, meta: { type: 'keyword' as const } })),
  ];
  const defaultRows = rows.length
    ? rows
    : [{ '@timestamp': '2024-01-01T00:00:00.000Z', [METRIC]: 0.42 }];
  return { type: 'datatable', columns, rows: defaultRows };
}

describe('mapPointsFromDatatable', () => {
  it('maps a well-formed Datatable to PointData', () => {
    const result = mapPointsFromDatatable(makeDatatable(), METRIC);
    expect(result).toEqual([
      { x: new Date('2024-01-01T00:00:00.000Z').getTime(), y: 0.42, details: [] },
    ]);
  });

  it('accepts epoch ms timestamps', () => {
    const ts = 1704067200000;
    const result = mapPointsFromDatatable(
      makeDatatable([], [{ '@timestamp': ts, [METRIC]: 0.5 }]),
      METRIC
    );
    expect(result[0].x).toBe(ts);
  });

  it('rejects malformed y values (Number coercion, not parseFloat)', () => {
    // parseFloat('0.75abc') = 0.75 but Number('0.75abc') = NaN — we want NaN
    const result = mapPointsFromDatatable(
      makeDatatable([], [{ '@timestamp': '2024-01-01T00:00:00.000Z', [METRIC]: '0.75abc' }]),
      METRIC
    );
    expect(result).toHaveLength(0);
  });

  it('returns empty array when @timestamp column is missing', () => {
    const table: Datatable = {
      type: 'datatable',
      columns: [{ id: METRIC, name: METRIC, meta: { type: 'number' } }],
      rows: [{ [METRIC]: 0.42 }],
    };
    expect(mapPointsFromDatatable(table, METRIC)).toEqual([]);
  });

  it('returns empty array when yAccessor column is missing', () => {
    const table: Datatable = {
      type: 'datatable',
      columns: [{ id: '@timestamp', name: '@timestamp', meta: { type: 'date' } }],
      rows: [{ '@timestamp': '2024-01-01T00:00:00.000Z' }],
    };
    expect(mapPointsFromDatatable(table, METRIC)).toEqual([]);
  });

  it('filters out rows with null timestamp or y value', () => {
    const result = mapPointsFromDatatable(
      makeDatatable(
        [],
        [
          { '@timestamp': null, [METRIC]: 0.5 },
          { '@timestamp': '2024-01-01T00:00:00.000Z', [METRIC]: null },
          { '@timestamp': '2024-01-01T00:00:00.000Z', [METRIC]: 0.3 },
        ]
      ),
      METRIC
    );
    expect(result).toHaveLength(1);
    expect(result[0].y).toBe(0.3);
  });

  it('collects extra columns as details', () => {
    const result = mapPointsFromDatatable(
      makeDatatable(
        [{ id: 'trace.id', name: 'trace.id' }],
        [{ '@timestamp': '2024-01-01T00:00:00.000Z', [METRIC]: 0.42, 'trace.id': 'abc-123' }]
      ),
      METRIC
    );
    expect(result[0].details).toEqual([{ field: 'trace.id', value: 'abc-123' }]);
  });

  it('omits detail entries with null values', () => {
    const result = mapPointsFromDatatable(
      makeDatatable(
        [{ id: 'trace.id', name: 'trace.id' }],
        [{ '@timestamp': '2024-01-01T00:00:00.000Z', [METRIC]: 0.42, 'trace.id': null }]
      ),
      METRIC
    );
    expect(result[0].details).toEqual([]);
  });
});
