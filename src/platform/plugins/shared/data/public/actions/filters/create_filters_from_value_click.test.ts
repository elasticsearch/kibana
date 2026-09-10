/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { dataViewPluginMocks } from '@kbn/data-views-plugin/public/mocks';
import { createStubDataView } from '@kbn/data-views-plugin/common/data_view.stub';
import { dataPluginMock } from '../../mocks';
import { setIndexPatterns, setSearchService, setFeatureFlags } from '../../services';
import { getESQLAdHocDataview } from '@kbn/esql-utils';

jest.mock('@kbn/esql-utils', () => ({
  ...jest.requireActual('@kbn/esql-utils'),
  getESQLAdHocDataview: jest.fn(),
}));

const mockGetESQLAdHocDataview = getESQLAdHocDataview as jest.MockedFunction<
  typeof getESQLAdHocDataview
>;

import {
  createFiltersFromValueClickAction,
  appendFilterToESQLQueryFromValueClickAction,
  createFilterESQL,
} from './create_filters_from_value_click';
import type { FieldFormatsGetConfigFn } from '@kbn/field-formats-plugin/common';
import { BytesFormat } from '@kbn/field-formats-plugin/common';
import type { RangeFilter } from '@kbn/es-query';
import type { Datatable } from '@kbn/expressions-plugin/common';

