/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import type { DateHistogramIndexPatternColumn } from '../datasources/operations';
import { generateEsqlQuery } from './generate_esql_query';
import { createCoreSetupMock } from '@kbn/core-lifecycle-browser-mocks/src/core_setup.mock';
import { defaultUiSettingsGet } from './__mocks__/ui_settings';
import {
  mockLayer,
  mockIndexPattern,
  mockIndexPatternWithoutTimeField,
  mockDateRange,
} from './__mocks__/esql_query_mocks';

describe('generateEsqlQuery', () => {
  const { uiSettings } = createCoreSetupMock();
  uiSettings.get.mockImplementation((key: string) => {
    return defaultUiSettingsGet(key);
  });

  it('should produce valid esql for date histogram and count', () => {
    const result = generateEsqlQuery(
      [
        [
          '1',
          {
            operationType: 'date_histogram',
            sourceField: 'order_date',
            label: 'Date histogram',
            dataType: 'date',
            isBucketed: true,
            interval: 'auto',
          },
        ],
        [
          '2',
          {
            operationType: 'count',
            sourceField: 'records',
            label: 'Count',
            dataType: 'number',
            isBucketed: false,
          },
        ],
      ],
      mockLayer,
      mockIndexPattern,
      uiSettings,
      mockDateRange,
      new Date()
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.esql).toBe(
        'FROM myIndexPattern | WHERE order_date >= ?_tstart AND order_date <= ?_tend | STATS COUNT(*) BY order_date = BUCKET(order_date, 75, ?_tstart, ?_tend)'
      );
    }
  });

  it('should return failure with include_empty_rows_not_supported reason if missing row option is set', () => {
    const result = generateEsqlQuery(
      [
        [
          '1',
          {
            operationType: 'date_histogram',
            sourceField: 'order_date',
            label: 'Date histogram',
            dataType: 'date',
            isBucketed: true,
            params: { includeEmptyRows: true },
          } as DateHistogramIndexPatternColumn,
        ],
        [
          '2',
          {
            operationType: 'count',
            sourceField: 'records',
            label: 'Count',
            dataType: 'number',
            isBucketed: false,
          },
        ],
      ],
      mockLayer,
      mockIndexPattern,
      uiSettings,
      mockDateRange,
      new Date()
    );

    expect(result).toEqual({
      success: false,
      reason: 'include_empty_rows_not_supported',
    });
  });

  it('should return failure with drop_partials_not_supported reason if drop partial intervals is set', () => {
    const result = generateEsqlQuery(
      [
        [
          '1',
          {
            operationType: 'date_histogram',
            sourceField: 'order_date',
            label: 'Date histogram',
            dataType: 'date',
            isBucketed: true,
            params: { interval: 'auto', dropPartials: true },
          } as DateHistogramIndexPatternColumn,
        ],
        [
          '2',
          {
            operationType: 'count',
            sourceField: 'records',
            label: 'Count',
            dataType: 'number',
            isBucketed: false,
          },
        ],
      ],
      mockLayer,
      mockIndexPattern,
      uiSettings,
      mockDateRange,
      new Date()
    );

    expect(result).toEqual({
      success: false,
      reason: 'drop_partials_not_supported',
    });
  });

  it('should return failure with formula_not_supported reason if lens formula is used', () => {
    const result = generateEsqlQuery(
      [
        [
          '1',
          {
            operationType: 'formula',
            label: 'Formula',
            isBucketed: false,
            params: {},
            dataType: 'number',
          },
        ],
      ],
      mockLayer,
      mockIndexPattern,
      uiSettings,
      mockDateRange,
      new Date()
    );

    expect(result).toEqual({
      success: false,
      reason: 'formula_not_supported',
    });
  });

  test('it should add a where condition to esql if timeField is set', () => {
    const result = generateEsqlQuery(
      [
        [
          '1',
          {
            operationType: 'date_histogram',
            sourceField: 'order_date',
            label: 'Date histogram',
            dataType: 'date',
            isBucketed: true,
            interval: 'auto',
          },
        ],
        [
          '2',
          {
            operationType: 'count',
            sourceField: 'records',
            label: 'Count',
            dataType: 'number',
            isBucketed: false,
          },
        ],
      ],
      mockLayer,
      mockIndexPattern,
      uiSettings,
      mockDateRange,
      new Date()
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.esql).toBe(
        'FROM myIndexPattern | WHERE order_date >= ?_tstart AND order_date <= ?_tend | STATS COUNT(*) BY order_date = BUCKET(order_date, 75, ?_tstart, ?_tend)'
      );
    }
  });

  it('should not add a where condition to esql if timeField is not set', () => {
    const result = generateEsqlQuery(
      [
        [
          '1',
          {
            operationType: 'date_histogram',
            sourceField: 'order_date',
            label: 'Date histogram',
            dataType: 'date',
            isBucketed: true,
            interval: 'auto',
          },
        ],
        [
          '2',
          {
            operationType: 'count',
            sourceField: 'records',
            label: 'Count',
            dataType: 'number',
            isBucketed: false,
          },
        ],
      ],
      mockLayer,
      mockIndexPatternWithoutTimeField,
      uiSettings,
      mockDateRange,
      new Date()
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.esql).toBe(
        'FROM myIndexPattern | STATS COUNT(*) BY order_date = BUCKET(order_date, 75, ?_tstart, ?_tend)'
      );
    }
  });

  it('should preserve user-configured format (e.g., currency) in esAggsIdMap', () => {
    uiSettings.get.mockImplementation((key: string) => {
      return defaultUiSettingsGet(key);
    });

    const result = generateEsqlQuery(
      [
        [
          '1',
          {
            operationType: 'date_histogram',
            sourceField: 'order_date',
            label: 'Date histogram',
            dataType: 'date',
            isBucketed: true,
            interval: 'auto',
          },
        ],
        [
          '2',
          {
            operationType: 'sum',
            sourceField: 'price',
            label: 'Sum of price',
            dataType: 'number',
            isBucketed: false,
            params: {
              format: {
                id: 'currency',
                params: {
                  decimals: 2,
                  pattern: '$0,0.00',
                },
              },
            },
          },
        ],
      ],
      mockLayer,
      mockIndexPattern,
      uiSettings,
      mockDateRange,
      new Date()
    );

    expect(result.success).toBe(true);
    if (result.success) {
      const metricKey = 'SUM(price)';
      expect(result.esAggsIdMap).toHaveProperty(metricKey);
      const metricColumn = result.esAggsIdMap[metricKey][0];
      expect(metricColumn.format).toEqual({
        id: 'currency',
        params: {
          decimals: 2,
          pattern: '$0,0.00',
        },
      });
    }
  });

  it('should preserve user-configured bytes format in esAggsIdMap', () => {
    uiSettings.get.mockImplementation((key: string) => {
      return defaultUiSettingsGet(key);
    });

    const result = generateEsqlQuery(
      [
        [
          '1',
          {
            operationType: 'date_histogram',
            sourceField: 'order_date',
            label: 'Date histogram',
            dataType: 'date',
            isBucketed: true,
            interval: 'auto',
          },
        ],
        [
          '2',
          {
            operationType: 'average',
            sourceField: 'bytes',
            label: 'Average bytes',
            dataType: 'number',
            isBucketed: false,
            params: {
              format: {
                id: 'bytes',
                params: {
                  decimals: 2,
                },
              },
            },
          },
        ],
      ],
      mockLayer,
      mockIndexPattern,
      uiSettings,
      mockDateRange,
      new Date()
    );

    expect(result.success).toBe(true);
    if (result.success) {
      const metricKey = 'AVG(bytes)';
      expect(result.esAggsIdMap).toHaveProperty(metricKey);
      const metricColumn = result.esAggsIdMap[metricKey][0];
      expect(metricColumn.format).toEqual({
        id: 'bytes',
        params: {
          decimals: 2,
        },
      });
    }
  });

  it('should work with custom filters on the layer', () => {
    const result = generateEsqlQuery(
      [
        [
          '1',
          {
            operationType: 'date_histogram',
            sourceField: 'order_date',
            label: 'Date histogram',
            dataType: 'date',
            isBucketed: true,
            interval: 'auto',
          },
        ],
        [
          '2',
          {
            operationType: 'count',
            sourceField: 'records',
            label: 'Count',
            dataType: 'number',
            isBucketed: false,
            filter: {
              query: 'geo.src:"US"',
              language: 'kuery',
            },
          },
        ],
      ],
      mockLayer,
      mockIndexPattern,
      uiSettings,
      mockDateRange,
      new Date()
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.esql).toBe(
        // eslint-disable-next-line prettier/prettier
          'FROM myIndexPattern | WHERE order_date >= ?_tstart AND order_date <= ?_tend | STATS COUNT(*) WHERE KQL(\"geo.src:\\\"US\\\"\") BY order_date = BUCKET(order_date, 75, ?_tstart, ?_tend)'
      );
    }
  });
});
