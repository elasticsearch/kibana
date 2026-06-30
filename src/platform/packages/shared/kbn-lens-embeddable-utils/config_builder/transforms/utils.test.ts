/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  buildDatasourceStates,
  buildReferences,
  getDataSourceIndex,
  addLayerColumn,
  operationFromColumn,
  buildDataSourceState,
  isSingleLayer,
  generateLayer,
  generateApiLayer,
  filtersAndQueryToLensState,
  filtersAndQueryToApiFormat,
} from './utils';
import type {
  GenericIndexPatternColumn,
  PersistedIndexPatternLayer,
  FormBasedLayer,
  ReferenceBasedIndexPatternColumn,
} from '@kbn/lens-common';
import type { TextBasedLayer } from '@kbn/lens-common';
import { AS_CODE_DATA_VIEW_SPEC_TYPE } from '@kbn/as-code-data-views-schema';
import type { LensApiConfig, MetricConfig } from '../schema';
import type { AggregateQuery, Filter, Query } from '@kbn/es-query';
import type { LensAttributes } from '../types';

const dataView = 'test-dataview';

test('build references correctly builds references', () => {
  const results = buildReferences({
    layer1: dataView,
    layer2: dataView,
  });
  expect(results).toMatchInlineSnapshot(`
    Array [
      Object {
        "id": "test-dataview",
        "name": "indexpattern-datasource-layer-layer1",
        "type": "index-pattern",
      },
      Object {
        "id": "test-dataview",
        "name": "indexpattern-datasource-layer-layer2",
        "type": "index-pattern",
      },
    ]
  `);
});

test('build references uses the xy annotation prefix for annotation layer ids', () => {
  const results = buildReferences(
    {
      layer1: dataView,
      annotations_1: dataView,
    },
    new Set(['annotations_1'])
  );
  expect(results).toMatchInlineSnapshot(`
    Array [
      Object {
        "id": "test-dataview",
        "name": "indexpattern-datasource-layer-layer1",
        "type": "index-pattern",
      },
      Object {
        "id": "test-dataview",
        "name": "xy-visualization-layer-annotations_1",
        "type": "index-pattern",
      },
    ]
  `);
});