const mockField = {
  name: 'bytes',
  filterable: true,
};
describe('createFiltersFromClickEvent', () => {
  const dataStart = dataPluginMock.createStartContract();
  const dataViews = dataViewPluginMocks.createStartContract();
  dataViews.get = jest.fn().mockResolvedValue({
    id: 'logstash-*',
    fields: {
      getByName: () => mockField,
      filter: () => [mockField],
    },
    getFormatterForField: () => new BytesFormat({}, (() => {}) as FieldFormatsGetConfigFn),
  });
  setSearchService(dataStart.search);
  setIndexPatterns(dataViews);
  describe('createFiltersFromValueClick', () => {
    let dataPoints: Parameters<typeof createFiltersFromValueClickAction>[0]['data'];

    beforeEach(() => {
      dataPoints = [
        {
          table: {
            columns: [
              {
                name: 'test',
                id: '1-1',
                meta: {
                  type: 'date',
                  source: 'esaggs',
                  sourceParams: {
                    indexPatternId: 'logstash-*',
                    type: 'histogram',
                    params: {
                      field: 'bytes',
                      interval: 30,
                      otherBucket: true,
                    },
                  },
                },
              },
            ],
            rows: [
              {
                '1-1': '2048',
              },
            ],
          },
          column: 0,
          row: 0,
          value: 'test',
        },
      ];
    });
    test('ignores event when value for rows is not provided', async () => {
      dataPoints[0].table.rows[0]['1-1'] = null;
      const filters = await createFiltersFromValueClickAction({ data: dataPoints });

      expect(filters.length).toEqual(0);
    });

    test('handles an event when aggregations type is a terms', async () => {
      (dataPoints[0].table.columns[0].meta.sourceParams as any).type = 'terms';
      const filters = await createFiltersFromValueClickAction({ data: dataPoints });

      expect(filters.length).toEqual(1);
      expect(filters[0].query?.match_phrase?.bytes).toEqual('2048');
    });

    test('handles an event when aggregations type is not terms', async () => {
      const filters = await createFiltersFromValueClickAction({ data: dataPoints });

      expect(filters.length).toEqual(1);

      const [rangeFilter] = filters as RangeFilter[];
      expect(rangeFilter.query.range.bytes.gte).toEqual(2048);
      expect(rangeFilter.query.range.bytes.lt).toEqual(2078);
    });

    test('handles non-unique filters', async () => {
      const [point] = dataPoints;
      const filters = await createFiltersFromValueClickAction({ data: [point, point] });

      expect(filters.length).toEqual(1);
    });
  });

  describe('createFilterESQL', () => {
    let table: Datatable;

    beforeEach(() => {
      table = {
        type: 'datatable',
        columns: [
          {
            name: 'test',
            id: '1-1',
            meta: {
              type: 'number',
              sourceParams: {
                indexPattern: 'logs*',
                sourceField: 'bytes',
                operationType: 'sum',
              },
            },
          },
        ],
        rows: [
          {
            '1-1': '2048',
          },
        ],
      };
    });

    test('ignores event when sourceField is missing', async () => {
      table.columns[0].meta.sourceParams = {};
      const filter = await createFilterESQL(table, 0, 0);

      expect(filter).toEqual([]);
    });

    test('ignores event when value for rows is not provided', async () => {
      table.rows[0]['1-1'] = null;
      const filter = await createFilterESQL(table, 0, 0);

      expect(filter).toEqual([]);
    });

    test('ignores event when sourceField.indexPattern is missing', async () => {
      (table.columns[0].meta.sourceParams as any).indexPattern = null;
      const filter = await createFilterESQL(table, 0, 0);

      expect(filter).toEqual([]);
    });

    test('handles an event when operation type is a date histogram', async () => {
      (table.columns[0].meta.sourceParams as any).operationType = 'date_histogram';
      (table.columns[0].meta.sourceParams as any).sourceField = '@timestamp';
      (table.columns[0].meta.sourceParams as any).interval = 1000;
      (table.columns[0].meta as any).type = 'date';
      table.rows[0]['1-1'] = 1696118400000;

      const filter = await createFilterESQL(table, 0, 0);

      expect(filter).toEqual([
        {
          meta: { field: '@timestamp', formattedValue: 1696118400000, index: 'logs*', params: {} },
          query: {
            range: {
              '@timestamp': {
                format: 'strict_date_optional_time',
                gte: 1696118400000,
                lt: 1696118401000,
              },
            },
          },
        },
      ]);
    });

    test('handles an event when operation type is histogram', async () => {
      (table.columns[0].meta.sourceParams as any).operationType = 'histogram';
      const filter = await createFilterESQL(table, 0, 0);

      expect(filter).toEqual([
        {
          meta: { field: 'bytes', formattedValue: '2048', index: 'logs*', params: {} },
          query: { range: { bytes: { gte: 2048, lt: 20480 } } },
        },
      ]);
    });

    test('handles an event when operation type is not date histogram', async () => {
      const filter = await createFilterESQL(table, 0, 0);

      expect(filter.length).toBe(1);
    });

    describe('raw columns (createFilterFromRawColumnsESQL)', () => {
      const mockFieldByName = jest.fn();
      const mockDataView = createStubDataView({
        spec: {
          id: 'mock-dataview-id',
          title: 'logs*',
        },
      });

      mockDataView.getFieldByName = mockFieldByName;

      beforeEach(() => {
        mockFieldByName.mockReset();
        mockGetESQLAdHocDataview.mockReset();
        mockGetESQLAdHocDataview.mockResolvedValue(mockDataView);

        table.columns[0] = {
          name: 'message',
          id: '1-1',
          meta: {
            type: 'string',
            sourceParams: {
              indexPattern: 'logs*',
              sourceField: 'message',
            },
          },
        };
        table.rows[0]['1-1'] = 'test message';
      });

      test('should return empty array when field is not found in dataview and dataset filtering is disabled', async () => {
        mockFieldByName.mockReturnValue(null);
        setFeatureFlags({
          getBooleanValue: jest.fn().mockResolvedValue(false),
        } as any);
        const filter = await createFilterESQL(table, 0, 0);
        expect(filter).toEqual([]);
      });

      test('should return empty array when field is not found in dataview', async () => {
        mockFieldByName.mockReturnValue(null);
        const filter = await createFilterESQL(table, 0, 0);
        expect(filter).toEqual([]);
      });

      test('should return empty array when field is not filterable', async () => {
        mockFieldByName.mockReturnValue({
          name: 'message',
          filterable: false,
        });
        const filter = await createFilterESQL(table, 0, 0);
        expect(filter).toEqual([]);
      });

      test('should create phrase filter for string value using sourceField for index field name', async () => {
        const mockFilterableField = {
          name: 'message',
          filterable: true,
        };
        mockFieldByName.mockReturnValue(mockFilterableField);

        const filter = await createFilterESQL(table, 0, 0);

        expect(mockFieldByName).toHaveBeenCalledWith('message');
        expect(filter).toHaveLength(1);
        expect(filter[0]).toEqual(
          expect.objectContaining({
            query: expect.objectContaining({
              match_phrase: expect.objectContaining({
                message: 'test message',
              }),
            }),
          })
        );
      });

      test('returns no filters when a computed column name matches sourceField and an index field with that name exists', async () => {
        table.columns[0].isComputedColumn = true;
        mockFieldByName.mockReturnValue({
          name: 'message',
          filterable: true,
        });

        const filter = await createFilterESQL(table, 0, 0);

        expect(mockFieldByName).toHaveBeenCalledTimes(1);
        expect(mockFieldByName).toHaveBeenCalledWith('message');
        expect(filter).toEqual([]);
      });

      test('returns no filters for that same computed column even after it is given a custom Lens label', async () => {
        // Renaming the dimension via the Appearance section only changes column.name/label; it
        // must not make an EVAL-computed column look like a genuine RENAME of the real field.
        table.columns[0].isComputedColumn = true;
        table.columns[0].name = 'My Custom Label';
        mockFieldByName.mockReturnValue({
          name: 'message',
          filterable: true,
        });

        const filter = await createFilterESQL(table, 0, 0);

        expect(mockFieldByName).toHaveBeenCalledWith('message');
        expect(filter).toEqual([]);
      });

      test('still creates a filter for a genuinely RENAMEd column, even with a custom Lens label', async () => {
        table.columns[0].isComputedColumn = true;
        table.columns[0].name = 'My Custom Label';
        (table.columns[0].meta!.sourceParams as Record<string, unknown>)!.isSourceFieldFilterable =
          true;
        mockFieldByName.mockReturnValue({
          name: 'message',
          filterable: true,
        });

        const filter = await createFilterESQL(table, 0, 0);

        expect(filter).toHaveLength(1);
      });

      test('should create phrases filter for array value using sourceField for index field name', async () => {
        const mockFilterableField = {
          name: 'tags',
          filterable: true,
        };
        mockFieldByName.mockReturnValue(mockFilterableField);
        table.columns[0].name = 'tags';
        (table.columns[0].meta!.sourceParams as Record<string, unknown>)!.sourceField = 'tags';
        table.columns[0].meta.type = 'string';
        table.rows[0]['1-1'] = ['tag1', 'tag2', 'tag3'];

        const filter = await createFilterESQL(table, 0, 0);

        expect(mockFieldByName).toHaveBeenCalledWith('tags');
        expect(filter).toHaveLength(1);
        expect(filter[0]).toEqual(
          expect.objectContaining({
            query: expect.objectContaining({
              bool: expect.objectContaining({
                should: expect.arrayContaining([
                  expect.objectContaining({
                    match_phrase: expect.objectContaining({
                      tags: 'tag1',
                    }),
                  }),
                  expect.objectContaining({
                    match_phrase: expect.objectContaining({
                      tags: 'tag2',
                    }),
                  }),
                  expect.objectContaining({
                    match_phrase: expect.objectContaining({
                      tags: 'tag3',
                    }),
                  }),
                ]),
              }),
            }),
          })
        );
      });

      describe('dataset sources (no fieldCaps)', () => {
        const mockInjectedField = {
          name: 'message',
          type: 'string',
          filterable: true,
          scripted: false,
        };

        beforeEach(() => {
          // First call returns null (field not in data view), second call returns the injected field
          mockFieldByName.mockReturnValueOnce(null).mockReturnValue(mockInjectedField);
          setFeatureFlags({
            getBooleanValue: jest.fn().mockResolvedValue(true),
          } as any);
          (table.columns[0].meta!.sourceParams as Record<string, unknown>).isSourceFieldFilterable =
            true;
        });

        test('creates a phrase filter by injecting the field into the data view', async () => {
          const filter = await createFilterESQL(table, 0, 0);

          expect(filter).toHaveLength(1);
          expect(filter[0]).toEqual(
            expect.objectContaining({
              query: expect.objectContaining({
                match_phrase: expect.objectContaining({ message: 'test message' }),
              }),
            })
          );
          expect(mockDataView.getFieldByName('message')).toBeDefined();
        });

        test('creates a phrases filter for array values', async () => {
          mockFieldByName.mockReset();
          mockFieldByName.mockReturnValueOnce(null).mockReturnValue(mockInjectedField);
          table.rows[0]['1-1'] = ['val1', 'val2'];

          const filter = await createFilterESQL(table, 0, 0);

          expect(filter).toHaveLength(1);
          expect(filter[0]).toEqual(
            expect.objectContaining({
              query: expect.objectContaining({
                bool: expect.objectContaining({
                  should: expect.arrayContaining([
                    expect.objectContaining({ match_phrase: { message: 'val1' } }),
                    expect.objectContaining({ match_phrase: { message: 'val2' } }),
                  ]),
                }),
              }),
            })
          );
        });

        test('returns empty array for computed columns even when isSourceFieldFilterable is true', async () => {
          table.columns[0].isComputedColumn = true;

          const filter = await createFilterESQL(table, 0, 0);

          expect(filter).toEqual([]);
        });

        test('returns empty array when isSourceFieldFilterable is not set', async () => {
          delete (table.columns[0].meta!.sourceParams as Record<string, unknown>)
            .isSourceFieldFilterable;

          const filter = await createFilterESQL(table, 0, 0);

          expect(filter).toEqual([]);
        });
      });
    });
  });

  describe('appendFilterToESQLQueryFromValueClickAction', () => {
    let dataPoints: Parameters<typeof appendFilterToESQLQueryFromValueClickAction>[0]['data'];
    beforeEach(() => {
      dataPoints = [
        {
          table: {
            columns: [
              {
                name: 'columnA',
                id: 'columnA',
                meta: {
                  type: 'date',
                },
              },
            ],
            rows: [
              {
                columnA: '2048',
              },
            ],
          },
          column: 0,
          row: 0,
          value: 'test',
        },
      ];
    });
    test('should return null for date fields', async () => {
      const queryString = await appendFilterToESQLQueryFromValueClickAction({
        data: dataPoints,
        query: { esql: 'from meow' },
      });

      expect(queryString).toBeUndefined();
    });

    test('should support multiple filters', async () => {
      dataPoints[0].table.columns[0] = {
        name: 'columnA',
        id: 'columnA',
        meta: {
          type: 'string',
        },
      };
      dataPoints.push({
        table: {
          columns: [
            {
              name: 'columnB',
              id: 'columnB',
              meta: {
                type: 'string',
              },
            },
          ],
          rows: [
            {
              columnB: '2048',
            },
          ],
        },
        column: 0,
        row: 0,
        value: 'test',
      });
      const queryString = await appendFilterToESQLQueryFromValueClickAction({
        data: dataPoints,
        query: { esql: 'from meow' },
      });
      expect(queryString).toEqual(`from meow
| WHERE \`columnA\` == "2048"
AND \`columnB\` == "2048"`);
    });

    test('should return null if no aggregate query is present', async () => {
      dataPoints[0].table.columns[0] = {
        name: 'test',
        id: '1-1',
        meta: {
          type: 'string',
        },
      };
      const queryString = await appendFilterToESQLQueryFromValueClickAction({
        data: dataPoints,
      });

      expect(queryString).toBeUndefined();
    });

    test('should return the update query string', async () => {
      dataPoints[0].table.columns[0] = {
        name: 'columnA',
        id: 'columnA',
        meta: {
          type: 'string',
        },
      };
      const queryString = await appendFilterToESQLQueryFromValueClickAction({
        data: dataPoints,
        query: { esql: 'from meow' },
      });

      expect(queryString).toEqual(`from meow
| WHERE \`columnA\` == "2048"`);
    });

    test('should return the update query string for negated action', async () => {
      dataPoints[0].table.columns[0] = {
        name: 'columnA',
        id: 'columnA',
        meta: {
          type: 'string',
        },
      };
      const queryString = await appendFilterToESQLQueryFromValueClickAction({
        data: dataPoints,
        query: { esql: 'from meow' },
        negate: true,
      });

      expect(queryString).toEqual(`from meow
| WHERE \`columnA\` != "2048"`);
    });

    describe('null value handling', () => {
      beforeEach(() => {
        dataPoints = [
          {
            table: {
              columns: [
                {
                  name: 'columnA',
                  id: 'columnA',
                  meta: {
                    type: 'string',
                  },
                },
              ],
              rows: [
                {
                  columnA: null,
                },
              ],
            },
            column: 0,
            row: 0,
            value: 'test',
          },
        ];
      });

      test('should filter for null values', () => {
        const queryString = appendFilterToESQLQueryFromValueClickAction({
          data: dataPoints,
          query: { esql: 'from meow' },
        });

        expect(queryString).toEqual(`from meow
| WHERE \`columnA\` is null`);
      });

      test('should filter out null values', () => {
        const queryString = appendFilterToESQLQueryFromValueClickAction({
          data: dataPoints,
          query: { esql: 'from meow' },
          negate: true,
        });

        expect(queryString).toEqual(`from meow
| WHERE \`columnA\` is not null`);
      });
    });
  });
});
