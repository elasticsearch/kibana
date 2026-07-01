/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ReactElement } from 'react';
import React from 'react';

import type { Reference } from '@kbn/content-management-utils';
import { coreMock } from '@kbn/core/public/mocks';
import type { IStorageWrapper } from '@kbn/kibana-utils-plugin/public';
import {
  LENS_DATATABLE_ID,
  LENS_HEATMAP_CHART_SHAPES,
  LENS_METRIC_ID,
  LENS_TAGCLOUD_ID,
  PARTITION_CHART_TYPES,
  SeriesTypes,
} from '@kbn/lens-common';
import type {
  FormBasedPersistedState,
  FormBasedPrivateState,
  DatasourcePublicAPI,
  Datasource,
  FramePublicAPI,
  OperationDescriptor,
  UserMessage,
  TermsIndexPatternColumn,
  DateHistogramIndexPatternColumn,
  MovingAverageIndexPatternColumn,
  MathIndexPatternColumn,
  FormulaIndexPatternColumn,
  RangeIndexPatternColumn,
  FiltersIndexPatternColumn,
  PercentileIndexPatternColumn,
  CountIndexPatternColumn,
  SumIndexPatternColumn,
  AvgIndexPatternColumn,
  MedianIndexPatternColumn,
  GenericIndexPatternColumn,
} from '@kbn/lens-common';
import { unifiedSearchPluginMock } from '@kbn/unified-search-plugin/public/mocks';
import { dataPluginMock } from '@kbn/data-plugin/public/mocks';
import { dataViewPluginMocks } from '@kbn/data-views-plugin/public/mocks';
import type { Ast } from '@kbn/interpreter';
import { chartPluginMock } from '@kbn/charts-plugin/public/mocks';
import { indexPatternFieldEditorPluginMock } from '@kbn/data-view-field-editor-plugin/public/mocks';
import { uiActionsPluginMock } from '@kbn/ui-actions-plugin/public/mocks';
import { fieldFormatsServiceMock } from '@kbn/field-formats-plugin/public/mocks';
import type { TinymathAST } from '@kbn/tinymath';
import { getFormBasedDatasource } from './form_based';
import { getFieldByNameFactory } from './pure_helpers';
import { operationDefinitionMap, getErrorMessages } from './operations';
import { createMockedFullReference } from './operations/mocks';
import type { Datatable, DatatableColumn } from '@kbn/expressions-plugin/common';
import { filterAndSortUserMessages } from '../../app_plugin/get_application_user_messages';
import { createMockFramePublicAPI } from '../../mocks';
import { createMockDataViewsState } from '../../data_views_service/mocks';
import type { Query } from '@kbn/es-query';
import { kqlPluginMock } from '@kbn/kql/public/mocks';

jest.mock('./loader');
jest.mock('../../id_generator');
jest.mock('./operations');
jest.mock('./dimension_panel/reference_editor', () => ({
  ReferenceEditor: () => null,
}));

const nowInstant = new Date();

const fieldsOne = [
  {
    name: 'timestamp',
    displayName: 'timestampLabel',
    type: 'date',
    aggregatable: true,
    searchable: true,
  },
  {
    name: 'start_date',
    displayName: 'start_date',
    type: 'date',
    aggregatable: true,
    searchable: true,
  },
  {
    name: 'bytes',
    displayName: 'bytes',
    type: 'number',
    aggregatable: true,
    searchable: true,
  },
  {
    name: 'memory',
    displayName: 'memory',
    type: 'number',
    aggregatable: true,
    searchable: true,
  },
  {
    name: 'source',
    displayName: 'source',
    type: 'string',
    aggregatable: true,
    searchable: true,
  },
  {
    name: 'dest',
    displayName: 'dest',
    type: 'string',
    aggregatable: true,
    searchable: true,
  },
];

const fieldsTwo = [
  {
    name: 'timestamp',
    displayName: 'timestampLabel',
    type: 'date',
    aggregatable: true,
    searchable: true,
    aggregationRestrictions: {
      date_histogram: {
        agg: 'date_histogram',
        fixed_interval: '1d',
        delay: '7d',
        time_zone: 'UTC',
      },
    },
  },
  {
    name: 'bytes',
    displayName: 'bytes',
    type: 'number',
    aggregatable: true,
    searchable: true,
    aggregationRestrictions: {
      // Ignored in the UI
      histogram: {
        agg: 'histogram',
        interval: 1000,
      },
      avg: {
        agg: 'avg',
      },
      max: {
        agg: 'max',
      },
      min: {
        agg: 'min',
      },
      sum: {
        agg: 'sum',
      },
    },
  },
  {
    name: 'source',
    displayName: 'source',
    type: 'string',
    aggregatable: true,
    searchable: true,
    aggregationRestrictions: {
      terms: {
        agg: 'terms',
      },
    },
  },
];

const expectedIndexPatterns = {
  1: {
    id: '1',
    title: 'my-fake-index-pattern',
    timeFieldName: 'timestamp',
    hasRestrictions: false,
    fields: fieldsOne,
    getFieldByName: getFieldByNameFactory(fieldsOne),
    getFormatterForField: () => ({ convertToText: (v: unknown) => v }),
    spec: {},
    isPersisted: true,
  },
  2: {
    id: '2',
    title: 'my-fake-restricted-pattern',
    timeFieldName: 'timestamp',
    hasRestrictions: true,
    fields: fieldsTwo,
    getFieldByName: getFieldByNameFactory(fieldsTwo),
    getFormatterForField: () => ({ convertToText: (v: unknown) => v }),
    spec: {},
    isPersisted: true,
  },
};

const indexPatterns = expectedIndexPatterns;
const dateRange = {
  fromDate: '2022-03-17T08:25:00.000Z',
  toDate: '2022-04-17T08:25:00.000Z',
};

function isFragment(element: unknown): element is ReactElement {
  return React.isValidElement(element) && element.type === React.Fragment;
}

