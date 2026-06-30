/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Datatable } from '@kbn/expressions-plugin/common';
import {
  buildChangePointCards,
  formatAnnotationTimestamp,
  getCardForRow,
} from './derive_change_point_cards';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeTable = (columns: Datatable['columns'], rows: Datatable['rows']): Datatable => ({
  type: 'datatable',
  columns,
  rows,
});

// ─── Shared ES|QL queries ────────────────────────────────────────────────────

const ESQL_NO_BY =
  'FROM idx | STATS avg_bytes = AVG(bytes) BY bucket = BUCKET(@timestamp, 1 day) | CHANGE_POINT avg_bytes ON bucket';

const ESQL_WITH_HOST_BY =
  'FROM idx | STATS avg_bytes = AVG(bytes) BY host, bucket = BUCKET(@timestamp, 1 day) | CHANGE_POINT avg_bytes ON bucket BY host';

const ESQL_MULTI_BY =
  'FROM idx | STATS avg_bytes = AVG(bytes) BY host, service, bucket = BUCKET(@timestamp, 1 day) | CHANGE_POINT avg_bytes ON bucket BY host, service';

// ─── Shared column schemas ───────────────────────────────────────────────────

const COLUMNS_NO_BY = [
  { id: 'bucket', name: 'bucket', meta: { type: 'date' as const } },
  { id: 'avg_bytes', name: 'avg_bytes', meta: { type: 'number' as const } },
  { id: 'type', name: 'type', meta: { type: 'string' as const } },
  { id: 'pvalue', name: 'pvalue', meta: { type: 'number' as const } },
];