describe('getDatasetIndex', () => {
  test('returns index if provided', () => {
    const result = getDataSourceIndex({
      type: AS_CODE_DATA_VIEW_SPEC_TYPE,
      index_pattern: 'test',
      time_field: '@timestamp',
    });
    expect(result).toMatchInlineSnapshot(`
      Object {
        "index": "test",
        "timeFieldName": "@timestamp",
      }
    `);
  });

  test('extracts index from esql query', () => {
    const result = getDataSourceIndex({
      type: 'esql',
      query: 'from test_index | limit 10',
    });
    expect(result).toMatchInlineSnapshot(`
      Object {
        "esqlQuery": "from test_index | limit 10",
        "index": "test_index",
        "timeFieldName": undefined,
      }
    `);
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

  test('adds column with reference column', () => {
    const layer: PersistedIndexPatternLayer = {
      columns: {},
      columnOrder: [],
    };

    const parentColumn: ReferenceBasedIndexPatternColumn = {
      operationType: 'counter_rate',
      label: 'Counter rate',
      dataType: 'number',
      isBucketed: false,
      references: [],
    };

    const referenceColumn: GenericIndexPatternColumn = {
      operationType: 'max',
      sourceField: 'bytes',
      label: 'Max of bytes',
      dataType: 'number',
      isBucketed: false,
    };

    addLayerColumn(layer, 'metric', [parentColumn, referenceColumn]);

    expect(layer.columns.metric).toBeDefined();
    expect(layer.columns.metric_reference).toBeDefined();
    expect(layer.columns.metric).toHaveProperty('references', ['metric_reference']);
    expect(layer.columnOrder).toEqual(['metric', 'metric_reference']);
  });

  test('adds reference column to the beginning when first=true', () => {
    const layer: PersistedIndexPatternLayer = {
      columns: {},
      columnOrder: ['existing'],
    };

    const parentColumn: ReferenceBasedIndexPatternColumn = {
      operationType: 'cumulative_sum',
      label: 'Cumulative sum',
      dataType: 'number',
      isBucketed: false,
      references: [],
    };

    const referenceColumn: GenericIndexPatternColumn = {
      operationType: 'sum',
      sourceField: 'sales',
      label: 'Sum of sales',
      dataType: 'number',
      isBucketed: false,
    };

    addLayerColumn(layer, 'metric', [parentColumn, referenceColumn], true);

    expect(layer.columns.metric).toBeDefined();
    expect(layer.columns.metric_reference).toBeDefined();
    expect(layer.columns.metric).toHaveProperty('references', ['metric_reference']);
    expect(layer.columnOrder).toEqual(['metric_reference', 'metric', 'existing']);
  });

  test('adds column with postfix and reference', () => {
    const layer: PersistedIndexPatternLayer = {
      columns: {},
      columnOrder: [],
    };

    const parentColumn: ReferenceBasedIndexPatternColumn = {
      operationType: 'moving_average',
      label: 'Moving average',
      dataType: 'number',
      isBucketed: false,
      references: [],
    };

    const referenceColumn: GenericIndexPatternColumn = {
      operationType: 'sum',
      sourceField: 'count',
      label: 'Sum of count',
      dataType: 'number',
      isBucketed: false,
    };

    addLayerColumn(layer, 'metric', [parentColumn, referenceColumn], false, '_trendline');

    expect(layer.columns.metric_trendline).toBeDefined();
    expect(layer.columns.metric_trendline_reference).toBeDefined();
    expect(layer.columns.metric_trendline).toHaveProperty('references', [
      'metric_trendline_reference',
    ]);
    expect(layer.columnOrder).toEqual(['metric_trendline', 'metric_trendline_reference']);
  });
});

describe('buildDatasourceStates', () => {
  test('correctly builds esql layer', async () => {
    const results = buildDatasourceStates(
      {
        type: 'metric',
        title: 'test',
        data_source: {
          type: 'esql',
          query: 'from test | limit 10',
        },
        metrics: [
          {
            type: 'primary',
            label: 'test',
            column: 'test',
          },
        ],
        styling: {
          primary: {
            value: { sizing: 'auto' },
          },
        },
        sampling: 1,
        ignore_global_filters: true,
      },
      undefined as any,
      () => [{ columnId: 'test', fieldName: 'test' }]
    );
    expect(results).toMatchInlineSnapshot(`
      Object {
        "layers": Object {
          "textBased": Object {
            "layers": Object {
              "layer_0": Object {
                "columns": Array [
                  Object {
                    "columnId": "test",
                    "fieldName": "test",
                  },
                ],
                "ignoreGlobalFilters": true,
                "index": "test-ef03ee470d96c0a475dca463e351acd1ad966fa7997b95884750639034d53f21",
                "query": Object {
                  "esql": "from test | limit 10",
                },
                "timeField": undefined,
              },
            },
          },
        },
        "usedDataviews": Object {
          "layer_0": Object {
            "dataSourceType": "esql",
            "esqlQuery": "from test | limit 10",
            "index": "test",
            "timeFieldName": undefined,
            "type": "adHocDataView",
          },
        },
      }
    `);
  });
});

describe('generateApiLayer', () => {
  test('returns text based ignore_global_filters from layer state', () => {
    const result = generateApiLayer({
      index: 'test-index',
      query: { esql: 'FROM test-index' },
      columns: [],
      ignoreGlobalFilters: true,
    });

    expect(result).toEqual({
      sampling: 1,
      ignore_global_filters: true,
    });
  });
});

describe('operationFromColumn', () => {
  test('returns undefined for non-existent column', () => {
    const layer = {
      indexPatternId: 'test-dataview',
      columns: {},
      columnOrder: [],
    } as unknown as FormBasedLayer;

    const result = operationFromColumn('non-existent', layer);
    expect(result).toBeUndefined();
  });

  test('handles bucket operation', () => {
    const layer = {
      indexPatternId: 'test-dataview',
      columns: {
        'test-column': {
          operationType: 'terms',
          sourceField: 'category',
          label: 'Top values of category',
          isBucketed: true,
          params: {
            size: 10,
            orderBy: { type: 'alphabetical' },
            orderDirection: 'asc',
          },
        },
      },
      columnOrder: ['test-column'],
    } as unknown as FormBasedLayer;

    const result = operationFromColumn('test-column', layer);
    expect(result).toBeDefined();
  });

  test('handles metric operation', () => {
    const layer = {
      indexPatternId: 'test-dataview',
      columns: {
        'test-column': {
          operationType: 'average',
          sourceField: 'price',
          label: 'Average of price',
        },
      },
      columnOrder: ['test-column'],
    } as unknown as FormBasedLayer;

    const result = operationFromColumn('test-column', layer);
    expect(result).toBeDefined();
  });
});

describe('buildDataSourceState', () => {
  test('builds esql data_source state', () => {
    const textBasedLayer = {
      index: 'my-index',
      query: { esql: 'from my-index | limit 10' },
      columns: [],
      allColumns: [],
    } as TextBasedLayer;

    const result = buildDataSourceState(
      textBasedLayer,
      'layer_0',
      {},
      [],
      [
        {
          type: 'index-pattern',
          id: 'my-index',
          name: 'indexpattern-datasource-layer-layer_0',
        },
      ]
    );
    expect(result).toMatchInlineSnapshot(`
      Object {
        "query": "from my-index | limit 10",
        "type": "esql",
      }
    `);
  });

  test('builds dataView data_source state', () => {
    const formBasedLayer = {
      indexPatternId: 'my-dataview-id',
      columns: {},
      columnOrder: [],
    } as FormBasedLayer;

    const result = buildDataSourceState(formBasedLayer, 'layer_0', {}, [], []);
    expect(result).toMatchInlineSnapshot(`
      Object {
        "ref_id": "my-dataview-id",
        "type": "data_view_reference",
      }
    `);
  });

  test('builds index data_source state', () => {
    const formBasedLayer = {
      indexPatternId: 'my-adhoc-dataview-id',
      columns: {},
      columnOrder: [],
    } as FormBasedLayer;

    const result = buildDataSourceState(
      formBasedLayer,
      'layer_1',
      {
        'my-adhoc-dataview-id': {
          index: 'test-id',
          title: 'my-adhoc-dataview-id',
          timeFieldName: '@timestamp',
        },
      } as Record<string, unknown>,
      [],
      [
        {
          type: 'index-pattern',
          id: 'my-adhoc-dataview-id',
          name: 'indexpattern-datasource-layer-layer_1',
        },
      ]
    );
    expect(result).toMatchInlineSnapshot(`
      Object {
        "index_pattern": "my-adhoc-dataview-id",
        "time_field": "@timestamp",
        "type": "data_view_spec",
      }
    `);
  });
});

describe('isSingleLayer', () => {
  test('returns true for PersistedIndexPatternLayer', () => {
    const layer = {
      columnOrder: ['col1'],
      columns: {},
    };

    expect(isSingleLayer(layer)).toBe(true);
  });

  test('returns true for TextBased layer', () => {
    const layer = {
      columns: [],
      allColumns: [],
      index: 'test',
    };

    expect(isSingleLayer(layer)).toBe(true);
  });
});

describe('generateLayer', () => {
  test('generates layer with correct structure', () => {
    const options = {
      type: 'metric',
      sampling: 0.5,
      ignore_global_filters: true,
    } as MetricConfig;

    const result = generateLayer('layer_1', options);

    expect(result).toMatchInlineSnapshot(`
      Object {
        "layer_1": Object {
          "columnOrder": Array [],
          "columns": Object {},
          "ignoreGlobalFilters": true,
          "sampling": 0.5,
        },
      }
    `);
  });

  test('generates layer with default values', () => {
    const options = {
      type: 'metric',
    } as MetricConfig;

    const result = generateLayer('layer_0', options);

    expect(result).toMatchInlineSnapshot(`
      Object {
        "layer_0": Object {
          "columnOrder": Array [],
          "columns": Object {},
          "ignoreGlobalFilters": undefined,
          "sampling": undefined,
        },
      }
    `);
  });
});

describe('filtersAndQueryToLensState', () => {
  test('converts API filters and query to Lens state format', () => {
    const apiState: LensApiConfig = {
      type: 'metric',
      title: 'test metric',
      data_source: {
        type: 'esql',
        query: 'from test | limit 10',
      },
      metrics: [
        {
          type: 'primary',
          label: 'test',
          column: 'test',
        },
      ],
      styling: {
        primary: {
          value: { sizing: 'auto' },
        },
      },
      sampling: 1,
      ignore_global_filters: false,
      filters: [
        {
          type: 'condition',
          data_view_id: 'dv-1',
          condition: { field: 'category', operator: 'is', value: 'shoes' },
        },
        {
          type: 'dsl',
          data_view_id: 'dv-1',
          dsl: { query: { match_all: {} } },
        },
      ],
    };

    const result = filtersAndQueryToLensState(apiState, []);

    expect(result.query).toEqual({ esql: 'from test | limit 10' });
    expect(result.filters).toHaveLength(2);
    expect(result.references).toHaveLength(1);
    expect(result.filters).toMatchObject([
      {
        meta: { index: 'filter-ref-dv-1' },
        query: { match_phrase: { category: 'shoes' } },
      },
      {
        meta: { index: 'filter-ref-dv-1' },
        query: { match_all: {} },
      },
    ]);
  });

  test('handles missing filters and query gracefully', () => {
    const apiState: LensApiConfig = {
      type: 'metric',
      title: 'test metric',
      data_source: {
        type: 'esql',
        query: 'from test | limit 10',
      },
      metrics: [
        {
          type: 'primary',
          label: 'test',
          column: 'test',
        },
      ],
      styling: {
        primary: {
          value: { sizing: 'auto', alignment: 'left' },
          labels: { alignment: 'left' },
        },
      },
      sampling: 1,
      ignore_global_filters: false,
    };

    const result = filtersAndQueryToLensState(apiState, []);

    expect(result.query).toEqual({ esql: 'from test | limit 10' });
    expect(result.filters).toEqual([]);
    expect(result.references).toEqual([]);
  });

  test('extracts filter data view references when applicable', () => {
    const apiState: LensApiConfig = {
      type: 'metric',
      title: 'test metric',
      data_source: {
        type: 'esql',
        query: 'from test | limit 10',
      },
      styling: {
        primary: {
          value: { sizing: 'auto' },
          labels: { alignment: 'left' },
        },
      },
      metrics: [
        {
          type: 'primary',
          label: 'test',
          column: 'test',
        },
      ],
      sampling: 1,
      ignore_global_filters: false,
      filters: [
        {
          type: 'condition',
          data_view_id: 'dv-1',
          condition: { field: 'category', operator: 'is', value: 'shoes' },
        },
      ],
    };

    const existingReferences = [{ type: 'index-pattern', id: 'dv-1', name: 'layer_ref' }];
    const result = filtersAndQueryToLensState(apiState, existingReferences);

    expect(result.filters).toHaveLength(1);
    expect(result.references).toHaveLength(1);
    expect(result.filters[0].meta.index).toEqual('filter-ref-dv-1');
    expect(result.references[0]).toMatchObject({
      type: 'index-pattern',
      id: 'dv-1',
      name: 'filter-ref-dv-1',
    });
  });
});

describe('filtersAndQueryToApiFormat', () => {
  test('converts Lens state filters and query to API format', () => {
    const lensState: LensAttributes = {
      references: [{ type: 'index-pattern', id: 'dv-1', name: 'ref_1' }],
      state: {
        filters: [
          {
            meta: {
              type: 'phrase',
              key: 'category',
              index: 'ref_1',
              disabled: false,
              params: { query: 'electronics' },
            },
            query: { match_phrase: { category: 'electronics' } },
          },
          {
            meta: {
              type: 'phrase',
              key: 'price',
              index: 'ref_1',
              negate: true,
              params: { query: 'price:[100 TO *]' },
            },
            query: { match_phrase: { price: 'price:[100 TO *]' } },
          },
        ] as Filter[],
        query: { language: 'kuery', query: 'brand: "apple"' } as Query,
      },
    } as LensAttributes;

    const result = filtersAndQueryToApiFormat(lensState);

    expect(result).toMatchInlineSnapshot(`
      Object {
        "filters": Array [
          Object {
            "condition": Object {
              "field": "category",
              "operator": "is",
              "value": "electronics",
            },
            "data_view_id": "dv-1",
            "disabled": false,
            "type": "condition",
          },
          Object {
            "condition": Object {
              "field": "price",
              "negate": true,
              "operator": "is",
              "value": "price:[100 TO *]",
            },
            "data_view_id": "dv-1",
            "negate": true,
            "type": "condition",
          },
        ],
        "query": Object {
          "expression": "brand: \\"apple\\"",
          "language": "kql",
        },
      }
    `);
  });

  test('handles non-string query gracefully', () => {
    const lensState = {
      state: {
        filters: [] as Filter[],
        query: { language: 'kuery', query: { bool: { must: [] } } } as Query,
      },
    } as LensAttributes;

    const result = filtersAndQueryToApiFormat(lensState);

    expect(result).toEqual({});
  });

  test('should not include filters if empty and query if ES|QL', () => {
    const lensState = {
      state: { filters: [] as Filter[], query: { esql: 'FROM ...' } as AggregateQuery },
    } as LensAttributes;

    const result = filtersAndQueryToApiFormat(lensState);

    expect(result).toEqual({});
  });
});