describe('IndexPattern Data Source', () => {
  let baseState: FormBasedPrivateState;
  let FormBasedDatasource: Datasource<FormBasedPrivateState, FormBasedPersistedState, Query>;

  beforeEach(() => {
    const data = dataPluginMock.createStartContract();
    data.query.timefilter.timefilter.getAbsoluteTime = jest.fn(() => ({
      from: '',
      to: '',
    }));

    FormBasedDatasource = getFormBasedDatasource({
      unifiedSearch: unifiedSearchPluginMock.createStartContract(),
      kql: kqlPluginMock.createStartContract(),
      storage: {} as IStorageWrapper,
      core: coreMock.createStart(),
      data,
      dataViews: dataViewPluginMocks.createStartContract(),
      fieldFormats: fieldFormatsServiceMock.createStartContract(),
      charts: chartPluginMock.createSetupContract(),
      dataViewFieldEditor: indexPatternFieldEditorPluginMock.createStartContract(),
      uiActions: uiActionsPluginMock.createStartContract(),
    });

    baseState = {
      currentIndexPatternId: '1',
      layers: {
        first: {
          indexPatternId: '1',
          columnOrder: ['col1'],
          columns: {
            col1: {
              label: 'My Op',
              dataType: 'string',
              isBucketed: true,

              // Private
              operationType: 'terms',
              sourceField: 'op',
              params: {
                size: 5,
                orderBy: { type: 'alphabetical' },
                orderDirection: 'asc',
              },
            } as TermsIndexPatternColumn,
          },
        },
      },
    };
  });

  describe('uniqueLabels', () => {
    it('appends a suffix to duplicates', () => {
      const col: GenericIndexPatternColumn = {
        dataType: 'number',
        isBucketed: false,
        label: 'Foo',
        customLabel: true,
        operationType: 'count',
        sourceField: '___records___',
      };
      const map = FormBasedDatasource.uniqueLabels(
        {
          layers: {
            a: {
              columnOrder: ['a', 'b'],
              columns: {
                a: col,
                b: col,
              },
              indexPatternId: 'foo',
            },
            b: {
              columnOrder: ['c', 'd'],
              columns: {
                c: col,
                d: {
                  ...col,
                  label: 'Foo [1]',
                },
              },
              indexPatternId: 'foo',
            },
          },
        } as unknown as FormBasedPrivateState,
        indexPatterns
      );

      expect(map).toMatchInlineSnapshot(`
        Object {
          "a": "Foo",
          "b": "Foo [1]",
          "c": "Foo [2]",
          "d": "Foo [1] [1]",
        }
      `);
    });
  });

  describe('#getPersistedState', () => {
    it('should persist from saved state', async () => {
      expect(FormBasedDatasource.getPersistableState(baseState)).toEqual({
        state: {
          layers: {
            first: {
              columnOrder: ['col1'],
              columns: {
                col1: {
                  label: 'My Op',
                  dataType: 'string',
                  isBucketed: true,

                  // Private
                  operationType: 'terms',
                  sourceField: 'op',
                  params: {
                    size: 5,
                    orderBy: { type: 'alphabetical' },
                    orderDirection: 'asc',
                  },
                },
              },
            },
          },
        },
        references: [
          { name: 'indexpattern-datasource-layer-first', type: 'index-pattern', id: '1' },
        ],
      });
    });
  });

  describe('#getSelectedFields', () => {
    it('should return the fields used per layer', async () => {
      expect(FormBasedDatasource?.getSelectedFields?.(baseState)).toEqual(['op']);
    });

    it('should return empty array for empty layers', async () => {
      const state = {
        ...baseState,
        layers: {},
      };
      expect(FormBasedDatasource?.getSelectedFields?.(state)).toEqual([]);
    });

    it('should support columns with multiple fields', async () => {
      const state = {
        currentIndexPatternId: '1',
        layers: {
          first: {
            indexPatternId: '1',
            columnOrder: ['col1'],
            columns: {
              col1: {
                label: 'My Op',
                dataType: 'string',
                isBucketed: true,

                // Private
                operationType: 'terms',
                sourceField: 'op',
                params: {
                  size: 5,
                  orderBy: { type: 'alphabetical' },
                  orderDirection: 'asc',
                  secondaryFields: ['source', 'geo.src'],
                },
              } as TermsIndexPatternColumn,
            },
          },
        },
      };

      expect(FormBasedDatasource?.getSelectedFields?.(state)).toEqual(['op', 'source', 'geo.src']);
    });
  });

  describe('#toExpression', () => {
    it('should generate an empty expression when no columns are selected', async () => {
      const state = FormBasedDatasource.initialize();
      expect(
        FormBasedDatasource.toExpression(
          state,
          'first',
          indexPatterns,
          dateRange,
          nowInstant,
          'testing-seed'
        )
      ).toEqual(null);
    });

    it('should create a table when there is a formula without aggs', async () => {
      const queryBaseState: FormBasedPrivateState = {
        currentIndexPatternId: '1',
        layers: {
          first: {
            indexPatternId: '1',
            columnOrder: ['col1'],
            columns: {
              col1: {
                label: 'Formula',
                dataType: 'number',
                isBucketed: false,
                operationType: 'formula',
                references: [],
                params: {},
              },
            },
          },
        },
      };
      expect(
        FormBasedDatasource.toExpression(
          queryBaseState,
          'first',
          indexPatterns,
          dateRange,
          nowInstant,
          'testing-seed'
        )
      ).toEqual({
        chain: [
          {
            function: 'createTable',
            type: 'function',
            arguments: { ids: [], names: [], rowCount: [1] },
          },
          {
            arguments: { expression: [''], id: ['col1'], name: ['Formula'] },
            function: 'mapColumn',
            type: 'function',
          },
        ],
        type: 'expression',
      });
    });

    it('should generate an expression for an aggregated query', async () => {
      const queryBaseState: FormBasedPrivateState = {
        currentIndexPatternId: '1',
        layers: {
          first: {
            indexPatternId: '1',
            columnOrder: ['col1', 'col2'],
            columns: {
              col1: {
                label: 'Count of records',
                dataType: 'number',
                isBucketed: false,
                sourceField: '___records___',
                operationType: 'count',
              },
              col2: {
                label: 'Date',
                dataType: 'date',
                isBucketed: true,
                operationType: 'date_histogram',
                sourceField: 'timestamp',
                params: {
                  interval: '1d',
                },
              } as DateHistogramIndexPatternColumn,
            },
          },
        },
      };

      expect(
        FormBasedDatasource.toExpression(
          queryBaseState,
          'first',
          indexPatterns,
          dateRange,
          nowInstant,
          'testing-seed'
        )
      ).toMatchInlineSnapshot(`
        Object {
          "chain": Array [
            Object {
              "arguments": Object {},
              "function": "kibana",
              "type": "function",
            },
            Object {
              "arguments": Object {
                "aggs": Array [
                  Object {
                    "chain": Array [
                      Object {
                        "arguments": Object {
                          "enabled": Array [
                            true,
                          ],
                          "id": Array [
                            "0",
                          ],
                          "schema": Array [
                            "metric",
                          ],
                        },
                        "function": "aggCount",
                        "type": "function",
                      },
                    ],
                    "type": "expression",
                  },
                  Object {
                    "chain": Array [
                      Object {
                        "arguments": Object {
                          "drop_partials": Array [
                            false,
                          ],
                          "enabled": Array [
                            true,
                          ],
                          "extended_bounds": Array [
                            Object {
                              "chain": Array [
                                Object {
                                  "arguments": Object {},
                                  "function": "extendedBounds",
                                  "type": "function",
                                },
                              ],
                              "type": "expression",
                            },
                          ],
                          "field": Array [
                            "timestamp",
                          ],
                          "id": Array [
                            "1",
                          ],
                          "interval": Array [
                            "1d",
                          ],
                          "min_doc_count": Array [
                            1,
                          ],
                          "schema": Array [
                            "segment",
                          ],
                          "useNormalizedEsInterval": Array [
                            true,
                          ],
                        },
                        "function": "aggDateHistogram",
                        "type": "function",
                      },
                    ],
                    "type": "expression",
                  },
                ],
                "ignoreGlobalFilters": Array [
                  false,
                ],
                "index": Array [
                  Object {
                    "chain": Array [
                      Object {
                        "arguments": Object {
                          "id": Array [
                            "1",
                          ],
                          "includeFields": Array [
                            false,
                          ],
                        },
                        "function": "indexPatternLoad",
                        "type": "function",
                      },
                    ],
                    "type": "expression",
                  },
                ],
                "metricsAtAllLevels": Array [
                  false,
                ],
                "partialRows": Array [
                  false,
                ],
                "probability": Array [
                  1,
                ],
                "samplerSeed": Array [
                  1889181588,
                ],
                "timeFields": Array [
                  "timestamp",
                ],
              },
              "function": "esaggs",
              "type": "function",
            },
            Object {
              "arguments": Object {
                "idMap": Array [
                  "{\\"col-0-0\\":[{\\"label\\":\\"Count of records\\",\\"dataType\\":\\"number\\",\\"isBucketed\\":false,\\"sourceField\\":\\"___records___\\",\\"operationType\\":\\"count\\",\\"id\\":\\"col1\\"}],\\"col-1-1\\":[{\\"label\\":\\"timestampLabel\\",\\"dataType\\":\\"date\\",\\"isBucketed\\":true,\\"operationType\\":\\"date_histogram\\",\\"sourceField\\":\\"timestamp\\",\\"params\\":{\\"interval\\":\\"1d\\"},\\"id\\":\\"col2\\"}]}",
                ],
                "isTextBased": Array [
                  false,
                ],
              },
              "function": "lens_map_to_columns",
              "type": "function",
            },
          ],
          "type": "expression",
        }
      `);
    });

    it('should put all time fields used in date_histograms to the esaggs timeFields parameter if not ignoring global time range', async () => {
      const queryBaseState: FormBasedPrivateState = {
        currentIndexPatternId: '1',
        layers: {
          first: {
            indexPatternId: '1',
            columnOrder: ['col1', 'col2', 'col3', 'col4'],
            columns: {
              col1: {
                label: 'Count of records',
                dataType: 'number',
                isBucketed: false,
                sourceField: '___records___',
                operationType: 'count',
              },
              col2: {
                label: 'Date',
                dataType: 'date',
                isBucketed: true,
                operationType: 'date_histogram',
                sourceField: 'timestamp',
                params: {
                  interval: 'auto',
                },
              } as DateHistogramIndexPatternColumn,
              col3: {
                label: 'Date 2',
                dataType: 'date',
                isBucketed: true,
                operationType: 'date_histogram',
                sourceField: 'another_datefield',
                params: {
                  interval: 'auto',
                },
              } as DateHistogramIndexPatternColumn,
              col4: {
                label: 'Date 3',
                dataType: 'date',
                isBucketed: true,
                operationType: 'date_histogram',
                sourceField: 'yet_another_datefield',
                params: {
                  interval: '2d',
                  ignoreTimeRange: true,
                },
              } as DateHistogramIndexPatternColumn,
            },
          },
        },
      };

      const ast = FormBasedDatasource.toExpression(
        queryBaseState,
        'first',
        indexPatterns,
        dateRange,
        nowInstant,
        'testing-seed'
      ) as Ast;
      expect(ast.chain[1].arguments.timeFields).toEqual(['timestamp', 'another_datefield']);
    });

    it('should pass time shift parameter to metric agg functions', async () => {
      const queryBaseState: FormBasedPrivateState = {
        currentIndexPatternId: '1',
        layers: {
          first: {
            indexPatternId: '1',
            columnOrder: ['col2', 'col1'],
            columns: {
              col1: {
                label: 'Count of records',
                dataType: 'number',
                isBucketed: false,
                sourceField: '___records___',
                operationType: 'count',
                timeShift: '1d',
              },
              col2: {
                label: 'Date',
                dataType: 'date',
                isBucketed: true,
                operationType: 'date_histogram',
                sourceField: 'timestamp',
                params: {
                  interval: 'auto',
                },
              } as DateHistogramIndexPatternColumn,
            },
          },
        },
      };

      const ast = FormBasedDatasource.toExpression(
        queryBaseState,
        'first',
        indexPatterns,
        dateRange,
        nowInstant,
        'testing-seed'
      ) as Ast;
      expect((ast.chain[1].arguments.aggs[1] as Ast).chain[0].arguments.timeShift).toEqual(['1d']);
    });

    it('should pass time shift and filter parameter to all children metric agg functions but respect local values, too', async () => {
      /*
       structure of this formula:
       moving_average(
        count()
        + sum(products.price, shift='1h')
        + differences(
            average(products.price, kql='NOT category : * ')
            + median(products.price),
          kql='category : *'),
        shift='3h')

        * Outer moving average is shifted - this is inherited to the count and the average and median within the nested differences
        * The sum has its own shift and does not respected the shift from the moving average
        * The differences has a filter which is inherited to the median, but not the average as it has its own filter
      */
      const queryBaseState: FormBasedPrivateState = {
        currentIndexPatternId: '1',
        layers: {
          first: {
            indexPatternId: '1',
            columns: {
              col1: {
                label: 'order_date',
                dataType: 'date',
                operationType: 'date_histogram',
                sourceField: 'order_date',
                isBucketed: true,
                params: {
                  interval: 'auto',
                  includeEmptyRows: true,
                  dropPartials: false,
                },
              } as DateHistogramIndexPatternColumn,
              col2X0: {
                label:
                  "Part of moving_average(count() + sum(products.price, shift='1h') + differences(average(products.price, kql='NOT category : * ') + median(products.price), kql='category : *'), shift='3h')",
                dataType: 'number',
                operationType: 'count',
                isBucketed: false,
                sourceField: '___records___',
                params: {
                  emptyAsNull: false,
                },
                customLabel: true,
              } as CountIndexPatternColumn,
              col2X1: {
                label:
                  "Part of moving_average(count() + sum(products.price, shift='1h') + differences(average(products.price, kql='NOT category : * ') + median(products.price), kql='category : *'), shift='3h')",
                dataType: 'number',
                operationType: 'sum',
                sourceField: 'products.price',
                isBucketed: false,
                timeShift: '1h',
                params: {
                  emptyAsNull: false,
                },
                customLabel: true,
              } as SumIndexPatternColumn,
              col2X2: {
                label:
                  "Part of moving_average(count() + sum(products.price, shift='1h') + differences(average(products.price, kql='NOT category : * ') + median(products.price), kql='category : *'), shift='3h')",
                dataType: 'number',
                operationType: 'average',
                sourceField: 'products.price',
                isBucketed: false,
                filter: {
                  query: 'NOT category : * ',
                  language: 'kuery',
                },
                params: {
                  emptyAsNull: false,
                },
                customLabel: true,
              } as AvgIndexPatternColumn,
              col2X3: {
                label:
                  "Part of moving_average(count() + sum(products.price, shift='1h') + differences(average(products.price, kql='NOT category : * ') + median(products.price), kql='category : *'), shift='3h')",
                dataType: 'number',
                operationType: 'median',
                sourceField: 'products.price',
                isBucketed: false,
                params: {
                  emptyAsNull: false,
                },
                customLabel: true,
              } as MedianIndexPatternColumn,
              col2X4: {
                label:
                  "Part of moving_average(count() + sum(products.price, shift='1h') + differences(average(products.price, kql='NOT category : * ') + median(products.price), kql='category : *'), shift='3h')",
                dataType: 'number',
                operationType: 'math',
                isBucketed: false,
                params: {
                  tinymathAst: {
                    type: 'function',
                    name: 'add',
                    args: ['col2X2', 'col2X3'] as unknown as TinymathAST[],
                    location: {
                      min: 71,
                      max: 144,
                    },
                    text: "average(products.price, kql='NOT category : * ') + median(products.price)",
                  },
                },
                references: ['col2X2', 'col2X3'],
                customLabel: true,
              } as MathIndexPatternColumn,
              col2X5: {
                label:
                  "Part of moving_average(count() + sum(products.price, shift='1h') + differences(average(products.price, kql='NOT category : * ') + median(products.price), kql='category : *'), shift='3h')",
                dataType: 'number',
                operationType: 'differences',
                isBucketed: false,
                references: ['col2X4'],
                filter: {
                  query: 'category : *',
                  language: 'kuery',
                },
                customLabel: true,
              },
              col2X6: {
                label:
                  "Part of moving_average(count() + sum(products.price, shift='1h') + differences(average(products.price, kql='NOT category : * ') + median(products.price), kql='category : *'), shift='3h')",
                dataType: 'number',
                operationType: 'math',
                isBucketed: false,
                params: {
                  tinymathAst: {
                    type: 'function',
                    name: 'add',
                    args: [
                      {
                        type: 'function',
                        name: 'add',
                        args: ['col2X0', 'col2X1'] as unknown as TinymathAST[],
                      },
                      'col2X5',
                    ],
                    location: {
                      min: 15,
                      max: 165,
                    },
                    text: "count() + sum(products.price, shift='1h') + differences(average(products.price, kql='NOT category : * ') + median(products.price), kql='category : *')",
                  },
                },
                references: ['col2X0', 'col2X1', 'col2X5'],
                customLabel: true,
              } as MathIndexPatternColumn,
              col2X7: {
                label:
                  "Part of moving_average(count() + sum(products.price, shift='1h') + differences(average(products.price, kql='NOT category : * ') + median(products.price), kql='category : *'), shift='3h')",
                dataType: 'number',
                operationType: 'moving_average',
                isBucketed: false,
                references: ['col2X6'],
                timeShift: '3h',
                params: {
                  window: 5,
                },
                customLabel: true,
              } as MovingAverageIndexPatternColumn,
              col2: {
                label:
                  "moving_average(count() + sum(products.price, shift='1h') + differences(average(products.price, kql='NOT category : * ') + median(products.price), kql='category : *'), shift='3h')",
                dataType: 'number',
                operationType: 'formula',
                isBucketed: false,
                params: {
                  formula:
                    "moving_average(count() + sum(products.price, shift='1h') + differences(average(products.price, kql='NOT category : * ') + median(products.price), kql='category : *'), shift='3h')",
                  isFormulaBroken: false,
                },
                references: ['col2X7'],
              } as FormulaIndexPatternColumn,
            },
            columnOrder: [
              'col1',
              'col2',
              'col2X0',
              'col2X1',
              'col2X2',
              'col2X3',
              'col2X4',
              'col2X5',
              'col2X6',
              'col2X7',
            ],
            incompleteColumns: {},
          },
        },
      };

      const ast = FormBasedDatasource.toExpression(
        queryBaseState,
        'first',
        indexPatterns,
        dateRange,
        nowInstant,
        'testing-seed'
      ) as Ast;
      const count = (ast.chain[1].arguments.aggs[1] as Ast).chain[0];
      const sum = (ast.chain[1].arguments.aggs[2] as Ast).chain[0];
      const average = (ast.chain[1].arguments.aggs[3] as Ast).chain[0];
      const median = (ast.chain[1].arguments.aggs[4] as Ast).chain[0];
      expect(count.arguments.timeShift).toEqual(['3h']);
      expect(count.arguments.customBucket).toEqual(undefined);
      expect(sum.arguments.timeShift).toEqual(['1h']);
      expect(sum.arguments.customBucket).toEqual(undefined);
      expect(average.arguments.timeShift).toEqual(['3h']);
      expect(
        ((average.arguments.customBucket[0] as Ast).chain[0].arguments.filter[0] as Ast).chain[0]
          .arguments.q[0]
      ).toEqual('NOT category : * ');
      expect(median.arguments.timeShift).toEqual(['3h']);
      expect(
        ((median.arguments.customBucket[0] as Ast).chain[0].arguments.filter[0] as Ast).chain[0]
          .arguments.q[0]
      ).toEqual('category : *');
    });

    it('should wrap filtered metrics in filtered metric aggregation', async () => {
      const queryBaseState: FormBasedPrivateState = {
        currentIndexPatternId: '1',
        layers: {
          first: {
            indexPatternId: '1',
            columnOrder: ['col1', 'col2', 'col3'],
            columns: {
              col1: {
                label: 'Count of records',
                dataType: 'number',
                isBucketed: false,
                sourceField: '___records___',
                operationType: 'count',
                timeScale: 'h',
                filter: {
                  language: 'kuery',
                  query: 'bytes > 5',
                },
              },
              col2: {
                label: 'Average of bytes',
                dataType: 'number',
                isBucketed: false,
                sourceField: 'bytes',
                operationType: 'average',
                timeScale: 'h',
              },
              col3: {
                label: 'Date',
                dataType: 'date',
                isBucketed: true,
                operationType: 'date_histogram',
                sourceField: 'timestamp',
                params: {
                  interval: 'auto',
                },
              } as DateHistogramIndexPatternColumn,
            },
          },
        },
      };

      const ast = FormBasedDatasource.toExpression(
        queryBaseState,
        'first',
        indexPatterns,
        dateRange,
        nowInstant,
        'testing-seed'
      ) as Ast;
      expect(ast.chain[1].arguments.aggs[0]).toMatchInlineSnapshot(`
        Object {
          "chain": Array [
            Object {
              "arguments": Object {
                "customBucket": Array [
                  Object {
                    "chain": Array [
                      Object {
                        "arguments": Object {
                          "enabled": Array [
                            true,
                          ],
                          "filter": Array [
                            Object {
                              "chain": Array [
                                Object {
                                  "arguments": Object {
                                    "q": Array [
                                      "bytes > 5",
                                    ],
                                  },
                                  "function": "kql",
                                  "type": "function",
                                },
                              ],
                              "type": "expression",
                            },
                          ],
                          "id": Array [
                            "0-filter",
                          ],
                          "schema": Array [
                            "bucket",
                          ],
                        },
                        "function": "aggFilter",
                        "type": "function",
                      },
                    ],
                    "type": "expression",
                  },
                ],
                "customMetric": Array [
                  Object {
                    "chain": Array [
                      Object {
                        "arguments": Object {
                          "enabled": Array [
                            true,
                          ],
                          "id": Array [
                            "0-metric",
                          ],
                          "schema": Array [
                            "metric",
                          ],
                        },
                        "function": "aggCount",
                        "type": "function",
                      },
                    ],
                    "type": "expression",
                  },
                ],
                "enabled": Array [
                  true,
                ],
                "id": Array [
                  "0",
                ],
                "schema": Array [
                  "metric",
                ],
              },
              "function": "aggFilteredMetric",
              "type": "function",
            },
          ],
          "type": "expression",
        }
      `);
    });

    it('should add time_scale and format function if time scale is set and supported', async () => {
      const queryBaseState: FormBasedPrivateState = {
        currentIndexPatternId: '1',
        layers: {
          first: {
            indexPatternId: '1',
            columnOrder: ['col1', 'col2', 'col3'],
            columns: {
              col1: {
                label: 'Count of records',
                dataType: 'number',
                isBucketed: false,
                sourceField: '___records___',
                operationType: 'count',
                timeScale: 'h',
              },
              col2: {
                label: 'Average of bytes',
                dataType: 'number',
                isBucketed: false,
                sourceField: 'bytes',
                operationType: 'average',
                timeScale: 'h',
              },
              col3: {
                label: 'Date',
                dataType: 'date',
                isBucketed: true,
                operationType: 'date_histogram',
                sourceField: 'timestamp',
                params: {
                  interval: 'auto',
                },
              } as DateHistogramIndexPatternColumn,
            },
          },
        },
      };

      const ast = FormBasedDatasource.toExpression(
        queryBaseState,
        'first',
        indexPatterns,
        dateRange,
        nowInstant,
        'testing-seed'
      ) as Ast;
      const timeScaleCalls = ast.chain.filter((fn) => fn.function === 'lens_time_scale');
      const formatCalls = ast.chain.filter((fn) => fn.function === 'lens_format_column');
      expect(timeScaleCalls).toHaveLength(1);
      expect(timeScaleCalls[0].arguments).toMatchInlineSnapshot(`
        Object {
          "dateColumnId": Array [
            "col3",
          ],
          "inputColumnId": Array [
            "col1",
          ],
          "outputColumnId": Array [
            "col1",
          ],
          "outputColumnName": Array [
            "Count of records per hour",
          ],
          "reducedTimeRange": Array [],
          "targetUnit": Array [
            "h",
          ],
        }
      `);
      expect(formatCalls[0]).toMatchInlineSnapshot(`
        Object {
          "arguments": Object {
            "columnId": Array [
              "col1",
            ],
            "format": Array [
              "",
            ],
            "parentFormat": Array [
              "{\\"id\\":\\"suffix\\",\\"params\\":{\\"unit\\":\\"h\\"}}",
            ],
          },
          "function": "lens_format_column",
          "type": "function",
        }
      `);
    });

    it('should not add time shift to nested count metric', async () => {
      const queryBaseState: FormBasedPrivateState = {
        currentIndexPatternId: '1',
        layers: {
          first: {
            indexPatternId: '1',
            columnOrder: ['col1'],
            columns: {
              col1: {
                label: 'Count of records',
                dataType: 'number',
                isBucketed: false,
                sourceField: '___records___',
                operationType: 'count',
                timeShift: '1h',
                reducedTimeRange: '1m',
              },
            },
          },
        },
      };

      const ast = FormBasedDatasource.toExpression(
        queryBaseState,
        'first',
        indexPatterns,
        dateRange,
        nowInstant,
        'testing-seed'
      ) as Ast;
      const filteredMetricAgg = (ast.chain[1].arguments.aggs[0] as Ast).chain[0].arguments;
      const metricAgg = (filteredMetricAgg.customMetric[0] as Ast).chain[0].arguments;
      const bucketAgg = (filteredMetricAgg.customBucket[0] as Ast).chain[0].arguments;
      expect(filteredMetricAgg.timeShift[0]).toEqual('1h');
      expect(bucketAgg.timeWindow[0]).toEqual('1m');
      expect(metricAgg.timeWindow).toEqual(undefined);
      expect(metricAgg.timeShift).toEqual(undefined);
    });

    it('should put column formatters after calculated columns', async () => {
      const queryBaseState: FormBasedPrivateState = {
        currentIndexPatternId: '1',
        layers: {
          first: {
            indexPatternId: '1',
            columnOrder: ['bucket', 'metric', 'calculated'],
            columns: {
              bucket: {
                label: 'Date',
                dataType: 'date',
                isBucketed: true,
                operationType: 'date_histogram',
                sourceField: 'timestamp',
                params: {
                  interval: 'auto',
                },
              } as DateHistogramIndexPatternColumn,
              metric: {
                label: 'Count of records',
                dataType: 'number',
                isBucketed: false,
                sourceField: '___records___',
                operationType: 'count',
                timeScale: 'h',
              },
              calculated: {
                label: 'Moving average of bytes',
                dataType: 'number',
                isBucketed: false,
                operationType: 'moving_average',
                references: ['metric'],
                params: {
                  window: 5,
                },
              } as MovingAverageIndexPatternColumn,
            },
          },
        },
      };

      const ast = FormBasedDatasource.toExpression(
        queryBaseState,
        'first',
        indexPatterns,
        dateRange,
        nowInstant,
        'testing-seed'
      ) as Ast;
      const formatIndex = ast.chain.findIndex((fn) => fn.function === 'lens_format_column');
      const calculationIndex = ast.chain.findIndex((fn) => fn.function === 'moving_average');
      expect(calculationIndex).toBeLessThan(formatIndex);
    });

    it('should rename the output from esaggs when using flat query', () => {
      const queryBaseState: FormBasedPrivateState = {
        currentIndexPatternId: '1',
        layers: {
          first: {
            indexPatternId: '1',
            columnOrder: ['bucket1', 'bucket2', 'metric'],
            columns: {
              metric: {
                label: 'Count of records',
                dataType: 'number',
                isBucketed: false,
                sourceField: '___records___',
                operationType: 'count',
              },
              bucket1: {
                label: 'Date',
                dataType: 'date',
                isBucketed: true,
                operationType: 'date_histogram',
                sourceField: 'timestamp',
                params: {
                  interval: '1d',
                },
              } as DateHistogramIndexPatternColumn,
              bucket2: {
                label: 'Terms',
                dataType: 'string',
                isBucketed: true,
                operationType: 'terms',
                sourceField: 'geo.src',
                params: {
                  orderBy: { type: 'alphabetical' },
                  orderDirection: 'asc',
                  size: 10,
                },
              } as TermsIndexPatternColumn,
            },
          },
        },
      };

      const ast = FormBasedDatasource.toExpression(
        queryBaseState,
        'first',
        indexPatterns,
        dateRange,
        nowInstant,
        'testing-seed'
      ) as Ast;
      expect(ast.chain[1].arguments.metricsAtAllLevels).toEqual([false]);
      expect(JSON.parse(ast.chain[2].arguments.idMap[0] as string)).toEqual({
        'col-0-0': [expect.objectContaining({ id: 'bucket1' })],
        'col-1-1': [expect.objectContaining({ id: 'bucket2' })],
        'col-2-2': [expect.objectContaining({ id: 'metric' })],
      });
    });

    it('should not put date fields used outside date_histograms to the esaggs timeFields parameter', async () => {
      const queryBaseState: FormBasedPrivateState = {
        currentIndexPatternId: '1',
        layers: {
          first: {
            indexPatternId: '1',
            columnOrder: ['col1', 'col2'],
            columns: {
              col1: {
                label: 'Count of records',
                dataType: 'date',
                isBucketed: false,
                sourceField: 'timefield',
                operationType: 'unique_count',
              },
              col2: {
                label: 'Date',
                dataType: 'date',
                isBucketed: true,
                operationType: 'date_histogram',
                sourceField: 'timestamp',
                params: {
                  interval: 'auto',
                },
              } as DateHistogramIndexPatternColumn,
            },
          },
        },
      };

      const ast = FormBasedDatasource.toExpression(
        queryBaseState,
        'first',
        indexPatterns,
        dateRange,
        nowInstant,
        'testing-seed'
      ) as Ast;
      expect(ast.chain[1].arguments.timeFields).toEqual(['timestamp']);
      expect(ast.chain[1].arguments.timeFields).not.toContain('timefield');
    });

    describe('optimizations', () => {
      it('should call optimizeEsAggs once per operation for which it is available', () => {
        const queryBaseState: FormBasedPrivateState = {
          currentIndexPatternId: '1',
          layers: {
            first: {
              indexPatternId: '1',
              columns: {
                col1: {
                  label: 'timestamp',
                  dataType: 'date',
                  operationType: 'date_histogram',
                  sourceField: 'timestamp',
                  isBucketed: true,
                  params: {
                    interval: 'auto',
                    includeEmptyRows: true,
                    dropPartials: false,
                  },
                } as DateHistogramIndexPatternColumn,
                col2: {
                  label: '95th percentile of bytes',
                  dataType: 'number',
                  operationType: 'percentile',
                  sourceField: 'bytes',
                  isBucketed: false,
                  params: {
                    percentile: 95,
                  },
                } as PercentileIndexPatternColumn,
                col3: {
                  label: '95th percentile of bytes',
                  dataType: 'number',
                  operationType: 'percentile',
                  sourceField: 'bytes',
                  isBucketed: false,
                  params: {
                    percentile: 95,
                  },
                } as PercentileIndexPatternColumn,
              },
              columnOrder: ['col1', 'col2', 'col3'],
              incompleteColumns: {},
            },
          },
        };

        const optimizeMock = jest.spyOn(operationDefinitionMap.percentile, 'optimizeEsAggs');

        FormBasedDatasource.toExpression(
          queryBaseState,
          'first',
          indexPatterns,
          dateRange,
          nowInstant,
          'testing-seed'
        );

        expect(operationDefinitionMap.percentile.optimizeEsAggs).toHaveBeenCalledTimes(1);

        optimizeMock.mockRestore();
      });

      it('should update anticipated esAggs column IDs based on the order of the optimized agg expression builders', () => {
        const queryBaseState: FormBasedPrivateState = {
          currentIndexPatternId: '1',
          layers: {
            first: {
              indexPatternId: '1',
              columns: {
                col1: {
                  label: 'timestamp',
                  dataType: 'date',
                  operationType: 'date_histogram',
                  sourceField: 'timestamp',
                  isBucketed: true,
                  params: {
                    interval: 'auto',
                    includeEmptyRows: true,
                    dropPartials: false,
                  },
                } as DateHistogramIndexPatternColumn,
                col2: {
                  label: '95th percentile of bytes',
                  dataType: 'number',
                  operationType: 'percentile',
                  sourceField: 'bytes',
                  isBucketed: false,
                  params: {
                    percentile: 95,
                  },
                } as PercentileIndexPatternColumn,
                col3: {
                  label: 'Count of records',
                  dataType: 'number',
                  isBucketed: false,
                  sourceField: '___records___',
                  operationType: 'count',
                  timeScale: 'h',
                },
                col4: {
                  label: 'Count of records2',
                  dataType: 'number',
                  isBucketed: false,
                  sourceField: 'bytes',
                  operationType: 'count',
                  timeScale: 'h',
                },
              },
              columnOrder: ['col1', 'col2', 'col3', 'col4'],
              incompleteColumns: {},
            },
          },
        };

        const optimizeMock = jest
          .spyOn(operationDefinitionMap.percentile, 'optimizeEsAggs')
          .mockImplementation((aggs, esAggsIdMap) => {
            // change the order of the aggregations
            return { aggs: aggs.reverse(), esAggsIdMap };
          });

        const ast = FormBasedDatasource.toExpression(
          queryBaseState,
          'first',
          indexPatterns,
          dateRange,
          nowInstant,
          'testing-seed'
        ) as Ast;

        expect(operationDefinitionMap.percentile.optimizeEsAggs).toHaveBeenCalledTimes(1);

        const idMap = JSON.parse(ast.chain[2].arguments.idMap as unknown as string);

        expect(Object.keys(idMap)).toEqual(['col-0-3', 'col-1-2', 'col-2-1', 'col-3-0']);

        optimizeMock.mockRestore();
      });

      it('should deduplicate aggs for supported operations', () => {
        const queryBaseState: FormBasedPrivateState = {
          currentIndexPatternId: '1',
          layers: {
            first: {
              indexPatternId: '1',
              columns: {
                col1: {
                  label: 'My Op',
                  dataType: 'string',
                  isBucketed: true,
                  operationType: 'terms',
                  sourceField: 'op',
                  params: {
                    size: 5,
                    orderBy: {
                      type: 'column',
                      columnId: 'col4', // col4 will disappear
                    },
                    orderDirection: 'asc',
                  },
                } as TermsIndexPatternColumn,
                col2: {
                  label: 'Count of records',
                  dataType: 'number',
                  isBucketed: false,
                  sourceField: '___records___',
                  operationType: 'count',
                  timeScale: 'h',
                },
                col3: {
                  label: 'Count of records',
                  dataType: 'number',
                  isBucketed: false,
                  sourceField: '___records___',
                  operationType: 'count',
                  timeScale: 'h',
                },
                col4: {
                  label: 'Count of records',
                  dataType: 'number',
                  isBucketed: false,
                  sourceField: '___records___',
                  operationType: 'count',
                  timeScale: 'h',
                },
              },
              columnOrder: ['col1', 'col2', 'col3', 'col4'],
              incompleteColumns: {},
            },
          },
        };

        const ast = FormBasedDatasource.toExpression(
          queryBaseState,
          'first',
          indexPatterns,
          dateRange,
          nowInstant,
          'testing-seed'
        ) as Ast;

        const idMap = JSON.parse(ast.chain[2].arguments.idMap as unknown as string);

        const aggs = ast.chain[1].arguments.aggs;

        expect(aggs).toHaveLength(2);

        // orderby reference updated
        expect((aggs[0] as Ast).chain[0].arguments.orderBy[0]).toBe('1');

        expect(idMap).toMatchInlineSnapshot(`
          Object {
            "col-0-0": Array [
              Object {
                "dataType": "string",
                "id": "col1",
                "isBucketed": true,
                "label": "Top 5 values of Missing field",
                "operationType": "terms",
                "params": Object {
                  "orderBy": Object {
                    "columnId": "col4",
                    "type": "column",
                  },
                  "orderDirection": "asc",
                  "size": 5,
                },
                "sourceField": "op",
              },
            ],
            "col-1-1": Array [
              Object {
                "dataType": "number",
                "id": "col2",
                "isBucketed": false,
                "label": "Count of records per hour",
                "operationType": "count",
                "sourceField": "___records___",
                "timeScale": "h",
              },
              Object {
                "dataType": "number",
                "id": "col3",
                "isBucketed": false,
                "label": "Count of records per hour",
                "operationType": "count",
                "sourceField": "___records___",
                "timeScale": "h",
              },
              Object {
                "dataType": "number",
                "id": "col4",
                "isBucketed": false,
                "label": "Count of records per hour",
                "operationType": "count",
                "sourceField": "___records___",
                "timeScale": "h",
              },
            ],
          }
        `);
      });
    });

    describe('references', () => {
      beforeEach(() => {
        // @ts-expect-error we are inserting an invalid type
        operationDefinitionMap.testReference = createMockedFullReference();

        // @ts-expect-error we are inserting an invalid type
        operationDefinitionMap.testReference.toExpression.mockReturnValue(['mock']);
      });

      afterEach(() => {
        delete operationDefinitionMap.testReference;
      });

      it('should collect expression references and append them', async () => {
        const queryBaseState: FormBasedPrivateState = {
          currentIndexPatternId: '1',
          layers: {
            first: {
              indexPatternId: '1',
              columnOrder: ['col1', 'col2'],
              columns: {
                col1: {
                  label: 'Count of records',
                  dataType: 'date',
                  isBucketed: false,
                  sourceField: 'timefield',
                  operationType: 'unique_count',
                },
                col2: {
                  label: 'Reference',
                  dataType: 'number',
                  isBucketed: false,
                  operationType: 'testReference',
                  references: ['col1'],
                },
              },
            },
          },
        };

        const ast = FormBasedDatasource.toExpression(
          queryBaseState,
          'first',
          indexPatterns,
          dateRange,
          nowInstant,
          'testing-seed'
        ) as Ast;
        // @ts-expect-error we can't isolate just the reference type
        expect(operationDefinitionMap.testReference.toExpression).toHaveBeenCalled();
        expect(ast.chain[3]).toEqual('mock');
      });

      it('should keep correct column mapping keys with reference columns present', async () => {
        const queryBaseState: FormBasedPrivateState = {
          currentIndexPatternId: '1',
          layers: {
            first: {
              indexPatternId: '1',
              columnOrder: ['col2', 'col1'],
              columns: {
                col1: {
                  label: 'Count of records',
                  dataType: 'date',
                  isBucketed: false,
                  sourceField: 'timefield',
                  operationType: 'unique_count',
                },
                col2: {
                  label: 'Reference',
                  dataType: 'number',
                  isBucketed: false,
                  operationType: 'testReference',
                  references: ['col1'],
                },
              },
            },
          },
        };

        const ast = FormBasedDatasource.toExpression(
          queryBaseState,
          'first',
          indexPatterns,
          dateRange,
          nowInstant,
          'testing-seed'
        ) as Ast;

        expect(JSON.parse(ast.chain[2].arguments.idMap[0] as string)).toEqual({
          'col-0-0': [
            expect.objectContaining({
              id: 'col1',
            }),
          ],
        });
      });

      it('should topologically sort references', () => {
        // This is a real example of count() + count()
        const queryBaseState: FormBasedPrivateState = {
          currentIndexPatternId: '1',
          layers: {
            first: {
              indexPatternId: '1',
              columnOrder: ['date', 'count', 'formula', 'countX0', 'math'],
              columns: {
                count: {
                  label: 'count',
                  dataType: 'number',
                  operationType: 'count',
                  isBucketed: false,
                  sourceField: '___records___',
                  customLabel: true,
                },
                date: {
                  label: 'timestamp',
                  dataType: 'date',
                  operationType: 'date_histogram',
                  sourceField: 'timestamp',
                  isBucketed: true,
                  params: {
                    interval: 'auto',
                  },
                } as DateHistogramIndexPatternColumn,
                formula: {
                  label: 'Formula',
                  dataType: 'number',
                  operationType: 'formula',
                  isBucketed: false,
                  params: {
                    formula: 'count() + count()',
                    isFormulaBroken: false,
                  },
                  references: ['math'],
                } as FormulaIndexPatternColumn,
                countX0: {
                  label: 'countX0',
                  dataType: 'number',
                  operationType: 'count',
                  isBucketed: false,
                  sourceField: '___records___',
                  customLabel: true,
                },
                math: {
                  label: 'math',
                  dataType: 'number',
                  operationType: 'math',
                  isBucketed: false,
                  params: {
                    tinymathAst: {
                      type: 'function',
                      name: 'add',
                      args: ['countX0', 'count'] as unknown as TinymathAST[],
                      location: {
                        min: 0,
                        max: 17,
                      },
                      text: 'count() + count()',
                    },
                  },
                  references: ['countX0', 'count'],
                  customLabel: true,
                } as MathIndexPatternColumn,
              },
            },
          },
        };

        const ast = FormBasedDatasource.toExpression(
          queryBaseState,
          'first',
          indexPatterns,
          dateRange,
          nowInstant,
          'testing-seed'
        ) as Ast;
        const chainLength = ast.chain.length;
        expect(ast.chain[chainLength - 2].arguments.name).toEqual(['math']);
        expect(ast.chain[chainLength - 1].arguments.id).toEqual(['formula']);
      });
    });
  });

  describe('#insertLayer', () => {
    it('should insert an empty layer into the previous state', () => {
      const state = {
        layers: {
          first: {
            indexPatternId: '1',
            columnOrder: [],
            columns: {},
          },
          second: {
            indexPatternId: '2',
            columnOrder: [],
            columns: {},
          },
        },
        currentIndexPatternId: '1',
        sampling: 1,
      };
      expect(FormBasedDatasource.insertLayer(state, 'newLayer', ['link-to-id'])).toEqual({
        ...state,
        layers: {
          ...state.layers,
          newLayer: {
            indexPatternId: '1',
            columnOrder: [],
            columns: {},
            sampling: 1,
            linkToLayers: ['link-to-id'],
            ignoreGlobalFilters: false,
          },
        },
      });
    });
  });

  describe('#removeLayer', () => {
    it('should remove a layer', () => {
      const state = {
        layers: {
          first: {
            indexPatternId: '1',
            columnOrder: [],
            columns: {},
          },
          second: {
            indexPatternId: '2',
            columnOrder: [],
            columns: {},
          },
        },
        currentIndexPatternId: '1',
      };
      expect(FormBasedDatasource.removeLayer(state, 'first')).toEqual({
        removedLayerIds: ['first'],
        newState: {
          ...state,
          layers: {
            second: {
              indexPatternId: '2',
              columnOrder: [],
              columns: {},
            },
          },
        },
      });
    });

    it('should remove linked layers', () => {
      const state = {
        layers: {
          first: {
            indexPatternId: '1',
            columnOrder: [],
            columns: {},
          },
          second: {
            indexPatternId: '2',
            columnOrder: [],
            columns: {},
            linkToLayers: ['first'],
          },
        },
        currentIndexPatternId: '1',
      };
      expect(FormBasedDatasource.removeLayer(state, 'first')).toEqual({
        removedLayerIds: ['first', 'second'],
        newState: {
          ...state,
          layers: {},
        },
      });
    });
  });

  describe('#clearLayer', () => {
    it('should clear a layer', () => {
      const state = {
        layers: {
          first: {
            indexPatternId: '1',
            columnOrder: ['some', 'order'],
            columns: {
              some: {} as GenericIndexPatternColumn,
              columns: {} as GenericIndexPatternColumn,
            },
            linkToLayers: ['some-layer'],
          },
        },
        currentIndexPatternId: '1',
      };
      expect(FormBasedDatasource.clearLayer(state, 'first')).toEqual({
        removedLayerIds: [],
        newState: {
          ...state,
          layers: {
            first: {
              indexPatternId: '1',
              columnOrder: [],
              columns: {},
              ignoreGlobalFilters: false,
              linkToLayers: ['some-layer'],
              sampling: 1,
            },
          },
        },
      });
    });

    it('should remove linked layers', () => {
      const state = {
        layers: {
          first: {
            indexPatternId: '1',
            columnOrder: [],
            columns: {},
          },
          second: {
            indexPatternId: '2',
            columnOrder: [],
            columns: {},
            linkToLayers: ['first'],
          },
        },
        currentIndexPatternId: '1',
      };
      expect(FormBasedDatasource.clearLayer(state, 'first')).toEqual({
        removedLayerIds: ['second'],
        newState: {
          ...state,
          layers: {
            first: {
              ...state.layers.first,
              linkToLayers: undefined,
              sampling: 1,
              ignoreGlobalFilters: false,
            },
          },
        },
      });
    });
  });

  describe('#createEmptyLayer', () => {
    it('creates state with empty layers', () => {
      expect(FormBasedDatasource.createEmptyLayer('index-pattern-id')).toEqual({
        currentIndexPatternId: 'index-pattern-id',
        layers: {},
      });
    });
  });

  describe('#getLayers', () => {
    it('should list the current layers', () => {
      expect(
        FormBasedDatasource.getLayers({
          layers: {
            first: {
              indexPatternId: '1',
              columnOrder: [],
              columns: {},
            },
            second: {
              indexPatternId: '2',
              columnOrder: [],
              columns: {},
            },
          },
          currentIndexPatternId: '1',
        })
      ).toEqual(['first', 'second']);
    });
  });

  describe('#getPublicAPI', () => {
    let publicAPI: DatasourcePublicAPI;

    beforeEach(async () => {
      publicAPI = FormBasedDatasource.getPublicAPI({
        state: baseState,
        layerId: 'first',
        indexPatterns,
      });
    });

    describe('getTableSpec', () => {
      it('should include col1', () => {
        expect(publicAPI.getTableSpec()).toEqual([expect.objectContaining({ columnId: 'col1' })]);
      });

      it('should include fields prop for each column', () => {
        expect(publicAPI.getTableSpec()).toEqual([expect.objectContaining({ fields: ['op'] })]);
      });

      it('should skip columns that are being referenced', () => {
        publicAPI = FormBasedDatasource.getPublicAPI({
          state: {
            ...baseState,
            layers: {
              first: {
                indexPatternId: '1',
                columnOrder: ['col1', 'col2'],
                columns: {
                  col1: {
                    label: 'Sum',
                    dataType: 'number',
                    isBucketed: false,

                    operationType: 'sum',
                    sourceField: 'test',
                    params: {},
                  } as GenericIndexPatternColumn,
                  col2: {
                    label: 'Cumulative sum',
                    dataType: 'number',
                    isBucketed: false,

                    operationType: 'cumulative_sum',
                    references: ['col1'],
                    params: {},
                  } as GenericIndexPatternColumn,
                },
              },
            },
          },
          layerId: 'first',
          indexPatterns,
        });

        expect(publicAPI.getTableSpec()).toEqual([expect.objectContaining({ columnId: 'col2' })]);
      });

      it('should collect all fields (also from referenced columns)', () => {
        publicAPI = FormBasedDatasource.getPublicAPI({
          state: {
            ...baseState,
            layers: {
              first: {
                indexPatternId: '1',
                columnOrder: ['col1', 'col2'],
                columns: {
                  col1: {
                    label: 'Sum',
                    dataType: 'number',
                    isBucketed: false,

                    operationType: 'sum',
                    sourceField: 'test',
                    params: {},
                  } as GenericIndexPatternColumn,
                  col2: {
                    label: 'Cumulative sum',
                    dataType: 'number',
                    isBucketed: false,

                    operationType: 'cumulative_sum',
                    references: ['col1'],
                    params: {},
                  } as GenericIndexPatternColumn,
                },
              },
            },
          },
          layerId: 'first',
          indexPatterns,
        });
        // The cumulative sum column has no field, but it references a sum column (hidden) which has it
        // The getTableSpec() should walk the reference tree and assign all fields to the root column
        expect(publicAPI.getTableSpec()).toEqual([{ columnId: 'col2', fields: ['test'] }]);
      });

      it('should collect and organize fields per visible column', () => {
        publicAPI = FormBasedDatasource.getPublicAPI({
          state: {
            ...baseState,
            layers: {
              first: {
                indexPatternId: '1',
                columnOrder: ['col1', 'col2', 'col3'],
                columns: {
                  col1: {
                    label: 'Sum',
                    dataType: 'number',
                    isBucketed: false,

                    operationType: 'sum',
                    sourceField: 'test',
                    params: {},
                  } as GenericIndexPatternColumn,
                  col2: {
                    label: 'Cumulative sum',
                    dataType: 'number',
                    isBucketed: false,

                    operationType: 'cumulative_sum',
                    references: ['col1'],
                    params: {},
                  } as GenericIndexPatternColumn,
                  col3: {
                    label: 'My Op',
                    dataType: 'string',
                    isBucketed: true,
                    operationType: 'terms',
                    sourceField: 'op',
                    params: {
                      size: 5,
                      orderBy: { type: 'alphabetical' },
                      orderDirection: 'asc',
                    },
                  } as TermsIndexPatternColumn,
                },
              },
            },
          },
          layerId: 'first',
          indexPatterns,
        });

        // col1 is skipped as referenced but its field gets inherited by col2
        expect(publicAPI.getTableSpec()).toEqual([
          { columnId: 'col2', fields: ['test'] },
          { columnId: 'col3', fields: ['op'] },
        ]);
      });
    });

    describe('getOperationForColumnId', () => {
      it('should get an operation for col1', () => {
        expect(publicAPI.getOperationForColumnId('col1')).toEqual({
          label: 'Top 5 values of Missing field',
          dataType: 'string',
          isBucketed: true,
          isStaticValue: false,
          hasTimeShift: false,
          hasReducedTimeRange: false,
          scale: 'ordinal',
          sortingHint: undefined,
          interval: undefined,
          hasArraySupport: false,
        } as OperationDescriptor);
      });

      it('should return null for non-existant columns', () => {
        expect(publicAPI.getOperationForColumnId('col2')).toBe(null);
      });

      it('should return null for referenced columns', () => {
        publicAPI = FormBasedDatasource.getPublicAPI({
          state: {
            ...baseState,
            layers: {
              first: {
                indexPatternId: '1',
                columnOrder: ['col1', 'col2'],
                columns: {
                  col1: {
                    label: 'Sum',
                    dataType: 'number',
                    isBucketed: false,

                    operationType: 'sum',
                    sourceField: 'test',
                    params: {},
                  } as GenericIndexPatternColumn,
                  col2: {
                    label: 'Cumulative sum',
                    dataType: 'number',
                    isBucketed: false,

                    operationType: 'cumulative_sum',
                    references: ['col1'],
                    params: {},
                  } as GenericIndexPatternColumn,
                },
              },
            },
          },
          layerId: 'first',
          indexPatterns,
        });
        expect(publicAPI.getOperationForColumnId('col1')).toEqual(null);
      });
    });

    describe('getSourceId', () => {
      it('should basically return the datasource internal id', () => {
        expect(publicAPI.getSourceId()).toEqual('1');
      });
    });

    describe('getFilters', () => {
      it('should return all filters in metrics, grouped by language', () => {
        publicAPI = FormBasedDatasource.getPublicAPI({
          state: {
            ...baseState,
            layers: {
              first: {
                indexPatternId: '1',
                columnOrder: ['col1', 'col2'],
                columns: {
                  col1: {
                    label: 'Sum',
                    dataType: 'number',
                    isBucketed: false,
                    operationType: 'sum',
                    sourceField: 'test',
                    params: {},
                    filter: { language: 'kuery', query: 'bytes > 1000' },
                  } as GenericIndexPatternColumn,
                  col2: {
                    label: 'Sum',
                    dataType: 'number',
                    isBucketed: false,
                    operationType: 'sum',
                    sourceField: 'test',
                    params: {},
                    filter: { language: 'lucene', query: 'memory' },
                  } as GenericIndexPatternColumn,
                },
              },
            },
          },
          layerId: 'first',
          indexPatterns,
        });
        expect(publicAPI.getFilters()).toEqual({
          enabled: {
            kuery: [[{ language: 'kuery', query: 'bytes > 1000' }]],
            lucene: [[{ language: 'lucene', query: 'memory' }]],
          },
          disabled: { kuery: [], lucene: [] },
        });
      });
      it('should ignore empty filtered metrics', () => {
        publicAPI = FormBasedDatasource.getPublicAPI({
          state: {
            ...baseState,
            layers: {
              first: {
                indexPatternId: '1',
                columnOrder: ['col1'],
                columns: {
                  col1: {
                    label: 'Sum',
                    dataType: 'number',
                    isBucketed: false,
                    operationType: 'sum',
                    sourceField: 'test',
                    params: {},
                    filter: { language: 'kuery', query: '' },
                  } as GenericIndexPatternColumn,
                },
              },
            },
          },
          layerId: 'first',
          indexPatterns,
        });
        expect(publicAPI.getFilters()).toEqual({
          enabled: { kuery: [], lucene: [] },
          disabled: { kuery: [], lucene: [] },
        });
      });
      it('should collect top values fields as kuery existence filters if no data is provided', () => {
        publicAPI = FormBasedDatasource.getPublicAPI({
          state: {
            ...baseState,
            layers: {
              first: {
                indexPatternId: '1',
                columnOrder: ['col1', 'col2'],
                columns: {
                  col1: {
                    label: 'Terms',
                    dataType: 'string',
                    isBucketed: true,
                    operationType: 'terms',
                    sourceField: 'geo.src',
                    params: {
                      orderBy: { type: 'alphabetical' },
                      orderDirection: 'asc',
                      size: 10,
                    },
                  } as TermsIndexPatternColumn,
                  col2: {
                    label: 'Terms',
                    dataType: 'string',
                    isBucketed: true,
                    operationType: 'terms',
                    sourceField: 'geo.dest',
                    params: {
                      orderBy: { type: 'alphabetical' },
                      orderDirection: 'asc',
                      size: 10,
                      secondaryFields: ['myField'],
                    },
                  } as TermsIndexPatternColumn,
                },
              },
            },
          },
          layerId: 'first',
          indexPatterns,
        });
        expect(publicAPI.getFilters()).toEqual({
          enabled: {
            kuery: [
              [{ language: 'kuery', query: '"geo.src": *' }],
              [
                { language: 'kuery', query: '"geo.dest": *' },
                { language: 'kuery', query: '"myField": *' },
              ],
            ],
            lucene: [],
          },
          disabled: { kuery: [], lucene: [] },
        });
      });
      it('shuold collect top values fields and terms as kuery filters if data is provided', () => {
        publicAPI = FormBasedDatasource.getPublicAPI({
          state: {
            ...baseState,
            layers: {
              first: {
                indexPatternId: '1',
                columnOrder: ['col1', 'col2'],
                columns: {
                  col1: {
                    label: 'Terms',
                    dataType: 'string',
                    isBucketed: true,
                    operationType: 'terms',
                    sourceField: 'geo.src',
                    params: {
                      orderBy: { type: 'alphabetical' },
                      orderDirection: 'asc',
                      size: 10,
                    },
                  } as TermsIndexPatternColumn,
                  col2: {
                    label: 'Terms',
                    dataType: 'string',
                    isBucketed: true,
                    operationType: 'terms',
                    sourceField: 'geo.dest',
                    params: {
                      orderBy: { type: 'alphabetical' },
                      orderDirection: 'asc',
                      size: 10,
                      secondaryFields: ['myField'],
                    },
                  } as TermsIndexPatternColumn,
                },
              },
            },
          },
          layerId: 'first',
          indexPatterns,
        });
        const data = {
          first: {
            type: 'datatable' as const,
            columns: [
              { id: 'col1', name: 'geo.src', meta: { type: 'string' as const } },
              { id: 'col2', name: 'geo.dest > myField', meta: { type: 'string' as const } },
            ],
            rows: [
              { col1: 'US', col2: { keys: ['IT', 'MyValue'] } },
              { col1: 'IN', col2: { keys: ['DE', 'MyOtherValue'] } },
            ],
          },
        };
        expect(publicAPI.getFilters(data)).toEqual({
          enabled: {
            kuery: [
              [
                { language: 'kuery', query: 'geo.src: "US"' },
                { language: 'kuery', query: 'geo.src: "IN"' },
              ],
              [
                { language: 'kuery', query: 'geo.dest: "IT" AND myField: "MyValue"' },
                { language: 'kuery', query: 'geo.dest: "DE" AND myField: "MyOtherValue"' },
              ],
            ],
            lucene: [],
          },
          disabled: { kuery: [], lucene: [] },
        });
      });
      it('shuold collect top values fields and terms and carefully handle empty string values', () => {
        publicAPI = FormBasedDatasource.getPublicAPI({
          state: {
            ...baseState,
            layers: {
              first: {
                indexPatternId: '1',
                columnOrder: ['col1', 'col2'],
                columns: {
                  col1: {
                    label: 'Terms',
                    dataType: 'string',
                    isBucketed: true,
                    operationType: 'terms',
                    sourceField: 'geo.src',
                    params: {
                      orderBy: { type: 'alphabetical' },
                      orderDirection: 'asc',
                      size: 10,
                    },
                  } as TermsIndexPatternColumn,
                  col2: {
                    label: 'Terms',
                    dataType: 'string',
                    isBucketed: true,
                    operationType: 'terms',
                    sourceField: 'geo.dest',
                    params: {
                      orderBy: { type: 'alphabetical' },
                      orderDirection: 'asc',
                      size: 10,
                      secondaryFields: ['myField'],
                    },
                  } as TermsIndexPatternColumn,
                },
              },
            },
          },
          layerId: 'first',
          indexPatterns,
        });
        const data = {
          first: {
            type: 'datatable' as const,
            columns: [
              { id: 'col1', name: 'geo.src', meta: { type: 'string' as const } },
              { id: 'col2', name: 'geo.dest > myField', meta: { type: 'string' as const } },
            ],
            rows: [
              { col1: 'US', col2: { keys: ['IT', ''] } },
              { col1: 'IN', col2: { keys: ['DE', 'MyOtherValue'] } },
            ],
          },
        };
        expect(publicAPI.getFilters(data)).toEqual({
          enabled: {
            kuery: [
              [
                { language: 'kuery', query: 'geo.src: "US"' },
                { language: 'kuery', query: 'geo.src: "IN"' },
              ],
              [
                { language: 'kuery', query: `geo.dest: "IT" AND myField: ""` },
                { language: 'kuery', query: `geo.dest: "DE" AND myField: "MyOtherValue"` },
              ],
            ],
            lucene: [],
          },
          disabled: { kuery: [], lucene: [] },
        });
      });
      it('should escape special characters in term values for valid KQL syntax', () => {
        publicAPI = FormBasedDatasource.getPublicAPI({
          state: {
            ...baseState,
            layers: {
              first: {
                indexPatternId: '1',
                columnOrder: ['col1'],
                columns: {
                  col1: {
                    label: 'Terms',
                    dataType: 'string',
                    isBucketed: true,
                    operationType: 'terms',
                    sourceField: 'path.keyword',
                    params: {
                      orderBy: { type: 'alphabetical' },
                      orderDirection: 'asc',
                      size: 10,
                    },
                  } as TermsIndexPatternColumn,
                },
              },
            },
          },
          layerId: 'first',
          indexPatterns,
        });
        const data = {
          first: {
            type: 'datatable' as const,
            columns: [{ id: 'col1', name: 'path.keyword', meta: { type: 'string' as const } }],
            rows: [
              { col1: 'C:\\' },
              { col1: 'path with "quotes"' },
              { col1: 'backslash\\and"quote' },
            ],
          },
        };
        expect(publicAPI.getFilters(data)).toEqual({
          enabled: {
            kuery: [
              [
                { language: 'kuery', query: 'path.keyword: "C:\\\\"' },
                { language: 'kuery', query: 'path.keyword: "path with \\"quotes\\""' },
                { language: 'kuery', query: 'path.keyword: "backslash\\\\and\\"quote"' },
              ],
            ],
            lucene: [],
          },
          disabled: { kuery: [], lucene: [] },
        });
      });
      it('should ignore top values fields if other/missing option is enabled', () => {
        publicAPI = FormBasedDatasource.getPublicAPI({
          state: {
            ...baseState,
            layers: {
              first: {
                indexPatternId: '1',
                columnOrder: ['col1', 'col2'],
                columns: {
                  col1: {
                    label: 'Terms',
                    dataType: 'string',
                    isBucketed: true,
                    operationType: 'terms',
                    sourceField: 'geo.src',
                    params: {
                      orderBy: { type: 'alphabetical' },
                      orderDirection: 'asc',
                      size: 10,
                      otherBucket: true,
                    },
                  } as TermsIndexPatternColumn,
                  col2: {
                    label: 'Terms',
                    dataType: 'string',
                    isBucketed: true,
                    operationType: 'terms',
                    sourceField: 'geo.src',
                    params: {
                      orderBy: { type: 'alphabetical' },
                      orderDirection: 'asc',
                      size: 10,
                      missingBucket: true,
                    },
                  } as TermsIndexPatternColumn,
                },
              },
            },
          },
          layerId: 'first',
          indexPatterns,
        });
        expect(publicAPI.getFilters()).toEqual({
          enabled: { kuery: [], lucene: [] },
          disabled: { kuery: [], lucene: [] },
        });
      });
      it('should collect custom ranges as kuery filters', () => {
        publicAPI = FormBasedDatasource.getPublicAPI({
          state: {
            ...baseState,
            layers: {
              first: {
                indexPatternId: '1',
                columnOrder: ['col1', 'col2'],
                columns: {
                  col1: {
                    label: 'Single range',
                    dataType: 'number',
                    isBucketed: true,
                    operationType: 'range',
                    sourceField: 'bytes',
                    params: {
                      type: 'range',
                      ranges: [{ from: 100, to: 150, label: 'Range 1' }],
                    },
                  } as RangeIndexPatternColumn,
                  col2: {
                    label: 'Multiple ranges',
                    dataType: 'number',
                    isBucketed: true,
                    operationType: 'range',
                    sourceField: 'bytes',
                    params: {
                      type: 'range',
                      ranges: [
                        { from: 200, to: 300, label: 'Range 2' },
                        { from: 300, to: 400, label: 'Range 3' },
                      ],
                    },
                  } as RangeIndexPatternColumn,
                },
              },
            },
          },
          layerId: 'first',
          indexPatterns,
        });
        expect(publicAPI.getFilters()).toEqual({
          enabled: {
            kuery: [
              [{ language: 'kuery', query: 'bytes >= 100 AND bytes <= 150' }],
              [
                { language: 'kuery', query: 'bytes >= 200 AND bytes <= 300' },
                { language: 'kuery', query: 'bytes >= 300 AND bytes <= 400' },
              ],
            ],
            lucene: [],
          },
          disabled: { kuery: [], lucene: [] },
        });
      });
      it('should collect custom ranges as kuery filters as partial', () => {
        publicAPI = FormBasedDatasource.getPublicAPI({
          state: {
            ...baseState,
            layers: {
              first: {
                indexPatternId: '1',
                columnOrder: ['col1', 'col2', 'col3'],
                columns: {
                  col1: {
                    label: 'Empty range',
                    dataType: 'number',
                    isBucketed: true,
                    operationType: 'range',
                    sourceField: 'bytes',
                    params: {
                      type: 'range',
                      ranges: [{ label: 'Empty range' }],
                    },
                  } as RangeIndexPatternColumn,
                  col2: {
                    label: 'From range',
                    dataType: 'number',
                    isBucketed: true,
                    operationType: 'range',
                    sourceField: 'bytes',
                    params: {
                      type: 'range',
                      ranges: [{ from: 100, label: 'Partial range 1' }],
                    },
                  } as RangeIndexPatternColumn,
                  col3: {
                    label: 'To ranges',
                    dataType: 'number',
                    isBucketed: true,
                    operationType: 'range',
                    sourceField: 'bytes',
                    params: {
                      type: 'range',
                      ranges: [{ to: 300, label: 'Partial Range 2' }],
                    },
                  } as RangeIndexPatternColumn,
                },
              },
            },
          },
          layerId: 'first',
          indexPatterns,
        });
        expect(publicAPI.getFilters()).toEqual({
          enabled: {
            kuery: [
              [{ language: 'kuery', query: 'bytes >= 100' }],
              [{ language: 'kuery', query: 'bytes <= 300' }],
            ],
            lucene: [],
          },
          disabled: { kuery: [], lucene: [] },
        });
      });
      it('should collect filters within filters operation grouped by language', () => {
        publicAPI = FormBasedDatasource.getPublicAPI({
          state: {
            ...baseState,
            layers: {
              first: {
                indexPatternId: '1',
                columnOrder: ['col1', 'col2', 'col3'],
                columns: {
                  col1: {
                    label: 'kuery Filter',
                    dataType: 'string',
                    isBucketed: true,
                    operationType: 'filters',
                    params: {
                      filters: [{ label: '', input: { language: 'kuery', query: 'bytes > 1000' } }],
                    },
                  } as FiltersIndexPatternColumn,
                  col2: {
                    label: 'Lucene Filter',
                    dataType: 'string',
                    isBucketed: true,
                    operationType: 'filters',
                    params: {
                      filters: [{ label: '', input: { language: 'lucene', query: 'memory' } }],
                    },
                  } as FiltersIndexPatternColumn,
                  col3: {
                    label: 'Mixed filters',
                    dataType: 'string',
                    isBucketed: true,
                    operationType: 'filters',
                    params: {
                      filters: [
                        { label: '', input: { language: 'kuery', query: 'bytes > 5000' } },
                        { label: '', input: { language: 'kuery', query: 'memory > 500000' } },
                        { label: '', input: { language: 'lucene', query: 'phpmemory' } },
                        { label: '', input: { language: 'lucene', query: 'memory: 5000000' } },
                      ],
                    },
                  } as FiltersIndexPatternColumn,
                },
              },
            },
          },
          layerId: 'first',
          indexPatterns,
        });
        expect(publicAPI.getFilters()).toEqual({
          enabled: {
            kuery: [
              [{ language: 'kuery', query: 'bytes > 1000' }],
              [
                { language: 'kuery', query: 'bytes > 5000' },
                { language: 'kuery', query: 'memory > 500000' },
              ],
            ],
            lucene: [
              [{ language: 'lucene', query: 'memory' }],
              [
                { language: 'lucene', query: 'phpmemory' },
                { language: 'lucene', query: 'memory: 5000000' },
              ],
            ],
          },
          disabled: { kuery: [], lucene: [] },
        });
      });
      it('should ignore filtered metrics if at least one metric is unfiltered', () => {
        publicAPI = FormBasedDatasource.getPublicAPI({
          state: {
            ...baseState,
            layers: {
              first: {
                indexPatternId: '1',
                columnOrder: ['col1', 'col2'],
                columns: {
                  col1: {
                    label: 'Sum',
                    dataType: 'number',
                    isBucketed: false,
                    operationType: 'sum',
                    sourceField: 'test',
                    params: {},
                    filter: { language: 'kuery', query: 'bytes > 1000' },
                  } as GenericIndexPatternColumn,
                  col2: {
                    label: 'Sum',
                    dataType: 'number',
                    isBucketed: false,
                    operationType: 'sum',
                    sourceField: 'test',
                    params: {},
                  } as GenericIndexPatternColumn,
                },
              },
            },
          },
          layerId: 'first',
          indexPatterns,
        });
        expect(publicAPI.getFilters()).toEqual({
          enabled: { kuery: [], lucene: [] },
          disabled: { kuery: [[{ language: 'kuery', query: 'bytes > 1000' }]], lucene: [] },
        });
      });
      it('should ignore filtered metrics if at least one metric is unfiltered in formula', () => {
        publicAPI = FormBasedDatasource.getPublicAPI({
          state: {
            ...baseState,
            layers: {
              first: {
                indexPatternId: '1',
                columnOrder: ['formula'],
                columns: {
                  formula: {
                    label: 'Formula',
                    dataType: 'number',
                    operationType: 'formula',
                    isBucketed: false,
                    params: {
                      formula: "count(kql='memory > 5000') + count()",
                      isFormulaBroken: false,
                    },
                    references: ['math'],
                  } as FormulaIndexPatternColumn,
                  countX0: {
                    label: 'countX0',
                    dataType: 'number',
                    operationType: 'count',
                    isBucketed: false,
                    sourceField: '___records___',
                    customLabel: true,
                    filter: { language: 'kuery', query: 'memory > 5000' },
                  },
                  countX1: {
                    label: 'countX1',
                    dataType: 'number',
                    operationType: 'count',
                    isBucketed: false,
                    sourceField: '___records___',
                    customLabel: true,
                  },
                  math: {
                    label: 'math',
                    dataType: 'number',
                    operationType: 'math',
                    isBucketed: false,
                    params: {
                      tinymathAst: {
                        type: 'function',
                        name: 'add',
                        args: ['countX0', 'countX1'] as unknown as TinymathAST[],
                        location: {
                          min: 0,
                          max: 17,
                        },
                        text: "count(kql='memory > 5000') + count()",
                      },
                    },
                    references: ['countX0', 'countX1'],
                    customLabel: true,
                  } as MathIndexPatternColumn,
                },
              },
            },
          },
          layerId: 'first',
          indexPatterns,
        });
        expect(publicAPI.getFilters()).toEqual({
          enabled: { kuery: [], lucene: [] },
          disabled: { kuery: [[{ language: 'kuery', query: 'memory > 5000' }]], lucene: [] },
        });
      });
      it('should support complete scenarios', () => {
        publicAPI = FormBasedDatasource.getPublicAPI({
          state: {
            ...baseState,
            layers: {
              first: {
                indexPatternId: '1',
                columnOrder: ['col1', 'col2', 'col3', 'col4'],
                columns: {
                  col1: {
                    label: 'Mixed filters',
                    dataType: 'string',
                    isBucketed: true,
                    operationType: 'filters',
                    params: {
                      filters: [
                        { label: '', input: { language: 'kuery', query: 'bytes > 5000' } },
                        { label: '', input: { language: 'kuery', query: 'memory > 500000' } },
                        { label: '', input: { language: 'lucene', query: 'phpmemory' } },
                        { label: '', input: { language: 'lucene', query: 'memory: 5000000' } },
                      ],
                    },
                  } as FiltersIndexPatternColumn,
                  col2: {
                    label: 'Sum',
                    dataType: 'number',
                    isBucketed: false,
                    operationType: 'sum',
                    sourceField: 'test',
                    params: {},
                    filter: { language: 'kuery', query: 'bytes > 1000' },
                  } as GenericIndexPatternColumn,
                  col3: {
                    label: 'Sum',
                    dataType: 'number',
                    isBucketed: false,
                    operationType: 'sum',
                    sourceField: 'test',
                    params: {},
                    filter: { language: 'lucene', query: 'memory' },
                  } as GenericIndexPatternColumn,
                  col4: {
                    label: 'Terms',
                    dataType: 'string',
                    isBucketed: true,
                    operationType: 'terms',
                    sourceField: 'geo.src',
                    params: {
                      orderBy: { type: 'alphabetical' },
                      orderDirection: 'asc',
                      size: 10,
                      secondaryFields: ['myField'],
                    },
                  } as TermsIndexPatternColumn,
                },
              },
            },
          },
          layerId: 'first',
          indexPatterns,
        });
        expect(publicAPI.getFilters()).toEqual({
          enabled: {
            kuery: [
              [{ language: 'kuery', query: 'bytes > 1000' }],
              [
                { language: 'kuery', query: 'bytes > 5000' },
                { language: 'kuery', query: 'memory > 500000' },
              ],
              [
                { language: 'kuery', query: '"geo.src": *' },
                { language: 'kuery', query: '"myField": *' },
              ],
            ],
            lucene: [
              [{ language: 'lucene', query: 'memory' }],
              [
                { language: 'lucene', query: 'phpmemory' },
                { language: 'lucene', query: 'memory: 5000000' },
              ],
            ],
          },
          disabled: { kuery: [], lucene: [] },
        });
      });

      it('should avoid duplicate filters when formula has a global filter', () => {
        publicAPI = FormBasedDatasource.getPublicAPI({
          state: {
            ...baseState,
            layers: {
              first: {
                indexPatternId: '1',
                columnOrder: ['formula'],
                columns: {
                  formula: {
                    label: 'Formula',
                    dataType: 'number',
                    operationType: 'formula',
                    isBucketed: false,
                    filter: { language: 'kuery', query: 'bytes > 4000' },
                    params: {
                      formula: "count(kql='memory > 5000') + count()",
                      isFormulaBroken: false,
                    },
                    references: ['math'],
                  } as FormulaIndexPatternColumn,
                  countX0: {
                    label: 'countX0',
                    dataType: 'number',
                    operationType: 'count',
                    isBucketed: false,
                    sourceField: '___records___',
                    customLabel: true,
                    filter: { language: 'kuery', query: 'bytes > 4000 AND memory > 5000' },
                  },
                  countX1: {
                    label: 'countX1',
                    dataType: 'number',
                    operationType: 'count',
                    isBucketed: false,
                    sourceField: '___records___',
                    customLabel: true,
                    filter: { language: 'kuery', query: 'bytes > 4000' },
                  },
                  math: {
                    label: 'math',
                    dataType: 'number',
                    operationType: 'math',
                    isBucketed: false,
                    params: {
                      tinymathAst: {
                        type: 'function',
                        name: 'add',
                        args: ['countX0', 'countX1'] as unknown as TinymathAST[],
                        location: {
                          min: 0,
                          max: 17,
                        },
                        text: "count(kql='memory > 5000') + count()",
                      },
                    },
                    references: ['countX0', 'countX1'],
                    customLabel: true,
                  } as MathIndexPatternColumn,
                },
              },
            },
          },
          layerId: 'first',
          indexPatterns,
        });
        expect(publicAPI.getFilters()).toEqual({
          enabled: {
            kuery: [
              [
                { language: 'kuery', query: 'bytes > 4000 AND memory > 5000' },
                { language: 'kuery', query: 'bytes > 4000' },
              ],
            ],
            lucene: [],
          },
          disabled: { kuery: [], lucene: [] },
        });
      });
    });

    describe('getMaxPossibleNumValues', () => {
      it('should pass it on to the operation when available', () => {
        const prediction = 23;
        const operationPredictSpy = jest
          .spyOn(operationDefinitionMap.terms, 'getMaxPossibleNumValues')
          .mockReturnValue(prediction);
        const columnId = 'col1';

        expect(publicAPI.getMaxPossibleNumValues(columnId)).toEqual(prediction);
        expect(operationPredictSpy).toHaveBeenCalledWith(
          expect.objectContaining({ operationType: 'terms' })
        );
      });

      it('should default to null', () => {
        expect(publicAPI.getMaxPossibleNumValues('non-existant')).toEqual(null);
      });
    });

    test('hasDefaultTimeField', () => {
      const indexPatternWithDefaultTimeField = {
        id: '1',
        title: 'my-fake-index-pattern',
        timeFieldName: 'timestamp',
        hasRestrictions: false,
        fields: fieldsOne,
        getFieldByName: getFieldByNameFactory(fieldsOne),
        getFormatterForField: () => ({ convertToText: (v: unknown) => v }),
        spec: {},
        isPersisted: true,
      };

      const indexPatternWithoutDefaultTimeField = {
        ...indexPatternWithDefaultTimeField,
        timeFieldName: '',
      };

      expect(
        FormBasedDatasource.getPublicAPI({
          state: baseState,
          layerId: 'first',
          indexPatterns: {
            1: indexPatternWithDefaultTimeField,
          },
        }).hasDefaultTimeField()
      ).toBe(true);
      expect(
        FormBasedDatasource.getPublicAPI({
          state: baseState,
          layerId: 'first',
          indexPatterns: {
            1: indexPatternWithoutDefaultTimeField,
          },
        }).hasDefaultTimeField()
      ).toBe(false);
    });
  });

  describe('#getUserMessages', () => {
    describe('error messages', () => {
      it('should generate error messages for a single layer', () => {
        (getErrorMessages as jest.Mock).mockClear();
        (getErrorMessages as jest.Mock).mockReturnValueOnce(['error 1', 'error 2']);
        const state: FormBasedPrivateState = {
          layers: {
            first: {
              indexPatternId: '1',
              columnOrder: [],
              columns: {},
            },
          },
          currentIndexPatternId: '1',
        };
        expect(
          FormBasedDatasource.getUserMessages(state, {
            frame: createMockFramePublicAPI({
              dataViews: createMockDataViewsState({ indexPatterns }),
            }),
            setState: () => {},
          })
        ).toMatchInlineSnapshot(`
          Array [
            Object {
              "displayLocations": Array [
                Object {
                  "id": "visualization",
                },
              ],
              "fixableInEditor": true,
              "longMessage": "error 1",
              "severity": "error",
              "shortMessage": "",
              "uniqueId": "error 1",
            },
            Object {
              "displayLocations": Array [
                Object {
                  "id": "visualization",
                },
              ],
              "fixableInEditor": true,
              "longMessage": "error 2",
              "severity": "error",
              "shortMessage": "",
              "uniqueId": "error 2",
            },
          ]
        `);
        expect(getErrorMessages).toHaveBeenCalledTimes(1);
      });

      it('should prepend each error with its layer number on multi-layer chart', () => {
        (getErrorMessages as jest.Mock).mockClear();
        (getErrorMessages as jest.Mock).mockReturnValueOnce(['error 1', 'error 2']);
        const state: FormBasedPrivateState = {
          layers: {
            first: {
              indexPatternId: '1',
              columnOrder: [],
              columns: {},
            },
            second: {
              indexPatternId: '1',
              columnOrder: [],
              columns: {},
            },
          },
          currentIndexPatternId: '1',
        };
        expect(
          FormBasedDatasource.getUserMessages(state, {
            frame: createMockFramePublicAPI({
              dataViews: createMockDataViewsState({ indexPatterns }),
            }),
            setState: () => {},
          })
        ).toMatchInlineSnapshot(`
          Array [
            Object {
              "displayLocations": Array [
                Object {
                  "id": "visualization",
                },
              ],
              "fixableInEditor": true,
              "longMessage": <Memo(MemoizedFormattedMessage)
                defaultMessage="Layer {position} error: {wrappedMessage}"
                id="xpack.lens.indexPattern.layerErrorWrapper"
                values={
                  Object {
                    "position": 1,
                    "wrappedMessage": "error 1",
                  }
                }
              />,
              "severity": "error",
              "shortMessage": "Layer 1 error: ",
              "uniqueId": "error 1",
            },
            Object {
              "displayLocations": Array [
                Object {
                  "id": "visualization",
                },
              ],
              "fixableInEditor": true,
              "longMessage": <Memo(MemoizedFormattedMessage)
                defaultMessage="Layer {position} error: {wrappedMessage}"
                id="xpack.lens.indexPattern.layerErrorWrapper"
                values={
                  Object {
                    "position": 1,
                    "wrappedMessage": "error 2",
                  }
                }
              />,
              "severity": "error",
              "shortMessage": "Layer 1 error: ",
              "uniqueId": "error 2",
            },
          ]
        `);
        expect(getErrorMessages).toHaveBeenCalledTimes(2);
      });

      describe('dimension button error behavior', () => {
        const state: FormBasedPrivateState = {
          layers: {
            first: {
              indexPatternId: '1',
              columnOrder: [],
              columns: {
                col1: {
                  operationType: 'terms',
                  filter: {
                    query: '::: bad query that will mark column invalid',
                    language: 'kuery',
                  },

                  sourceField: 'op',
                  params: {
                    size: 5,
                    orderBy: { type: 'alphabetical' },
                    orderDirection: 'asc',
                  },
                  label: 'My Op',
                  dataType: 'string',
                  isBucketed: true,
                } as TermsIndexPatternColumn,
              },
            },
          },
          currentIndexPatternId: '1',
        };

        it('should generate generic error if column invalid', () => {
          (getErrorMessages as jest.Mock).mockClear();
          (getErrorMessages as jest.Mock).mockReturnValueOnce([]);

          const messages = FormBasedDatasource.getUserMessages(state, {
            frame: createMockFramePublicAPI({
              dataViews: createMockDataViewsState({ indexPatterns }),
            }),
            setState: () => {},
          });

          expect(messages.length).toBe(1);

          expect(messages).toMatchInlineSnapshot(`
            Array [
              Object {
                "displayLocations": Array [
                  Object {
                    "dimensionId": "col1",
                    "id": "dimensionButton",
                  },
                ],
                "fixableInEditor": true,
                "longMessage": <p>
                  Invalid configuration.
                  <br />
                  Click for more details.
                </p>,
                "severity": "error",
                "shortMessage": "",
                "uniqueId": "editor_invalid_dimension",
              },
            ]
          `);
        });

        it('should override generic error if operation generates something specific', () => {
          (getErrorMessages as jest.Mock).mockClear();
          (getErrorMessages as jest.Mock).mockReturnValueOnce([
            {
              displayLocations: [{ id: 'dimensionButton', dimensionId: 'col1' }],
              message: 'specific error',
            },
          ] as ReturnType<typeof getErrorMessages>);

          const messages = FormBasedDatasource.getUserMessages(state, {
            frame: createMockFramePublicAPI({
              dataViews: createMockDataViewsState({ indexPatterns }),
            }),
            setState: () => {},
          });

          expect(messages.length).toBe(1);

          expect(messages).toMatchInlineSnapshot(`
            Array [
              Object {
                "displayLocations": Array [
                  Object {
                    "dimensionId": "col1",
                    "id": "dimensionButton",
                  },
                ],
                "fixableInEditor": true,
                "longMessage": <React.Fragment>
                  specific error
                </React.Fragment>,
                "severity": "error",
                "shortMessage": "",
                "uniqueId": undefined,
              },
            ]
          `);
        });
      });
    });

    describe('warning messages', () => {
      let state: FormBasedPrivateState;
      let framePublicAPI: FramePublicAPI;

      beforeEach(() => {
        (getErrorMessages as jest.Mock).mockReturnValueOnce([]);

        const termsColumn: TermsIndexPatternColumn = {
          operationType: 'terms',
          dataType: 'number',
          isBucketed: true,
          label: '123211',
          sourceField: 'foo',
          params: {
            size: 10,
            orderBy: {
              type: 'alphabetical',
            },
            orderDirection: 'asc',
          },
        };

        state = {
          layers: {
            first: {
              indexPatternId: '1',
              columnOrder: ['col1', 'col2', 'col3', 'col4', 'col5', 'col6'],
              columns: {
                col1: {
                  operationType: 'date_histogram',
                  params: {
                    interval: '12h',
                  },
                  label: '',
                  dataType: 'date',
                  isBucketed: true,
                  sourceField: 'timestamp',
                } as DateHistogramIndexPatternColumn,
                col2: {
                  operationType: 'count',
                  label: '',
                  dataType: 'number',
                  isBucketed: false,
                  sourceField: 'records',
                },
                col3: {
                  operationType: 'count',
                  timeShift: '1h',
                  label: '',
                  dataType: 'number',
                  isBucketed: false,
                  sourceField: 'records',
                },
                col4: {
                  operationType: 'count',
                  timeShift: '13h',
                  label: '',
                  dataType: 'number',
                  isBucketed: false,
                  sourceField: 'records',
                },
                col5: {
                  operationType: 'count',
                  timeShift: '1w',
                  label: '',
                  dataType: 'number',
                  isBucketed: false,
                  sourceField: 'records',
                },
                col6: {
                  operationType: 'count',
                  timeShift: 'previous',
                  label: '',
                  dataType: 'number',
                  isBucketed: false,
                  sourceField: 'records',
                },
                termsCol: termsColumn,
              },
            },
          },
          currentIndexPatternId: '1',
        };

        framePublicAPI = createMockFramePublicAPI({
          activeData: {
            first: {
              type: 'datatable',
              rows: [],
              columns: [
                {
                  id: 'col1',
                  name: 'col1',
                  meta: {
                    type: 'date',
                    source: 'esaggs',
                    sourceParams: {
                      type: 'date_histogram',
                      params: {
                        used_interval: '12h',
                      },
                    },
                  },
                },
                {
                  id: 'termsCol',
                  name: 'termsCol',
                  meta: {
                    type: 'string',
                    source: 'esaggs',
                    sourceParams: {
                      type: 'terms',
                    },
                  },
                } as DatatableColumn,
              ],
            },
          },
          dataViews: createMockDataViewsState({
            indexPatterns: expectedIndexPatterns,
          }),
        });
      });

      const extractTranslationIdsFromWarnings = (warnings: UserMessage[]) => {
        const onlyWarnings = filterAndSortUserMessages(warnings, undefined, {
          severity: 'warning',
        });
        return onlyWarnings.map(({ longMessage }) =>
          isFragment(longMessage)
            ? (longMessage as ReactElement).props.children[0].props.id
            : (longMessage as unknown as ReactElement).props.id
        );
      };

      it('should return mismatched time shifts', () => {
        const warnings = FormBasedDatasource.getUserMessages!(state, {
          frame: framePublicAPI,
          setState: () => {},
        });

        expect(extractTranslationIdsFromWarnings(warnings)).toMatchInlineSnapshot(`
                  Array [
                    "xpack.lens.indexPattern.timeShiftSmallWarning",
                    "xpack.lens.indexPattern.timeShiftMultipleWarning",
                  ]
              `);
      });

      it('should show different types of warning messages', () => {
        framePublicAPI.activeData!.first.columns[1].meta.sourceParams!.hasPrecisionError = true;

        const warnings = FormBasedDatasource.getUserMessages!(state, {
          frame: framePublicAPI,
          setState: () => {},
        });

        expect(extractTranslationIdsFromWarnings(warnings)).toMatchInlineSnapshot(`
                  Array [
                    "xpack.lens.indexPattern.timeShiftSmallWarning",
                    "xpack.lens.indexPattern.timeShiftMultipleWarning",
                    "xpack.lens.indexPattern.precisionErrorWarning.accuracyDisabled",
                  ]
              `);
      });
    });

    describe('info messages', () => {
      function createLayer(
        index: number = 0,
        sampling?: number
      ): FormBasedPrivateState['layers'][number] {
        return {
          sampling,
          indexPatternId: '1',
          columnOrder: [`col-${index}-1`, `col-${index}-2`],
          columns: {
            [`col-${index}-1`]: {
              operationType: 'date_histogram',
              params: {
                interval: '12h',
              },
              label: '',
              dataType: 'date',
              isBucketed: true,
              sourceField: 'timestamp',
            } as DateHistogramIndexPatternColumn,
            [`col-${index}-2`]: {
              operationType: 'count',
              label: '',
              dataType: 'number',
              isBucketed: false,
              sourceField: 'records',
            },
          },
        };
      }

      function createDatatableForLayer(index: number): Datatable {
        return {
          type: 'datatable' as const,
          rows: [],
          columns: [
            {
              id: `col-${index}-1`,
              name: `col-${index}-1`,
              meta: {
                type: 'date',
                source: 'esaggs',
                sourceParams: {
                  type: 'date_histogram',
                  params: {
                    used_interval: '12h',
                  },
                },
              },
            },
            {
              id: `col-${index}-2`,
              name: `col-${index}-2`,
              meta: {
                type: 'number',
              },
            },
          ],
        };
      }

      beforeEach(() => {
        (getErrorMessages as jest.Mock).mockReturnValueOnce([]);
      });

      it.each`
        sampling     | infoMessages
        ${undefined} | ${0}
        ${1}         | ${0}
        ${0.1}       | ${1}
      `(
        'should return $infoMessages info messages when sampling is set to $sampling',
        ({ sampling, infoMessages }) => {
          const messages = FormBasedDatasource.getUserMessages!(
            {
              layers: {
                first: createLayer(0, sampling),
              },
              currentIndexPatternId: '1',
            },
            {
              frame: createMockFramePublicAPI({
                activeData: {
                  first: createDatatableForLayer(0),
                },
                dataViews: createMockDataViewsState({
                  indexPatterns: expectedIndexPatterns,
                }),
              }),
              setState: () => {},
              visualizationInfo: { layers: [] },
            }
          );
          expect(messages.filter(({ severity }) => severity === 'info')).toHaveLength(infoMessages);
        }
      );

      it('should return a single info message for multiple layers with sampling < 100%', () => {
        const state: FormBasedPrivateState = {
          layers: {
            first: createLayer(0, 0.1),
            second: createLayer(1, 0.001),
          },
          currentIndexPatternId: '1',
        };
        const messages = FormBasedDatasource.getUserMessages!(state, {
          frame: createMockFramePublicAPI({
            activeData: {
              first: createDatatableForLayer(0),
              second: createDatatableForLayer(1),
            },
            dataViews: createMockDataViewsState({
              indexPatterns: expectedIndexPatterns,
            }),
          }),
          setState: () => {},
          visualizationInfo: { layers: [] },
        });
        const infoMessages = messages.filter(({ severity }) => severity === 'info');
        expect(infoMessages).toHaveLength(1);
        const [info] = infoMessages;
        if (isFragment(info.longMessage)) {
          expect(info.longMessage.props.layers).toHaveLength(2);
        }
      });
    });
  });

  describe('#updateStateOnCloseDimension', () => {
    it('should not update when there are no incomplete columns', () => {
      expect(
        FormBasedDatasource.updateStateOnCloseDimension!({
          state: {
            layers: {
              first: {
                indexPatternId: '1',
                columnOrder: ['col1'],
                columns: {
                  col1: {
                    dataType: 'number',
                    isBucketed: false,
                    label: 'Foo',
                    operationType: 'average',
                    sourceField: 'bytes',
                  },
                },
                incompleteColumns: {},
              },
            },
            currentIndexPatternId: '1',
          },
          layerId: 'first',
          columnId: 'col1',
        })
      ).toBeUndefined();
    });

    it('should clear all incomplete columns', () => {
      const state = {
        layers: {
          first: {
            indexPatternId: '1',
            columnOrder: [],
            columns: {},
            incompleteColumns: {
              col1: { operationType: 'average' as const },
              col2: { operationType: 'sum' as const },
            },
          },
        },
        currentIndexPatternId: '1',
      };
      expect(
        FormBasedDatasource.updateStateOnCloseDimension!({
          state,
          layerId: 'first',
          columnId: 'col1',
        })
      ).toEqual({
        ...state,
        layers: {
          first: {
            indexPatternId: '1',
            columnOrder: [],
            columns: {},
            incompleteColumns: undefined,
          },
        },
      });
    });
  });
  describe('#isTimeBased', () => {
    it('should return true if date histogram exists in any layer', () => {
      const state = {
        currentIndexPatternId: '1',
        layers: {
          first: {
            indexPatternId: '1',
            columnOrder: ['metric'],
            columns: {
              metric: {
                label: 'Count of records2',
                dataType: 'number',
                isBucketed: false,
                sourceField: '___records___',
                operationType: 'count',
              },
            },
          },
          second: {
            indexPatternId: '1',
            columnOrder: ['bucket1', 'bucket2', 'metric2'],
            columns: {
              metric2: {
                label: 'Count of records',
                dataType: 'number',
                isBucketed: false,
                sourceField: '___records___',
                operationType: 'count',
              },
              bucket1: {
                label: 'Date',
                dataType: 'date',
                isBucketed: true,
                operationType: 'date_histogram',
                sourceField: 'timestamp',
                params: {
                  interval: '1d',
                },
              } as DateHistogramIndexPatternColumn,
              bucket2: {
                label: 'Terms',
                dataType: 'string',
                isBucketed: true,
                operationType: 'terms',
                sourceField: 'geo.src',
                params: {
                  orderBy: { type: 'alphabetical' },
                  orderDirection: 'asc',
                  size: 10,
                },
              } as TermsIndexPatternColumn,
            },
          },
        },
      } as FormBasedPrivateState;
      expect(
        FormBasedDatasource.isTimeBased(state, {
          ...indexPatterns,
          '1': { ...indexPatterns['1'], timeFieldName: undefined },
        })
      ).toEqual(true);
    });
    it('should return false if date histogram exists but is detached from global time range in every layer', () => {
      const state = {
        currentIndexPatternId: '1',
        layers: {
          first: {
            indexPatternId: '1',
            columnOrder: ['metric'],
            columns: {
              metric: {
                label: 'Count of records2',
                dataType: 'number',
                isBucketed: false,
                sourceField: '___records___',
                operationType: 'count',
              },
            },
          },
          second: {
            indexPatternId: '1',
            columnOrder: ['bucket1', 'bucket2', 'metric2'],
            columns: {
              metric2: {
                label: 'Count of records',
                dataType: 'number',
                isBucketed: false,
                sourceField: '___records___',
                operationType: 'count',
              },
              bucket1: {
                label: 'Date',
                dataType: 'date',
                isBucketed: true,
                operationType: 'date_histogram',
                sourceField: 'timestamp',
                params: {
                  interval: '1d',
                  ignoreTimeRange: true,
                },
              } as DateHistogramIndexPatternColumn,
              bucket2: {
                label: 'Terms',
                dataType: 'string',
                isBucketed: true,
                operationType: 'terms',
                sourceField: 'geo.src',
                params: {
                  orderBy: { type: 'alphabetical' },
                  orderDirection: 'asc',
                  size: 10,
                },
              } as TermsIndexPatternColumn,
            },
          },
        },
      } as FormBasedPrivateState;
      expect(
        FormBasedDatasource.isTimeBased(state, {
          ...indexPatterns,
          '1': { ...indexPatterns['1'], timeFieldName: undefined },
        })
      ).toEqual(false);
    });
    it('should return false if date histogram does not exist in any layer', () => {
      const state = {
        currentIndexPatternId: '1',
        layers: {
          first: {
            indexPatternId: '1',
            columnOrder: ['metric'],
            columns: {
              metric: {
                label: 'Count of records',
                dataType: 'number',
                isBucketed: false,
                sourceField: '___records___',
                operationType: 'count',
              },
            },
          },
        },
      } as FormBasedPrivateState;
      expect(
        FormBasedDatasource.isTimeBased(state, {
          ...indexPatterns,
          '1': { ...indexPatterns['1'], timeFieldName: undefined },
        })
      ).toEqual(false);
    });
    it('should return true if the index pattern is time based even if date histogram does not exist in any layer', () => {
      const state = {
        currentIndexPatternId: '1',
        layers: {
          first: {
            indexPatternId: '1',
            columnOrder: ['metric'],
            columns: {
              metric: {
                label: 'Count of records',
                dataType: 'number',
                isBucketed: false,
                sourceField: '___records___',
                operationType: 'count',
              },
            },
          },
        },
      } as FormBasedPrivateState;
      expect(FormBasedDatasource.isTimeBased(state, indexPatterns)).toEqual(true);
    });
  });

  describe('#initializeDimension', () => {
    it('should return the same state if no static value is passed', () => {
      const state = {
        currentIndexPatternId: '1',
        layers: {
          first: {
            indexPatternId: '1',
            columnOrder: ['metric'],
            columns: {
              metric: {
                label: 'Count of records',
                dataType: 'number',
                isBucketed: false,
                sourceField: '___records___',
                operationType: 'count',
              },
            },
          },
        },
      } as FormBasedPrivateState;
      expect(
        FormBasedDatasource.initializeDimension!(state, 'first', indexPatterns, {
          columnId: 'newStatic',
          groupId: 'a',
          visualizationGroups: [],
        })
      ).toBe(state);
    });

    it('should add a new static value column if a static value is passed', () => {
      const state = {
        currentIndexPatternId: '1',
        layers: {
          first: {
            indexPatternId: '1',
            columnOrder: ['metric'],
            columns: {
              metric: {
                label: 'Count of records',
                dataType: 'number',
                isBucketed: false,
                sourceField: '___records___',
                operationType: 'count',
              },
            },
          },
        },
      } as FormBasedPrivateState;
      expect(
        FormBasedDatasource.initializeDimension!(state, 'first', indexPatterns, {
          columnId: 'newStatic',
          groupId: 'a',
          staticValue: 0, // use a falsy value to check also this corner case
          visualizationGroups: [],
        })
      ).toEqual({
        ...state,
        layers: {
          ...state.layers,
          first: {
            ...state.layers.first,
            incompleteColumns: {},
            columnOrder: ['metric', 'newStatic'],
            columns: {
              ...state.layers.first.columns,
              newStatic: {
                dataType: 'number',
                isBucketed: false,
                label: 'Static value: 0',
                operationType: 'static_value',
                params: { value: '0' },
                references: [],
              },
            },
          },
        },
      });
    });

    it('should add a new date histogram column if autoTimeField is passed', () => {
      const state = {
        currentIndexPatternId: '1',
        layers: {
          first: {
            indexPatternId: '1',
            columnOrder: ['metric'],
            columns: {
              metric: {
                label: 'Count of records',
                dataType: 'number',
                isBucketed: false,
                sourceField: '___records___',
                operationType: 'count',
              },
            },
          },
        },
      } as FormBasedPrivateState;
      expect(
        FormBasedDatasource.initializeDimension!(state, 'first', indexPatterns, {
          columnId: 'newTime',
          groupId: 'a',
          autoTimeField: true,
          visualizationGroups: [],
        })
      ).toEqual({
        ...state,
        layers: {
          ...state.layers,
          first: {
            ...state.layers.first,
            incompleteColumns: {},
            columnOrder: ['newTime', 'metric'],
            columns: {
              ...state.layers.first.columns,
              newTime: {
                dataType: 'date',
                isBucketed: true,
                label: 'timestampLabel',
                operationType: 'date_histogram',
                params: { dropPartials: false, includeEmptyRows: true, interval: 'auto' },
                sourceField: 'timestamp',
              },
            },
          },
        },
      });
    });

    describe('per-visualization includeEmptyRows default for autoTimeField', () => {
      const buildAutoTimeFieldState = (): FormBasedPrivateState =>
        ({
          currentIndexPatternId: '1',
          layers: {
            first: {
              indexPatternId: '1',
              columnOrder: ['metric'],
              columns: {
                metric: {
                  label: 'Count of records',
                  dataType: 'number',
                  isBucketed: false,
                  sourceField: '___records___',
                  operationType: 'count',
                },
              },
            },
          },
        } as FormBasedPrivateState);

      it.each([
        [SeriesTypes.BAR, false],
        [LENS_HEATMAP_CHART_SHAPES.HEATMAP, false],
        [PARTITION_CHART_TYPES.PIE, false],
        [PARTITION_CHART_TYPES.TREEMAP, false],
        [PARTITION_CHART_TYPES.MOSAIC, false],
        [PARTITION_CHART_TYPES.WAFFLE, false],
        [LENS_METRIC_ID, false],
        [LENS_TAGCLOUD_ID, false],
      ])(
        'defaults includeEmptyRows to false for visualization type "%s"',
        (visualizationTypeId, expected) => {
          const next = FormBasedDatasource.initializeDimension!(
            buildAutoTimeFieldState(),
            'first',
            indexPatterns,
            {
              columnId: 'newTime',
              groupId: 'a',
              autoTimeField: true,
              visualizationGroups: [],
              activeVisualizationTypeId: visualizationTypeId,
            }
          );
          expect(next.layers.first.columns.newTime).toMatchObject({
            operationType: 'date_histogram',
            params: { includeEmptyRows: expected },
          });
        }
      );

      it.each([[LENS_DATATABLE_ID], [SeriesTypes.LINE], [SeriesTypes.AREA], ['mixed']])(
        'keeps includeEmptyRows on for visualization type "%s"',
        (visualizationTypeId) => {
          const next = FormBasedDatasource.initializeDimension!(
            buildAutoTimeFieldState(),
            'first',
            indexPatterns,
            {
              columnId: 'newTime',
              groupId: 'a',
              autoTimeField: true,
              visualizationGroups: [],
              activeVisualizationTypeId: visualizationTypeId,
            }
          );
          expect(next.layers.first.columns.newTime).toMatchObject({
            operationType: 'date_histogram',
            params: { includeEmptyRows: true },
          });
        }
      );
    });
  });

  describe('#syncColumns', () => {
    it('copies linked columns', () => {
      const links: Parameters<Datasource['syncColumns']>[0]['links'] = [
        {
          from: {
            columnId: 'col1',
            layerId: 'first',
            groupId: 'foo',
          },
          to: {
            columnId: 'col1',
            layerId: 'second',
            groupId: 'foo',
          },
        },
        {
          from: {
            columnId: 'col2',
            layerId: 'first',
            groupId: 'foo',
          },
          to: {
            columnId: 'new-col',
            layerId: 'second',
            groupId: 'foo',
          },
        },
      ];

      const newState = FormBasedDatasource.syncColumns({
        state: {
          currentIndexPatternId: 'foo',
          layers: {
            first: {
              indexPatternId: 'foo',
              columnOrder: [],
              columns: {
                col1: {
                  operationType: 'sum',
                  label: '',
                  dataType: 'number',
                  isBucketed: false,
                  sourceField: 'field1',
                  customLabel: false,
                  timeScale: 'd',
                } as SumIndexPatternColumn,
                col2: {
                  sourceField: 'field2',
                  operationType: 'count',
                  customLabel: false,
                  timeScale: 'h',
                } as CountIndexPatternColumn,
              },
            },
            second: {
              indexPatternId: 'foo',
              columnOrder: [],
              columns: {
                col1: {
                  sourceField: 'field1',
                  operationType: 'count',
                  customLabel: false,
                  timeScale: 'd',
                } as CountIndexPatternColumn,
              },
            },
          },
        },
        links,
        indexPatterns,
        getDimensionGroups: () => [],
      });

      expect(newState).toMatchInlineSnapshot(`
        Object {
          "currentIndexPatternId": "foo",
          "layers": Object {
            "first": Object {
              "columnOrder": Array [],
              "columns": Object {
                "col1": Object {
                  "customLabel": false,
                  "dataType": "number",
                  "isBucketed": false,
                  "label": "",
                  "operationType": "sum",
                  "sourceField": "field1",
                  "timeScale": "d",
                },
                "col2": Object {
                  "customLabel": false,
                  "operationType": "count",
                  "sourceField": "field2",
                  "timeScale": "h",
                },
              },
              "indexPatternId": "foo",
            },
            "second": Object {
              "columnOrder": Array [
                "col1",
                "new-col",
              ],
              "columns": Object {
                "col1": Object {
                  "customLabel": false,
                  "dataType": "number",
                  "isBucketed": false,
                  "label": "",
                  "operationType": "sum",
                  "sourceField": "field1",
                  "timeScale": "d",
                },
                "new-col": Object {
                  "customLabel": false,
                  "operationType": "count",
                  "sourceField": "field2",
                  "timeScale": "h",
                },
              },
              "indexPatternId": "foo",
            },
          },
        }
      `);
    });

    it('updates terms order by references', () => {
      const links: Parameters<Datasource['syncColumns']>[0]['links'] = [
        {
          from: {
            columnId: 'col1FirstLayer',
            layerId: 'first',
            groupId: 'foo',
          },
          to: {
            columnId: 'col1SecondLayer',
            layerId: 'second',
            groupId: 'foo',
          },
        },
        {
          from: {
            columnId: 'col2',
            layerId: 'first',
            groupId: 'foo',
          },
          to: {
            columnId: 'new-col',
            layerId: 'second',
            groupId: 'foo',
          },
        },
      ];

      const newState = FormBasedDatasource.syncColumns({
        state: {
          currentIndexPatternId: 'foo',
          layers: {
            first: {
              indexPatternId: 'foo',
              columnOrder: [],
              columns: {
                col1FirstLayer: {
                  operationType: 'sum',
                  label: '',
                  dataType: 'number',
                  isBucketed: false,
                  sourceField: 'field1',
                  customLabel: false,
                  timeScale: 'd',
                } as SumIndexPatternColumn,
                col2: {
                  operationType: 'terms',
                  sourceField: 'field2',
                  label: '',
                  dataType: 'number',
                  isBucketed: false,
                  params: {
                    orderBy: {
                      columnId: 'col1FirstLayer',
                      type: 'column',
                    },
                  },
                } as TermsIndexPatternColumn,
              },
            },
            second: {
              indexPatternId: 'foo',
              columnOrder: [],
              columns: {
                col1SecondLayer: {
                  sourceField: 'field1',
                  operationType: 'count',
                  customLabel: false,
                  timeScale: 'd',
                } as CountIndexPatternColumn,
              },
            },
          },
        },
        links,
        indexPatterns,
        getDimensionGroups: () => [],
      });

      expect(
        (newState.layers.second.columns['new-col'] as TermsIndexPatternColumn).params.orderBy
      ).toEqual({
        type: 'column',
        columnId: 'col1SecondLayer',
      });
    });
  });

  describe('#isEqual', () => {
    const layerId = '8bd66b66-aba3-49fb-9ff2-4bf83f2be08e';

    const persistableState: FormBasedPersistedState = {
      layers: {
        [layerId]: {
          columns: {
            'fa649155-d7f5-49d9-af26-508287431244': {
              label: 'Count of records',
              dataType: 'number',
              operationType: 'count',
              isBucketed: false,
              sourceField: '___records___',
            },
          },
          columnOrder: ['fa649155-d7f5-49d9-af26-508287431244'],
          incompleteColumns: {},
        },
      },
    };

    const references1: Reference[] = [
      {
        id: 'some-id',
        name: 'indexpattern-datasource-layer-8bd66b66-aba3-49fb-9ff2-4bf83f2be08e',
        type: 'index-pattern',
      },
    ];

    const references2: Reference[] = [
      {
        id: 'some-DIFFERENT-id',
        name: 'indexpattern-datasource-layer-8bd66b66-aba3-49fb-9ff2-4bf83f2be08e',
        type: 'index-pattern',
      },
    ];

    it('should be false if datasource states are using different data views', () => {
      expect(
        FormBasedDatasource.isEqual(persistableState, references1, persistableState, references2)
      ).toBe(false);
    });

    it('should be false if datasource states differ', () => {
      const differentPersistableState = structuredClone(persistableState);
      differentPersistableState.layers[layerId].columnOrder = ['something else'];

      expect(
        FormBasedDatasource.isEqual(
          persistableState,
          references1,
          differentPersistableState,
          references1
        )
      ).toBe(false);
    });

    it('should be true if datasource states are identical and they refer to the same data view', () => {
      expect(
        FormBasedDatasource.isEqual(persistableState, references1, persistableState, references1)
      ).toBe(true);
    });
  });
});