const COLUMNS_WITH_HOST = [
  { id: 'host', name: 'host', meta: { type: 'string' as const } },
  { id: 'bucket', name: 'bucket', meta: { type: 'date' as const } },
  { id: 'avg_bytes', name: 'avg_bytes', meta: { type: 'number' as const } },
  { id: 'type', name: 'type', meta: { type: 'string' as const } },
  { id: 'pvalue', name: 'pvalue', meta: { type: 'number' as const } },
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('derive_change_point_cards', () => {
  describe('formatAnnotationTimestamp', () => {
    it('formats epoch ms as ISO', () => {
      const ms = Date.parse('2023-11-14T22:13:20.000Z');
      expect(formatAnnotationTimestamp(ms)).toBe('2023-11-14T22:13:20.000Z');
    });

    it('parses ISO-like strings', () => {
      expect(formatAnnotationTimestamp('2023-11-14T22:13:20.000Z')).toBe(
        '2023-11-14T22:13:20.000Z'
      );
    });

    it('parses Discover-style bucket strings with a numeric timezone offset', () => {
      const s = '2021-12-20T00:00:00.000-07:00';
      expect(formatAnnotationTimestamp(s)).toBe(new Date(s).toISOString());
    });

    it('parses 13-digit epoch-millisecond strings', () => {
      // Regression: value.length < 13 excluded 13-digit strings from the numeric branch, and
      // Date.parse() returns NaN for plain numeric strings, so they fell through to undefined.
      expect(formatAnnotationTimestamp('1700000000000')).toBe(
        new Date(1700000000000).toISOString()
      );
    });
  });

  describe('buildChangePointCards', () => {
    // Shared table used by multiple single-series tests below.
    const noByTable = makeTable(COLUMNS_NO_BY, [
      { bucket: '2023-11-14T00:00:00.000Z', avg_bytes: 12, type: '', pvalue: null },
      { bucket: '2023-11-15T00:00:00.000Z', avg_bytes: 14, type: 'mean_shift', pvalue: 0.001 },
    ]);

    it('returns undefined without a table', () => {
      expect(buildChangePointCards({ table: undefined, esql: ESQL_NO_BY })).toBeUndefined();
    });

    it('builds one card with annotations from typed rows', () => {
      const cards = buildChangePointCards({ table: noByTable, esql: ESQL_NO_BY });

      expect(cards).toHaveLength(1);
      expect(cards![0].lineEsql).toContain('FROM idx');
      expect(cards![0].lineEsql).toContain('STATS avg_bytes');
      expect(cards![0].annotationEvents).toHaveLength(1);
      expect(cards![0].annotationEvents[0].name).toContain('mean_shift');
      expect(cards![0].annotationEvents[0].name).toContain('pvalue=');
    });

    it('returns undefined when the ON column is not a date type', () => {
      // CHANGE_POINT ... ON customer_full_name.keyword uses a keyword as the time axis.
      // The Lens dateHistogram xAxis requires a date column, so the chart cannot render.
      // buildChangePointCards must return undefined so the grid shows the "No change point
      // series" empty state rather than a broken chart with "No results found".
      const rawEsql =
        'FROM kibana_sample_data_ecommerce | CHANGE_POINT products.base_price ON customer_full_name.keyword';
      const columnsBase = [
        {
          id: 'customer_full_name.keyword',
          name: 'customer_full_name.keyword',
          meta: { type: 'string' as const },
        },
        {
          id: 'products.base_price',
          name: 'products.base_price',
          meta: { type: 'number' as const },
        },
        { id: 'category', name: 'category', meta: { type: 'string' as const } },
        { id: 'type', name: 'type', meta: { type: 'string' as const } },
        { id: 'pvalue', name: 'pvalue', meta: { type: 'number' as const } },
      ];

      // Holds with change points detected
      expect(
        buildChangePointCards({
          table: makeTable(columnsBase, [
            {
              'customer_full_name.keyword': 'Ahmed Al Gomez',
              'products.base_price': 28.98,
              category: "Men's Shoes",
              type: 'mean_shift',
              pvalue: 0.001,
            },
          ]),
          esql: rawEsql,
        })
      ).toBeUndefined();

      // Holds with an empty result set too
      expect(
        buildChangePointCards({
          table: makeTable(columnsBase, []),
          esql: rawEsql,
        })
      ).toBeUndefined();
    });

    it('does not append WHERE for a single-series query without CHANGE_POINT BY', () => {
      // Without an explicit CHANGE_POINT ... BY, all rows belong to one series and the line
      // query must go out unmodified regardless of what extra columns appear in the result.
      const cards = buildChangePointCards({ table: noByTable, esql: ESQL_NO_BY });

      expect(cards).toHaveLength(1);
      expect(cards![0].lineEsql).not.toContain('WHERE');
      expect(cards![0].entityValues).toEqual({});
      expect(cards![0].entityDescription).toBeUndefined();
    });

    it('builds separate line queries per entity via WHERE when CHANGE_POINT uses BY', () => {
      const cards = buildChangePointCards({
        table: makeTable(COLUMNS_WITH_HOST, [
          {
            host: 'a',
            bucket: '2023-11-15T00:00:00.000Z',
            avg_bytes: 14,
            type: 'mean_shift',
            pvalue: 0.001,
          },
          {
            host: 'b',
            bucket: '2023-11-16T00:00:00.000Z',
            avg_bytes: 20,
            type: 'mean_shift',
            pvalue: 0.002,
          },
        ]),
        esql: ESQL_WITH_HOST_BY,
      });

      expect(cards).toHaveLength(2);
      expect(cards![0].lineEsql).toContain('| WHERE host == "a"');
      expect(cards![1].lineEsql).toContain('| WHERE host == "b"');
      expect(cards![0].lineEsql).not.toContain('| WHERE host == "b"');
    });

    it('does not append WHERE when CHANGE_POINT has no BY, even with extra STATS BY columns', () => {
      // Without an explicit CHANGE_POINT ... BY all rows belong to one series; the line query
      // must go out unmodified regardless of what extra columns appear in the result table.
      const esqlWithHostNoBy =
        'FROM idx | STATS avg_bytes = AVG(bytes) BY host, bucket = BUCKET(@timestamp, 1 day) | CHANGE_POINT avg_bytes ON bucket';

      const cards = buildChangePointCards({
        table: makeTable(COLUMNS_WITH_HOST, [
          {
            host: 'a',
            bucket: '2023-11-15T00:00:00.000Z',
            avg_bytes: 14,
            type: 'mean_shift',
            pvalue: 0.001,
          },
          {
            host: 'b',
            bucket: '2023-11-16T00:00:00.000Z',
            avg_bytes: 20,
            type: 'mean_shift',
            pvalue: 0.002,
          },
        ]),
        esql: esqlWithHostNoBy,
      });

      expect(cards).toHaveLength(1);
      expect(cards![0].lineEsql).not.toContain('WHERE');
    });

    it('returns undefined when all rows have null type and no change points are detected (no BY)', () => {
      expect(
        buildChangePointCards({
          table: makeTable(COLUMNS_NO_BY, [
            { bucket: '2023-11-15T00:00:00.000Z', avg_bytes: 14, type: null, pvalue: null },
          ]),
          esql: ESQL_NO_BY,
        })
      ).toBeUndefined();
    });

    it('returns undefined for CHANGE_POINT BY when no change points are detected', () => {
      expect(
        buildChangePointCards({
          table: makeTable(COLUMNS_WITH_HOST, [
            {
              host: 'a',
              bucket: '2023-11-15T00:00:00.000Z',
              avg_bytes: 14,
              type: null,
              pvalue: null,
            },
            {
              host: 'b',
              bucket: '2023-11-16T00:00:00.000Z',
              avg_bytes: 20,
              type: null,
              pvalue: null,
            },
          ]),
          esql: ESQL_WITH_HOST_BY,
        })
      ).toBeUndefined();
    });

    it('returns undefined when type is set but pvalue is null (no valid change point)', () => {
      expect(
        buildChangePointCards({
          table: makeTable(COLUMNS_NO_BY, [
            { bucket: '2023-11-15T00:00:00.000Z', avg_bytes: 14, type: 'mean_shift', pvalue: null },
          ]),
          esql: ESQL_NO_BY,
        })
      ).toBeUndefined();
    });

    it('does not use "No change points detected" title when type and pvalue are set but timestamp is null', () => {
      // Regression: a change point at the edge of the time range may have a null bucket timestamp.
      // The annotation cannot be rendered, but the change point was still detected.
      const cards = buildChangePointCards({
        table: makeTable(COLUMNS_NO_BY, [
          { bucket: null, avg_bytes: 14, type: 'mean_shift', pvalue: 0.001 },
        ]),
        esql: ESQL_NO_BY,
      });

      expect(cards).toHaveLength(1);
      // Annotation could not be rendered (no valid timestamp), but a change point was detected.
      expect(cards![0].annotationEvents).toHaveLength(0);
      expect(cards![0].title).not.toBe('No change points detected');
      // Uses the line data query (CHANGE_POINT stripped), not the raw query.
      expect(cards![0].lineEsql).not.toContain('CHANGE_POINT avg_bytes ON bucket');
    });
  });

  describe('getCardForRow', () => {
    it('returns undefined when cards array is empty', () => {
      expect(getCardForRow([], { host: 'a', bucket: '2023-01-01T00:00:00.000Z' })).toBeUndefined();
    });

    describe('no-BY query', () => {
      const cards = buildChangePointCards({
        table: makeTable(COLUMNS_NO_BY, [
          { bucket: '2023-11-14T00:00:00.000Z', avg_bytes: 12, type: '', pvalue: null },
          { bucket: '2023-11-15T00:00:00.000Z', avg_bytes: 14, type: 'mean_shift', pvalue: 0.001 },
        ]),
        esql: ESQL_NO_BY,
      })!;

      it('returns the card when the row is a change point', () => {
        expect(cards).toHaveLength(1);

        expect(
          getCardForRow(cards, {
            bucket: '2023-11-15T00:00:00.000Z',
            avg_bytes: 14,
            type: 'mean_shift',
            pvalue: 0.001,
          })
        ).toBe(cards[0]);
      });

      it('returns undefined when the row is not a change point', () => {
        // Empty type — not a change point row
        expect(
          getCardForRow(cards, {
            bucket: '2023-11-14T00:00:00.000Z',
            avg_bytes: 12,
            type: '',
            pvalue: null,
          })
        ).toBeUndefined();

        // Null type — not a change point row
        expect(
          getCardForRow(cards, {
            bucket: '2023-11-14T00:00:00.000Z',
            avg_bytes: 12,
            type: null,
            pvalue: null,
          })
        ).toBeUndefined();
      });
    });

    it('returns undefined for a BY query when the row belongs to a change-point entity but is not itself a change point', () => {
      // CHANGE_POINT ... BY host, type/pvalue in schema (no WHERE filter applied).
      // host=web-1 has a detected change point. The result also contains non-change-point
      // rows for the same host (other time buckets). Those rows must not return a card.
      const cards = buildChangePointCards({
        table: makeTable(COLUMNS_WITH_HOST, [
          // Change point row
          {
            host: 'web-1',
            bucket: '2023-11-15T00:00:00.000Z',
            avg_bytes: 14,
            type: 'mean_shift',
            pvalue: 0.001,
          },
          // Non-change-point rows for the same entity
          {
            host: 'web-1',
            bucket: '2023-11-14T00:00:00.000Z',
            avg_bytes: 10,
            type: null,
            pvalue: null,
          },
          {
            host: 'web-1',
            bucket: '2023-11-13T00:00:00.000Z',
            avg_bytes: 11,
            type: '',
            pvalue: null,
          },
          {
            host: 'web-1',
            bucket: '2023-11-12T00:00:00.000Z',
            avg_bytes: 12,
          },
        ]),
        esql: ESQL_WITH_HOST_BY,
      })!;
      expect(cards).toHaveLength(1);

      // Change point row — should match
      expect(
        getCardForRow(cards, {
          host: 'web-1',
          bucket: '2023-11-15T00:00:00.000Z',
          avg_bytes: 14,
          type: 'mean_shift',
          pvalue: 0.001,
        })
      ).toBe(cards[0]);

      // Non-change-point rows — must not match even though the entity has a card
      expect(
        getCardForRow(cards, {
          host: 'web-1',
          bucket: '2023-11-14T00:00:00.000Z',
          avg_bytes: 10,
          type: null,
          pvalue: null,
        })
      ).toBeUndefined();

      expect(
        getCardForRow(cards, {
          host: 'web-1',
          bucket: '2023-11-13T00:00:00.000Z',
          avg_bytes: 11,
          type: '',
          pvalue: null,
        })
      ).toBeUndefined();

      expect(
        getCardForRow(cards, {
          host: 'web-1',
          bucket: '2023-11-12T00:00:00.000Z',
          avg_bytes: 12,
        })
      ).toBeUndefined();
    });

    it('matches a single-BY row to its card', () => {
      const cards = buildChangePointCards({
        table: makeTable(COLUMNS_WITH_HOST, [
          {
            host: 'web-1',
            bucket: '2023-11-15T00:00:00.000Z',
            avg_bytes: 14,
            type: 'mean_shift',
            pvalue: 0.001,
          },
          {
            host: 'web-2',
            bucket: '2023-11-16T00:00:00.000Z',
            avg_bytes: 20,
            type: 'dip',
            pvalue: 0.02,
          },
        ]),
        esql: ESQL_WITH_HOST_BY,
      })!;
      expect(cards).toHaveLength(2);

      expect(
        getCardForRow(cards, {
          host: 'web-1',
          bucket: '2023-11-15T00:00:00.000Z',
          type: 'mean_shift',
          pvalue: 0.001,
        })?.title
      ).toBe('web-1');
      expect(
        getCardForRow(cards, {
          host: 'web-2',
          bucket: '2023-11-16T00:00:00.000Z',
          type: 'dip',
          pvalue: 0.02,
        })?.title
      ).toBe('web-2');
    });

    it('returns undefined when no card matches the row entity', () => {
      const cards = buildChangePointCards({
        table: makeTable(COLUMNS_WITH_HOST, [
          {
            host: 'web-1',
            bucket: '2023-11-15T00:00:00.000Z',
            avg_bytes: 14,
            type: 'mean_shift',
            pvalue: 0.001,
          },
        ]),
        esql: ESQL_WITH_HOST_BY,
      })!;
      expect(cards).toHaveLength(1);

      expect(
        getCardForRow(cards, { host: 'unknown-host', bucket: '2023-11-15T00:00:00.000Z' })
      ).toBeUndefined();
    });

    it('matches a multi-BY row to its card and does not cross-match', () => {
      const columnsMultiBy = [
        { id: 'host', name: 'host', meta: { type: 'string' as const } },
        { id: 'service', name: 'service', meta: { type: 'string' as const } },
        { id: 'bucket', name: 'bucket', meta: { type: 'date' as const } },
        { id: 'avg_bytes', name: 'avg_bytes', meta: { type: 'number' as const } },
        { id: 'type', name: 'type', meta: { type: 'string' as const } },
        { id: 'pvalue', name: 'pvalue', meta: { type: 'number' as const } },
      ];
      const cards = buildChangePointCards({
        table: makeTable(columnsMultiBy, [
          {
            host: 'web-1',
            service: 'api',
            bucket: '2023-11-15T00:00:00.000Z',
            avg_bytes: 14,
            type: 'mean_shift',
            pvalue: 0.001,
          },
          {
            host: 'web-1',
            service: 'web',
            bucket: '2023-11-16T00:00:00.000Z',
            avg_bytes: 20,
            type: 'dip',
            pvalue: 0.02,
          },
        ]),
        esql: ESQL_MULTI_BY,
      })!;
      expect(cards).toHaveLength(2);

      const apiCard = getCardForRow(cards, {
        host: 'web-1',
        service: 'api',
        bucket: '2023-11-15T00:00:00.000Z',
        type: 'mean_shift',
        pvalue: 0.001,
      });
      const webCard = getCardForRow(cards, {
        host: 'web-1',
        service: 'web',
        bucket: '2023-11-16T00:00:00.000Z',
        type: 'dip',
        pvalue: 0.02,
      });

      expect(apiCard).toBeDefined();
      expect(webCard).toBeDefined();
      // Same host but different service — must not cross-match.
      expect(apiCard).not.toBe(webCard);
    });

    it('handles null entity column values without throwing', () => {
      const cards = buildChangePointCards({
        table: makeTable(COLUMNS_WITH_HOST, [
          {
            host: null,
            bucket: '2023-11-15T00:00:00.000Z',
            avg_bytes: 14,
            type: 'mean_shift',
            pvalue: 0.001,
          },
        ]),
        esql: ESQL_WITH_HOST_BY,
      })!;
      expect(cards).toHaveLength(1);

      // Row with null host matches the card whose entity label also serializes null
      expect(
        getCardForRow(cards, {
          host: null,
          bucket: '2023-11-15T00:00:00.000Z',
          type: 'mean_shift',
          pvalue: 0.001,
        })
      ).toBe(cards[0]);
    });

    it('matches the correct card when a BY column is absent from the result table schema', () => {
      // Regression: getCardForRow was using unfiltered byColumns to reconstruct the entity
      // label, while buildChangePointCards uses entityColumnIds (byColumns filtered to columns
      // present in the table). When a BY column is absent, the two labels diverged and
      // getCardForRow always returned undefined.

      // "service" is in the BY clause but absent from the result table columns.
      const columnsHostOnly = [
        { id: 'host', name: 'host', meta: { type: 'string' as const } },
        { id: 'bucket', name: 'bucket', meta: { type: 'date' as const } },
        { id: 'avg_bytes', name: 'avg_bytes', meta: { type: 'number' as const } },
        { id: 'type', name: 'type', meta: { type: 'string' as const } },
        { id: 'pvalue', name: 'pvalue', meta: { type: 'number' as const } },
      ];

      const cards = buildChangePointCards({
        table: makeTable(columnsHostOnly, [
          {
            host: 'web-1',
            bucket: '2023-11-15T00:00:00.000Z',
            avg_bytes: 14,
            type: 'mean_shift',
            pvalue: 0.001,
          },
        ]),
        esql: ESQL_MULTI_BY,
      })!;
      expect(cards).toHaveLength(1);
      // The card entity label must only use columns present in the table (host, not service).
      expect(cards[0].entityValues).toEqual({ host: 'web-1' });

      // getCardForRow must resolve the same label and return the card.
      expect(
        getCardForRow(cards, {
          host: 'web-1',
          bucket: '2023-11-15T00:00:00.000Z',
          type: 'mean_shift',
          pvalue: 0.001,
        })
      ).toBe(cards[0]);
    });
  });
});
