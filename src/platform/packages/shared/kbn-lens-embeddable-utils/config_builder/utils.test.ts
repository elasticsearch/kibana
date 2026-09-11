/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  getAdhocDataviews,
  buildDatasourceStates,
  buildReferences,
  getDatasetIndex,
  addLayerColumn,
  mapToFormula,
  isDataViewDataset,
} from './utils';
import type { DataView } from '@kbn/data-views-plugin/common';
import type { GenericIndexPatternColumn, PersistedIndexPatternLayer } from '@kbn/lens-common';

const dataView = {
  id: 'test-dataview',
  fields: {
    getByName: (name: string) => {
      switch (name) {
        case '@timestamp':
          return 'datetime';
        case 'category':
          return 'string';
        case 'price':
          return 'number';
        default:
          return 'string';
      }
    },
  },
  toSpec: () => ({}),
};

describe('isDataViewDataset', () => {
  test('isDataViewDataset returns true when dataset is based on index and timefield', () => {
    const result = isDataViewDataset({
      index: 'test',
      timeFieldName: 'test',
    });
    expect(result).toEqual(true);
  });

  test('isDataViewDataset returns false when dataset is not based on index and timefield', () => {
    const result = isDataViewDataset({
      esql: 'test',
    });
    expect(result).toEqual(false);

    const result2 = isDataViewDataset({
      type: 'datatable',
      columns: [],
      rows: [],
    });
    expect(result2).toEqual(false);
  });
});

test('build references correctly builds references', () => {
  const results = buildReferences(
    {
      layer1: dataView as unknown as DataView,
      layer2: dataView as unknown as DataView,
    },
    {}
  );
  expect(results.references).toEqual([
    {
      id: 'test-dataview',
      name: 'indexpattern-datasource-layer-layer1',
      type: 'index-pattern',
    },
    {
      id: 'test-dataview',
      name: 'indexpattern-datasource-layer-layer2',
      type: 'index-pattern',
    },
  ]);
  expect(results.internalReferences).toEqual([]);
});

test('should split references and internalReferences', () => {
  const results = buildReferences(
    {
      layer1: dataView as unknown as DataView,
      layer2: { ...dataView, id: 'ad-hoc' } as unknown as DataView,
    },
    { 'ad-hoc': {} }
  );
  expect(results.references).toEqual([
    {
      id: 'test-dataview',
      name: 'indexpattern-datasource-layer-layer1',
      type: 'index-pattern',
    },
  ]);
  expect(results.internalReferences).toEqual([
    {
      id: 'ad-hoc',
      name: 'indexpattern-datasource-layer-layer2',
      type: 'index-pattern',
    },
  ]);
});

test('getAdhocDataviews', () => {
  const results = getAdhocDataviews({
    layer1: dataView as unknown as DataView,
    layer2: dataView as unknown as DataView,
  });
  expect(results).toMatchInlineSnapshot(`
    Object {
      "test-dataview": Object {},
    }
  `);
});

describe('getDatasetIndex', () => {
  test('returns index if provided', () => {
    const result = getDatasetIndex({
      index: 'test',
      timeFieldName: '@timestamp',
    });
    expect(result).toMatchInlineSnapshot(`
      Object {
        "index": "test",
        "timeFieldName": "@timestamp",
      }
    `);
  });

  test('extracts index from esql query', () => {
    const result = getDatasetIndex({
      esql: 'from test_index | limit 10',
    });
    expect(result).toMatchInlineSnapshot(`
      Object {
        "index": "test_index",
        "timeFieldName": "@timestamp",
      }
    `);
  });

  test('returns undefined if no query or iundex provided', () => {
    const result = getDatasetIndex({
      type: 'datatable',
      columns: [],
      rows: [],
    });
    expect(result).toMatchInlineSnapshot(`undefined`);
  });
});

