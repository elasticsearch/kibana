/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { coreMock } from '@kbn/core/public/mocks';
import type { IStorageWrapper } from '@kbn/kibana-utils-plugin/public';
import { expressionsPluginMock } from '@kbn/expressions-plugin/public/mocks';
import type {
  TextBasedPersistedState,
  TextBasedPrivateState,
  DatasourcePublicAPI,
  Datasource,
  FramePublicAPI,
} from '@kbn/lens-common';
import { dataPluginMock } from '@kbn/data-plugin/public/mocks';
import { dataViewPluginMocks } from '@kbn/data-views-plugin/public/mocks';
import { getTextBasedDatasource } from './text_based_languages';
import { generateId } from '../../id_generator';
jest.mock('../../id_generator');

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

const expectedIndexPatterns = {
  1: {
    id: '1',
    title: 'foo',
    timeFieldName: 'timestamp',
    hasRestrictions: false,
    fields: fieldsOne,
    getFieldByName: jest.fn(),
    getFormatterForField: jest.fn(),
    spec: {},
    isPersisted: true,
  },
};

const indexPatterns = expectedIndexPatterns;
const dateRange = {
  fromDate: '2022-03-17T08:25:00.000Z',
  toDate: '2022-04-17T08:25:00.000Z',
};

const queryBaseState: TextBasedPrivateState = {
  layers: {
    a: {
      columns: [
        {
          columnId: 'a',
          fieldName: 'Test 1',
          meta: {
            type: 'number',
          },
        },
        {
          columnId: 'b',
          fieldName: 'Test 2',
          meta: {
            type: 'number',
          },
        },
      ],
      query: { esql: 'FROM foo' },
      index: '1',
    },
  },
  indexPatternRefs: [
    { id: '1', title: 'foo' },
    { id: '2', title: 'my-fake-restricted-pattern' },
    { id: '3', title: 'my-compatible-pattern' },
  ],
};

