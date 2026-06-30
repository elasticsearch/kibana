/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { mapToColumns } from '../../defs/map_to_columns/map_to_columns';
import type { Datatable } from '@kbn/expressions-plugin/common';
import { createMockExecutionContext } from '@kbn/expressions-plugin/common/mocks';

describe('map_to_columns', () => {
  it('should rename columns of a given datatable', async () => {
    const input: Datatable = {
      type: 'datatable',
      columns: [
        { id: 'a', name: 'A', meta: { type: 'number' } },
        { id: 'b', name: 'B', meta: { type: 'number' } },
      ],
      rows: [
        { a: 1, b: 2 },
        { a: 3, b: 4 },
        { a: 5, b: 6 },
        { a: 7, b: 8 },
      ],
    };

    const idMap = {
      a: [
        {
          id: 'b',
          label: 'Austrailia',
        },
      ],
      b: [
        {
          id: 'c',
          label: 'Boomerang',
        },
      ],
    };

    const result = await mapToColumns.fn(
      input,
      { idMap: JSON.stringify(idMap) },
      createMockExecutionContext()
    );

    expect(result).toMatchInlineSnapshot(`
      Object {
        "columns": Array [
          Object {
            "id": "b",
            "meta": Object {
              "type": "number",
            },
            "name": "Austrailia",
          },
          Object {
            "id": "c",
            "meta": Object {
              "type": "number",
            },
            "name": "Boomerang",
          },
        ],
        "rows": Array [
          Object {
            "b": 1,
            "c": 2,
          },
          Object {
            "b": 3,
            "c": 4,
          },
          Object {
            "b": 5,
            "c": 6,
          },
          Object {
            "b": 7,
            "c": 8,
          },
        ],
        "type": "datatable",
      }
    `);
  });

  it('should keep columns which are not mapped', async () => {
    const input: Datatable = {
      type: 'datatable',
      columns: [
        { id: 'a', name: 'A', meta: { type: 'number' } },
        { id: 'b', name: 'B', meta: { type: 'number' } },
      ],
      rows: [
        { a: 1, b: 2 },
        { a: 3, b: 4 },
        { a: 5, b: 6 },
        { a: 7, b: 8 },
      ],
    };

    const idMap = {
      b: [{ id: 'c', label: 'Catamaran' }],
    };

    const result = await mapToColumns.fn(
      input,
      { idMap: JSON.stringify(idMap) },
      createMockExecutionContext()
    );

    expect(result).toMatchInlineSnapshot(`
      Object {
        "columns": Array [
          Object {
            "id": "a",
            "meta": Object {
              "type": "number",
            },
            "name": "A",
          },
          Object {
            "id": "c",
            "meta": Object {
              "type": "number",
            },
            "name": "Catamaran",
          },
        ],
        "rows": Array [
          Object {
            "a": 1,
            "c": 2,
          },
          Object {
            "a": 3,
            "c": 4,
          },
          Object {
            "a": 5,
            "c": 6,
          },
          Object {
            "a": 7,
            "c": 8,
          },
        ],
        "type": "datatable",
      }
    `);
  });

  it('should map to multiple original columns', async () => {
    const input: Datatable = {
      type: 'datatable',
      columns: [{ id: 'b', name: 'B', meta: { type: 'number' } }],
      rows: [{ b: 2 }, { b: 4 }, { b: 6 }, { b: 8 }],
    };

    const idMap = {
      b: [
        { id: 'c', label: 'Catamaran' },
        { id: 'd', label: 'Dinghy' },
      ],
    };

    const result = await mapToColumns.fn(
      input,
      { idMap: JSON.stringify(idMap) },
      createMockExecutionContext()
    );

    expect(result).toMatchInlineSnapshot(`
      Object {
        "columns": Array [
          Object {
            "id": "c",
            "meta": Object {
              "type": "number",
            },
            "name": "Catamaran",
          },
          Object {
            "id": "d",
            "meta": Object {
              "type": "number",
            },
            "name": "Dinghy",
          },
        ],
        "rows": Array [
          Object {
            "c": 2,
            "d": 2,
          },
          Object {
            "c": 4,
            "d": 4,
          },
          Object {
            "c": 6,
            "d": 6,
          },
          Object {
            "c": 8,
            "d": 8,
          },
        ],
        "type": "datatable",
      }
    `);
  });

  it('should rename date histograms', async () => {
    const input: Datatable = {
      type: 'datatable',
      columns: [
        { id: 'a', name: 'A', meta: { type: 'number' } },
        { id: 'b', name: 'banana per 30 seconds', meta: { type: 'number' } },
      ],
      rows: [
        { a: 1, b: 2 },
        { a: 3, b: 4 },
        { a: 5, b: 6 },
        { a: 7, b: 8 },
      ],
    };

    const idMap = {
      b: [{ id: 'c', label: 'Apple', operationType: 'date_histogram', sourceField: 'banana' }],
    };

    const result = await mapToColumns.fn(
      input,
      { idMap: JSON.stringify(idMap) },
      createMockExecutionContext()
    );

    expect(result).toMatchInlineSnapshot(`
      Object {
        "columns": Array [
          Object {
            "id": "a",
            "meta": Object {
              "type": "number",
            },
            "name": "A",
          },
          Object {
            "id": "c",
            "meta": Object {
              "type": "number",
            },
            "name": "Apple per 30 seconds",
          },
        ],
        "rows": Array [
          Object {
            "a": 1,
            "c": 2,
          },
          Object {
            "a": 3,
            "c": 4,
          },
          Object {
            "a": 5,
            "c": 6,
          },
          Object {
            "a": 7,
            "c": 8,
          },
        ],
        "type": "datatable",
      }
    `);
  });

  describe('map_to_columns_text_based', () => {
    it('should keep columns that exist in idMap only', async () => {
      const input: Datatable = {
        type: 'datatable',
        columns: [
          { id: 'a', name: 'A', meta: { type: 'number' } },
          { id: 'b', name: 'B', meta: { type: 'number' } },
          { id: 'c', name: 'C', meta: { type: 'string' } },
        ],
        rows: [
          { a: 1, b: 2, c: '3' },
          { a: 3, b: 4, c: '5' },
          { a: 5, b: 6, c: '7' },
          { a: 7, b: 8, c: '9' },
        ],
      };

      const idMap = {
        a: [
          {
            id: 'a',
            label: 'A',
          },
        ],
        b: [
          {
            id: 'b',
            label: 'B',
          },
        ],
      };

      const result = await mapToColumns.fn(
        input,
        { idMap: JSON.stringify(idMap), isTextBased: true },
        createMockExecutionContext()
      );

      expect(result.columns).toStrictEqual([
        { id: 'a', name: 'A', meta: { type: 'number', sourceParams: {} } },
        { id: 'b', name: 'B', meta: { type: 'number', sourceParams: {} } },
      ]);

      expect(result.rows).toStrictEqual([
        { a: 1, b: 2 },
        { a: 3, b: 4 },
        { a: 5, b: 6 },
        { a: 7, b: 8 },
      ]);
    });

    it('should handle correctly columns controlled by variables', async () => {
      const input: Datatable = {
        type: 'datatable',
        columns: [
          { id: 'a', name: 'A', meta: { type: 'number' } },
          { id: 'b', name: 'B', meta: { type: 'number' } },
          { id: 'c', name: 'C', meta: { type: 'string' }, variable: 'field' },
        ],
        rows: [
          { a: 1, b: 2, c: '3' },
          { a: 3, b: 4, c: '5' },
          { a: 5, b: 6, c: '7' },
          { a: 7, b: 8, c: '9' },
        ],
      };

      const idMap = {
        a: [
          {
            id: 'a',
            label: 'A',
          },
        ],
        '?field': [
          {
            id: 'field',
            label: '?field',
            variable: 'field',
          },
        ],
      };

      const result = await mapToColumns.fn(
        input,
        { idMap: JSON.stringify(idMap), isTextBased: true },
        createMockExecutionContext()
      );

      expect(result.columns).toStrictEqual([
        { id: 'a', name: 'A', meta: { type: 'number', sourceParams: {} } },
        { id: 'field', name: 'C', meta: { type: 'string' }, variable: 'field' },
      ]);

      expect(result.rows).toStrictEqual([
        { a: 1, field: '3' },
        { a: 3, field: '5' },
        { a: 5, field: '7' },
        { a: 7, field: '9' },
      ]);
    });

    it('injects the dropPartials flag into the bucket column source params', async () => {
      const input: Datatable = {
        type: 'datatable',
        columns: [
          {
            id: 'a',
            name: 'A',
            meta: {
              type: 'date',
              sourceParams: {
                params: { used_interval: '1s', used_time_zone: 'UTC' },
              },
            },
          },
        ],
        rows: [{ a: 0 }],
      };

      const idMap = {
        a: [{ id: 'a', label: 'A', dropPartials: true }],
      };

      const result = await mapToColumns.fn(
        input,
        { idMap: JSON.stringify(idMap), isTextBased: true },
        createMockExecutionContext()
      );

      expect(result.columns[0].meta.sourceParams?.params).toStrictEqual({
        used_interval: '1s',
        used_time_zone: 'UTC',
        drop_partials: true,
      });
    });
  });
});