describe('addLayerColumn', () => {
  test('adds column to the end', () => {
    const layer = {
      columns: [],
      columnOrder: [],
    } as unknown as PersistedIndexPatternLayer;
    addLayerColumn(layer, 'first', {
      test: 'test',
    } as unknown as GenericIndexPatternColumn);
    addLayerColumn(layer, 'second', {
      test: 'test',
    } as unknown as GenericIndexPatternColumn);
    addLayerColumn(
      layer,
      'before_first',
      {
        test: 'test',
      } as unknown as GenericIndexPatternColumn,
      true
    );
    expect(layer).toMatchInlineSnapshot(`
      Object {
        "columnOrder": Array [
          "before_first",
          "first",
          "second",
        ],
        "columns": Object {
          "before_first": Object {
            "test": "test",
          },
          "first": Object {
            "test": "test",
          },
          "second": Object {
            "test": "test",
          },
        },
      }
    `);
  });
});

describe('buildDatasourceStates', () => {
  test('correctly builds esql layer', async () => {
    const results = await buildDatasourceStates(
      {
        title: 'test',
        layers: [
          {
            dataset: {
              esql: 'from test | limit 10',
            },
            yAxis: [{ label: 'test', value: 'test' }],
          },
        ],
      },
      {},
      () => undefined,
      () => [],
      {
        get: async () => ({ id: 'test' }),
        create: async () => ({ id: 'test' }),
      } as any
    );
    expect(results).toMatchInlineSnapshot(`
      Object {
        "textBased": Object {
          "layers": Object {
            "layer_0": Object {
              "allColumns": Array [],
              "columns": Array [],
              "index": "test",
              "query": Object {
                "esql": "from test | limit 10",
              },
              "timeField": undefined,
            },
          },
        },
      }
    `);
  });

  test('skips points layers so only the data layer gets a text-based datasource', async () => {
    const results = await buildDatasourceStates(
      {
        title: 'test',
        layers: [
          {
            dataset: {
              esql: 'from metrics | stats cpu=avg(system.cpu.total.norm.pct) by @timestamp',
            },
            yAxis: [{ label: 'CPU', value: 'cpu' }],
          },
          {
            type: 'points' as const,
            query: 'FROM metrics.exemplars-* | SORT @timestamp ASC | LIMIT 100',
            yAccessor: 'system.cpu.total.norm.pct',
          },
        ],
      },
      {},
      () => undefined,
      () => [],
      {
        get: async () => ({ id: 'test' }),
        create: async () => ({ id: 'test' }),
      } as any
    );
    expect(Object.keys(results.textBased?.layers ?? {})).toEqual(['layer_0']);
  });

  test('skips annotation layers so only the data layer gets a text-based datasource', async () => {
    const results = await buildDatasourceStates(
      {
        title: 'test',
        layers: [
          {
            dataset: {
              esql: 'from test | limit 10',
            },
            yAxis: [{ label: 'test', value: 'test' }],
          },
          {
            type: 'annotation' as const,
            yAxis: [],
            events: [{ name: 'cp', datetime: '2023-01-01T00:00:00.000Z' }],
          },
        ],
      },
      {},
      () => undefined,
      () => [],
      {
        get: async () => ({ id: 'test' }),
        create: async () => ({ id: 'test' }),
      } as any
    );
    expect(Object.keys(results.textBased?.layers ?? {})).toEqual(['layer_0']);
  });
});

describe('mapToFormula', () => {
  test('map LensBaseLayer to FormulaConfigValue', () => {
    const formulaConfig = mapToFormula({
      label: 'iowait',
      value: 'average(system.cpu.iowait.pct) / max(system.cpu.cores)',
    });
    expect(formulaConfig).toMatchInlineSnapshot(`
      Object {
        "format": undefined,
        "formula": "average(system.cpu.iowait.pct) / max(system.cpu.cores)",
        "label": "iowait",
        "timeScale": undefined,
      }
    `);
  });
  test('map LensBaseLayer to FormulaConfigValue with format', () => {
    const formulaConfig = mapToFormula({
      label: 'iowait',
      value: 'average(system.cpu.iowait.pct) / max(system.cpu.cores)',
      format: 'percent',
      decimals: 1,
    });
    expect(formulaConfig).toMatchInlineSnapshot(`
      Object {
        "format": Object {
          "id": "percent",
          "params": Object {
            "decimals": 1,
          },
        },
        "formula": "average(system.cpu.iowait.pct) / max(system.cpu.cores)",
        "label": "iowait",
        "timeScale": undefined,
      }
    `);
  });
});