describe('Textbased Data Source', () => {
  let baseState: TextBasedPrivateState;
  let TextBasedDatasource: Datasource<TextBasedPrivateState, TextBasedPersistedState>;

  beforeEach(() => {
    TextBasedDatasource = getTextBasedDatasource({
      storage: {} as IStorageWrapper,
      core: coreMock.createStart(),
      data: dataPluginMock.createStartContract(),
      dataViews: dataViewPluginMocks.createStartContract(),
      expressions: expressionsPluginMock.createStartContract(),
    });

    baseState = {
      layers: {
        a: {
          columns: [
            {
              columnId: 'col1',
              fieldName: 'Test 1',
              meta: {
                type: 'number',
              },
            },
          ],
          index: 'foo',
          query: { esql: 'FROM foo' },
        },
      },
    } as unknown as TextBasedPrivateState;
  });

  describe('#isEqual', () => {
    const mockState = {
      layers: {
        a: {
          columns: [
            {
              columnId: 'a',
              fieldName: 'Foo',
              meta: {
                type: 'number',
              },
            },
            {
              columnId: 'b',
              fieldName: 'Foo',
              meta: {
                type: 'number',
              },
            },
          ],
          index: 'foo',
        },
      },
    } as unknown as TextBasedPrivateState;

    it('should return true comparing same state', () => {
      const isEqual = TextBasedDatasource.isEqual(mockState, [], { ...mockState }, []);

      expect(isEqual).toBe(true);
    });

    it('should ignore undefined initialContext property', () => {
      const isEqual = TextBasedDatasource.isEqual(
        mockState,
        [],
        {
          ...mockState,
          initialContext: undefined,
        },
        []
      );

      expect(isEqual).toBe(true);
    });
  });

  describe('uniqueLabels', () => {
    it('appends a suffix to duplicates', () => {
      const map = TextBasedDatasource.uniqueLabels(
        {
          layers: {
            a: {
              columns: [
                {
                  columnId: 'a',
                  fieldName: 'Foo',
                  meta: {
                    type: 'number',
                  },
                },
                {
                  columnId: 'b',
                  fieldName: 'Foo',
                  meta: {
                    type: 'number',
                  },
                },
              ],
              index: 'foo',
            },
          },
        } as unknown as TextBasedPrivateState,
        {}
      );

      expect(map).toMatchInlineSnapshot(`
        Object {
          "a": "Foo",
          "b": "Foo [1]",
        }
      `);
    });

    it('uses label when customLabel is true', () => {
      const map = TextBasedDatasource.uniqueLabels(
        {
          layers: {
            a: {
              columns: [
                {
                  columnId: 'a',
                  fieldName: 'bucket_0_0',
                  label: 'Avg',
                  customLabel: true,
                  meta: {
                    type: 'number',
                  },
                },
                {
                  columnId: 'b',
                  fieldName: 'bucket_1_1',
                  label: 'Sum',
                  customLabel: true,
                  meta: {
                    type: 'number',
                  },
                },
              ],
              index: 'foo',
            },
          },
        } as unknown as TextBasedPrivateState,
        {}
      );

      expect(map).toMatchInlineSnapshot(`
        Object {
          "a": "Avg",
          "b": "Sum",
        }
      `);
    });

    it('uses fieldName when customLabel is false even if label differs', () => {
      const map = TextBasedDatasource.uniqueLabels(
        {
          layers: {
            a: {
              columns: [
                {
                  columnId: 'a',
                  fieldName: 'AVG(bytes)',
                  label: 'count',
                  customLabel: false,
                  meta: {
                    type: 'number',
                  },
                },
              ],
              index: 'foo',
            },
          },
        } as unknown as TextBasedPrivateState,
        {}
      );

      expect(map).toMatchInlineSnapshot(`
        Object {
          "a": "AVG(bytes)",
        }
      `);
    });

    it('falls back to fieldName when label is not present', () => {
      const map = TextBasedDatasource.uniqueLabels(
        {
          layers: {
            a: {
              columns: [
                {
                  columnId: 'a',
                  fieldName: 'bucket_0_0',
                  meta: {
                    type: 'number',
                  },
                },
                {
                  columnId: 'b',
                  fieldName: 'bucket_1_1',
                  label: 'Sum',
                  customLabel: true,
                  meta: {
                    type: 'number',
                  },
                },
              ],
              index: 'foo',
            },
          },
        } as unknown as TextBasedPrivateState,
        {}
      );

      expect(map).toMatchInlineSnapshot(`
        Object {
          "a": "bucket_0_0",
          "b": "Sum",
        }
      `);
    });
  });

  describe('#getPersistedState', () => {
    it('should persist from saved state', async () => {
      expect(TextBasedDatasource.getPersistableState(baseState)).toEqual({
        state: {
          layers: baseState.layers,
        },
        references: [
          { name: 'textBasedLanguages-datasource-layer-a', type: 'index-pattern', id: 'foo' },
        ],
      });
    });
  });

  describe('#getSelectedFields', () => {
    it('should return the fields used per layer', async () => {
      expect(TextBasedDatasource?.getSelectedFields?.(baseState)).toEqual(['Test 1']);
    });

    it('should return empty array for empty layers', async () => {
      const state = {
        ...baseState,
        layers: {},
      };
      expect(TextBasedDatasource?.getSelectedFields?.(state)).toEqual([]);
    });
  });

  describe('#getDropProps', () => {
    it('should return undefined if source is not present', () => {
      const props = {
        target: {
          layerId: 'a',
          groupId: 'groupId',
          columnId: 'col1',
          filterOperations: jest.fn(),
        },
        state: baseState,
        indexPatterns,
      };
      expect(TextBasedDatasource.getDropProps(props)).toBeUndefined();
    });

    it('should return undefined if target group not allows non numeric fields', () => {
      const newState = {
        ...baseState,
        layers: {
          a: {
            columns: [],
            query: { esql: 'FROM foo' },
            index: 'foo',
          },
        },
      } as unknown as TextBasedPrivateState;
      const props = {
        target: {
          layerId: 'a',
          groupId: 'groupId',
          columnId: 'col1',
          filterOperations: jest.fn(),
          isMetricDimension: true,
        },
        source: {
          id: 'col1',
          field: 'Test 1',
          humanData: {
            label: 'Test 1',
          },
        },
        state: newState,
        indexPatterns,
      };
      expect(TextBasedDatasource.getDropProps(props)).toBeUndefined();
    });
  });

  describe('#insertLayer', () => {
    it('should insert an empty layer into the previous state', () => {
      expect(TextBasedDatasource.insertLayer(baseState, 'newLayer')).toEqual({
        ...baseState,
        layers: {
          ...baseState.layers,
          newLayer: {
            index: 'foo',
            query: { esql: 'FROM foo' },
            columns: [],
          },
        },
      });
    });
  });

  describe('#removeLayer', () => {
    it('should remove a layer', () => {
      expect(TextBasedDatasource.removeLayer(baseState, 'a')).toEqual({
        removedLayerIds: ['a'],
        newState: {
          ...baseState,
          layers: {
            a: {
              columns: [],
              query: { esql: 'FROM foo' },
              index: 'foo',
            },
          },
        },
      });
    });
  });

  describe('#createEmptyLayer', () => {
    it('creates state with empty layers', () => {
      expect(TextBasedDatasource.createEmptyLayer('index-pattern-id')).toEqual({
        layers: {},
        indexPatternRefs: [],
      });
    });
  });

  describe('#getLayers', () => {
    it('should list the current layers', () => {
      expect(
        TextBasedDatasource.getLayers({
          layers: {
            a: {
              columns: [
                {
                  columnId: 'a',
                  fieldName: 'Test 1',
                  meta: {
                    type: 'number',
                  },
                },
                {
                  columnId: 'b',
                  fieldName: 'Test 2',
                  meta: {
                    type: 'number',
                  },
                },
              ],
              query: { esql: 'FROM foo' },
              index: 'foo',
            },
          },
        } as unknown as TextBasedPrivateState)
      ).toEqual(['a']);
    });
  });

  describe('#getDatasourceSuggestionsForVisualizeField', () => {
    (generateId as jest.Mock).mockReturnValue(`newid`);
    it('should create the correct layers', () => {
      const textBasedQueryColumns = [
        {
          id: 'bytes',
          name: 'bytes',
          meta: {
            type: 'number',
          },
        },
        {
          id: 'dest',
          name: 'dest',
          meta: {
            type: 'string',
          },
        },
      ];
      const state = {
        layers: {},
        initialContext: {
          textBasedColumns: textBasedQueryColumns,
          query: { esql: 'FROM "foo"' },
          dataViewSpec: {
            title: 'foo',
            id: '1',
            name: 'Foo',
          },
        },
      } as unknown as TextBasedPrivateState;
      const suggestions = TextBasedDatasource.getDatasourceSuggestionsForVisualizeField(
        state,
        '1',
        '',
        indexPatterns
      );
      expect(suggestions[0].state).toEqual({
        ...state,
        initialContext: undefined,
        indexPatternRefs: [
          {
            id: '1',
            timeField: undefined,
            title: 'foo',
          },
        ],
        layers: {
          newid: {
            columns: [
              {
                columnId: 'bytes',
                fieldName: 'bytes',
                customLabel: false,
                label: 'bytes',
                inMetricDimension: true,
                meta: {
                  type: 'number',
                },
              },
              {
                columnId: 'dest',
                fieldName: 'dest',
                customLabel: false,
                label: 'dest',
                meta: {
                  type: 'string',
                },
              },
            ],
            index: '1',
            query: {
              esql: 'FROM "foo"',
            },
          },
        },
      });

      expect(suggestions[0].table).toEqual({
        changeType: 'initial',
        columns: [
          {
            columnId: 'bytes',
            operation: {
              dataType: 'number',
              isBucketed: false,
              label: 'bytes',
            },
          },
          {
            columnId: 'dest',
            operation: {
              dataType: 'string',
              isBucketed: true,
              label: 'dest',
            },
          },
        ],
        isMultiRow: false,
        layerId: 'newid',
        notAssignedMetrics: false,
      });
    });

    it('should not return suggestions if no query is given', () => {
      const state = {
        layers: {},
        initialContext: {
          textBasedColumns: [
            {
              id: 'bytes',
              name: 'bytes',
              meta: {
                type: 'number',
              },
            },
            {
              id: 'dest',
              name: 'dest',
              meta: {
                type: 'string',
              },
            },
          ],
          dataViewSpec: {
            title: 'foo',
            id: '1',
            name: 'Foo',
          },
        },
      } as unknown as TextBasedPrivateState;
      const suggestions = TextBasedDatasource.getDatasourceSuggestionsForVisualizeField(
        state,
        '1',
        '',
        indexPatterns
      );
      expect(suggestions).toEqual([]);
    });

    it('should return the correct suggestions if non numeric columns are given', () => {
      const textBasedQueryColumns = [
        {
          id: '@timestamp',
          name: '@timestamp',
          customLabel: false,
          label: '@timestamp',
          meta: {
            type: 'date',
          },
        },
        {
          id: 'dest',
          name: 'dest',
          customLabel: false,
          label: 'dest',
          meta: {
            type: 'string',
          },
        },
      ];
      const state = {
        layers: {},
        initialContext: {
          textBasedColumns: textBasedQueryColumns,
          query: { esql: 'from foo' },
          dataViewSpec: {
            title: 'foo',
            id: '1',
            name: 'Foo',
          },
        },
      } as unknown as TextBasedPrivateState;
      const suggestions = TextBasedDatasource.getDatasourceSuggestionsForVisualizeField(
        state,
        '1',
        '',
        indexPatterns
      );
      expect(suggestions[0].state).toEqual({
        ...state,
        initialContext: undefined,
        indexPatternRefs: [
          {
            id: '1',
            timeField: undefined,
            title: 'foo',
          },
        ],
        layers: {
          newid: {
            columns: [
              {
                columnId: '@timestamp',
                fieldName: '@timestamp',
                customLabel: false,
                label: '@timestamp',
                inMetricDimension: true,
                meta: {
                  type: 'date',
                },
              },
              {
                columnId: 'dest',
                fieldName: 'dest',
                customLabel: false,
                label: 'dest',
                inMetricDimension: true,
                meta: {
                  type: 'string',
                },
              },
            ],
            index: '1',
            query: {
              esql: 'from foo',
            },
          },
        },
      });

      expect(suggestions[0].table).toEqual({
        changeType: 'initial',
        columns: [
          {
            columnId: '@timestamp',
            operation: {
              dataType: 'date',
              isBucketed: true,
              label: '@timestamp',
            },
          },
          {
            columnId: 'dest',
            operation: {
              dataType: 'string',
              isBucketed: true,
              label: 'dest',
            },
          },
        ],
        isMultiRow: false,
        layerId: 'newid',
        notAssignedMetrics: true,
      });
    });
  });

  describe('#getUserMessages', () => {
    it('should use the results of getUserMessages directly when single layer', () => {
      const state = {
        layers: {
          a: {
            columns: [
              {
                columnId: 'a',
                fieldName: 'Test 1',
                meta: {
                  type: 'number',
                },
              },
              {
                columnId: 'b',
                fieldName: 'Test 2',
                meta: {
                  type: 'number',
                },
              },
            ],
            errors: [new Error('error 1'), new Error('error 2')],
            query: { esql: 'FROM foo' },
            index: 'foo',
          },
        },
      } as unknown as TextBasedPrivateState;
      expect(
        TextBasedDatasource.getUserMessages(state, {
          frame: { dataViews: indexPatterns } as unknown as FramePublicAPI,
          setState: () => {},
        })
      ).toMatchInlineSnapshot(`
        Array [
          Object {
            "displayLocations": Array [
              Object {
                "id": "visualization",
              },
              Object {
                "id": "textBasedLanguagesQueryInput",
              },
            ],
            "fixableInEditor": true,
            "longMessage": "error 1",
            "severity": "error",
            "shortMessage": "error 1",
            "uniqueId": "text_based_lang_error",
          },
          Object {
            "displayLocations": Array [
              Object {
                "id": "visualization",
              },
              Object {
                "id": "textBasedLanguagesQueryInput",
              },
            ],
            "fixableInEditor": true,
            "longMessage": "error 2",
            "severity": "error",
            "shortMessage": "error 2",
            "uniqueId": "text_based_lang_error",
          },
        ]
      `);
    });
  });

  describe('#isTimeBased', () => {
    it('should return true if timeField is set on the layer', () => {
      const state = {
        layers: {
          a: {
            columns: [
              {
                columnId: 'a',
                fieldName: 'Test 1',
                meta: {
                  type: 'number',
                },
              },
              {
                columnId: 'b',
                fieldName: 'Test 2',
                meta: {
                  type: 'number',
                },
              },
            ],
            query: { esql: 'FROM foo' },
            index: '1',
            timeField: '@timestamp',
          },
        },
      } as unknown as TextBasedPrivateState;
      expect(
        TextBasedDatasource.isTimeBased(state, {
          ...indexPatterns,
        })
      ).toEqual(true);
    });
    it('should return false if timeField is not set on the layer', () => {
      const state = {
        layers: {
          a: {
            columns: [
              {
                columnId: 'a',
                fieldName: 'Test 1',
                meta: {
                  type: 'number',
                },
              },
              {
                columnId: 'b',
                fieldName: 'Test 2',
                meta: {
                  type: 'number',
                },
              },
            ],
            query: { esql: 'FROM foo' },
            index: '1',
          },
        },
      } as unknown as TextBasedPrivateState;
      expect(
        TextBasedDatasource.isTimeBased(state, {
          ...indexPatterns,
        })
      ).toEqual(false);
    });
  });

  describe('#initialize', () => {
    it('should hydrate timeField from indexPatterns when layer has no timeField', () => {
      const state = {
        layers: {
          a: {
            columns: [{ columnId: 'col1', fieldName: 'bytes', meta: { type: 'number' } }],
            query: { esql: 'FROM foo' },
            index: '1',
          },
        },
      } as unknown as TextBasedPersistedState;

      const result = TextBasedDatasource.initialize(state, [], undefined, undefined, indexPatterns);
      expect(result.layers.a.timeField).toBe('timestamp');
    });

    it('should not overwrite timeField when layer already has one', () => {
      const state = {
        layers: {
          a: {
            columns: [{ columnId: 'col1', fieldName: 'bytes', meta: { type: 'number' } }],
            query: { esql: 'FROM foo' },
            index: '1',
            timeField: 'custom_time',
          },
        },
      } as unknown as TextBasedPersistedState;

      const result = TextBasedDatasource.initialize(state, [], undefined, undefined, indexPatterns);
      expect(result.layers.a.timeField).toBe('custom_time');
    });

    it('should not hydrate when indexPatterns is undefined', () => {
      const state = {
        layers: {
          a: {
            columns: [{ columnId: 'col1', fieldName: 'bytes', meta: { type: 'number' } }],
            query: { esql: 'FROM foo' },
            index: '1',
          },
        },
      } as unknown as TextBasedPersistedState;

      const result = TextBasedDatasource.initialize(state, [], undefined, undefined, undefined);
      expect(result.layers.a.timeField).toBeUndefined();
    });

    it('should leave layer unchanged when layer.index does not match any indexPattern', () => {
      const state = {
        layers: {
          a: {
            columns: [{ columnId: 'col1', fieldName: 'bytes', meta: { type: 'number' } }],
            query: { esql: 'FROM unknown' },
            index: 'non-existent',
          },
        },
      } as unknown as TextBasedPersistedState;

      const result = TextBasedDatasource.initialize(state, [], undefined, undefined, indexPatterns);
      expect(result.layers.a.timeField).toBeUndefined();
    });

    it('should hydrate each layer independently', () => {
      const patternsWithNoTime = {
        ...indexPatterns,
        '2': { ...indexPatterns['1'], id: '2', timeFieldName: undefined },
      };
      const state = {
        layers: {
          a: {
            columns: [{ columnId: 'col1', fieldName: 'bytes', meta: { type: 'number' } }],
            query: { esql: 'FROM foo' },
            index: '1',
          },
          b: {
            columns: [{ columnId: 'col2', fieldName: 'src', meta: { type: 'string' } }],
            query: { esql: 'FROM bar' },
            index: '2',
          },
        },
      } as unknown as TextBasedPersistedState;

      const result = TextBasedDatasource.initialize(
        state,
        [],
        undefined,
        undefined,
        patternsWithNoTime
      );
      expect(result.layers.a.timeField).toBe('timestamp');
      expect(result.layers.b.timeField).toBeUndefined();
    });
  });

  describe('#toExpression', () => {
    it('should generate an empty expression when no columns are selected', async () => {
      const state = TextBasedDatasource.initialize();
      expect(
        TextBasedDatasource.toExpression(state, 'first', indexPatterns, dateRange, new Date())
      ).toEqual(null);
    });

    it('should set ignoreGlobalFilters in the esql expression when the layer has it enabled', () => {
      const stateWithIgnoreFilters = {
        ...queryBaseState,
        layers: {
          a: {
            ...queryBaseState.layers.a,
            ignoreGlobalFilters: true,
          },
        },
      } as unknown as TextBasedPrivateState;

      const expression = TextBasedDatasource.toExpression(
        stateWithIgnoreFilters,
        'a',
        indexPatterns,
        dateRange,
        new Date()
      );

      expect(expression).toHaveProperty(
        'chain.2.arguments',
        expect.objectContaining({ ignoreGlobalFilters: [true] })
      );
    });

    it('should generate an expression for an SQL query', async () => {
      expect(
        TextBasedDatasource.toExpression(queryBaseState, 'a', indexPatterns, dateRange, new Date())
      ).toMatchInlineSnapshot(`
        Object {
          "chain": Array [
            Object {
              "arguments": Object {},
              "function": "kibana",
              "type": "function",
            },
            Object {
              "arguments": Object {},
              "function": "kibana_context",
              "type": "function",
            },
            Object {
              "arguments": Object {
                "descriptionForInspector": Array [
                  "This request queries Elasticsearch to fetch the data for the visualization.",
                ],
                "ignoreGlobalFilters": Array [
                  false,
                ],
                "locale": Array [
                  "en",
                ],
                "query": Array [
                  "FROM foo",
                ],
                "titleForInspector": Array [
                  "Visualization",
                ],
              },
              "function": "esql",
              "type": "function",
            },
            Object {
              "arguments": Object {
                "idMap": Array [
                  "{\\"Test 1\\":[{\\"id\\":\\"a\\",\\"label\\":\\"Test 1\\"}],\\"Test 2\\":[{\\"id\\":\\"b\\",\\"label\\":\\"Test 2\\"}]}",
                ],
                "isTextBased": Array [
                  true,
                ],
              },
              "function": "lens_map_to_columns",
              "type": "function",
            },
            Object {
              "arguments": Object {},
              "function": "lens_drop_partial_buckets_textbased",
              "type": "function",
            },
          ],
          "type": "expression",
        }
      `);
    });
  });

  describe('#getPublicAPI', () => {
    let publicAPI: DatasourcePublicAPI;

    beforeEach(async () => {
      publicAPI = TextBasedDatasource.getPublicAPI({
        state: baseState,
        layerId: 'a',
        indexPatterns,
      });
    });

    describe('getTableSpec', () => {
      it('should include col1', () => {
        expect(publicAPI.getTableSpec()).toEqual([expect.objectContaining({ columnId: 'col1' })]);
      });

      it('should include fields prop for each column', () => {
        expect(publicAPI.getTableSpec()).toEqual([expect.objectContaining({ fields: ['Test 1'] })]);
      });

      it('should collect all fields ', () => {
        const state = {
          layers: {
            a: {
              columns: [
                {
                  columnId: 'col1',
                  fieldName: 'Test 1',
                  meta: {
                    type: 'number',
                  },
                },
                {
                  columnId: 'col2',
                  fieldName: 'Test 2',
                  meta: {
                    type: 'number',
                  },
                },
              ],
              index: 'foo',
            },
          },
        } as unknown as TextBasedPrivateState;

        publicAPI = TextBasedDatasource.getPublicAPI({
          state,
          layerId: 'a',
          indexPatterns,
        });
        expect(publicAPI.getTableSpec()).toEqual([
          { columnId: 'col1', fields: ['Test 1'] },
          { columnId: 'col2', fields: ['Test 2'] },
        ]);
      });

      it('should return non-metric columns before metric columns', () => {
        const state = {
          layers: {
            a: {
              columns: [
                {
                  columnId: 'metric1',
                  fieldName: 'bytes',
                  meta: { type: 'number' },
                  inMetricDimension: true,
                },
                {
                  columnId: 'row1',
                  fieldName: 'agent',
                  meta: { type: 'string' },
                },
                {
                  columnId: 'metric2',
                  fieldName: 'memory',
                  meta: { type: 'number' },
                  inMetricDimension: true,
                },
                {
                  columnId: 'row2',
                  fieldName: 'host',
                  meta: { type: 'string' },
                },
              ],
              index: 'foo',
            },
          },
        } as unknown as TextBasedPrivateState;

        publicAPI = TextBasedDatasource.getPublicAPI({
          state,
          layerId: 'a',
          indexPatterns,
        });
        expect(publicAPI.getTableSpec()).toEqual([
          { columnId: 'row1', fields: ['agent'] },
          { columnId: 'row2', fields: ['host'] },
          { columnId: 'metric1', fields: ['bytes'] },
          { columnId: 'metric2', fields: ['memory'] },
        ]);
      });

      it('should return only the columns that exist on the query', () => {
        publicAPI = TextBasedDatasource.getPublicAPI({
          state: baseState,
          layerId: 'a',
          indexPatterns,
        });
        expect(publicAPI.getTableSpec()).toEqual([
          {
            columnId: 'col1',
            fields: ['Test 1'],
          },
        ]);
      });
    });

    describe('getOperationForColumnId', () => {
      it('should get an operation for col1', () => {
        expect(publicAPI.getOperationForColumnId('col1')).toEqual({
          label: 'Test 1',
          dataType: 'number',
          isBucketed: false,
          hasTimeShift: false,
          hasReducedTimeRange: false,
          scale: 'ratio',
        });
      });

      it('should get an operation for col2', () => {
        const state = {
          layers: {
            a: {
              columns: [
                {
                  columnId: 'col1',
                  fieldName: 'Test 1',
                  meta: {
                    type: 'number',
                  },
                },
                {
                  columnId: 'col2',
                  fieldName: 'Test 2',
                  meta: {
                    type: 'date',
                  },
                },
              ],
              index: 'foo',
            },
          },
        } as unknown as TextBasedPrivateState;

        publicAPI = TextBasedDatasource.getPublicAPI({
          state,
          layerId: 'a',
          indexPatterns,
        });
        expect(publicAPI.getOperationForColumnId('col2')).toEqual({
          label: 'Test 2',
          dataType: 'date',
          isBucketed: true,
          hasTimeShift: false,
          hasReducedTimeRange: false,
          scale: 'interval',
        });
      });

      it('should return null for non-existant columns', () => {
        expect(publicAPI.getOperationForColumnId('col2')).toBe(null);
      });
    });

    describe('getSourceId', () => {
      it('should basically return the datasource internal id', () => {
        expect(publicAPI.getSourceId()).toEqual('foo');
      });
    });
  });
  describe('#getDatasourceSuggestionsFromCurrentState', () => {
    test('should return unchanged suggestion only for one numeric column', () => {
      const suggestions = TextBasedDatasource.getDatasourceSuggestionsFromCurrentState(baseState);
      expect(suggestions.length).toEqual(1);
      expect(suggestions[0].table.changeType).toEqual('unchanged');
    });
    test('should return unchanged suggestion and reduced suggestion for one bucketed and one numeric column', () => {
      baseState.layers.a.columns.push({
        columnId: 'c',
        fieldName: 'Test 3',
        meta: {
          type: 'string',
        },
      });
      const suggestions = TextBasedDatasource.getDatasourceSuggestionsFromCurrentState(baseState);
      expect(suggestions.length).toEqual(2);
      expect(suggestions.map((s) => s.table.changeType)).toEqual(['unchanged', 'reduced']);
    });
    test('should return unchanged suggestion and 2 reduced suggestions for two numeric columns (converting one to bucket)', () => {
      const suggestions =
        TextBasedDatasource.getDatasourceSuggestionsFromCurrentState(queryBaseState);

      expect(suggestions.length).toEqual(3);
      expect(suggestions.map((s) => s.table.changeType)).toEqual([
        'unchanged',
        'reduced',
        'reduced',
      ]);
    });
    test('should return unchanges suggestion and 3 reduced suggestions for many columns', () => {
      baseState.layers.a.columns.push(
        {
          columnId: 'b',
          fieldName: 'Test 3',
          meta: {
            type: 'string',
          },
        },
        {
          columnId: 'c',
          fieldName: 'Test 4',
          meta: {
            type: 'string',
          },
        },
        {
          columnId: 'd',
          fieldName: 'Test 5',
          meta: {
            type: 'string',
          },
        },
        {
          columnId: 'e',
          fieldName: 'Test 6',
          meta: {
            type: 'string',
          },
        },
        {
          columnId: 'f',
          fieldName: 'Test 7',
          meta: {
            type: 'string',
          },
        }
      );
      const suggestions = TextBasedDatasource.getDatasourceSuggestionsFromCurrentState(baseState);
      expect(suggestions.length).toEqual(4);
      expect(suggestions.map((s) => s.table.changeType)).toEqual([
        'unchanged',
        'reduced',
        'reduced',
        'reduced',
      ]);
    });
  });

  describe('#getRenderEventCounters', () => {
    it('should return correct counter for esql query', () => {
      const state = {
        layers: {
          a: {
            columns: [
              {
                columnId: 'col1',
                fieldName: 'Test 1',
                meta: {
                  type: 'number',
                },
              },
            ],
            query: { esql: 'FROM foo' },
            index: 'foo',
          },
        },
      } as unknown as TextBasedPrivateState;

      const counters =
        TextBasedDatasource.getRenderEventCounters &&
        TextBasedDatasource.getRenderEventCounters(state);

      expect(counters).toEqual(['esql_chart']);
    });
  });
});
