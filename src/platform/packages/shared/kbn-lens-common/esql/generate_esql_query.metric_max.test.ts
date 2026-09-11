/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import type { StaticValueIndexPatternColumn } from '../datasources/operations';
import type { GenericIndexPatternColumn } from '../datasources/types';
import { generateEsqlQuery } from './generate_esql_query';
import { createCoreSetupMock } from '@kbn/core-lifecycle-browser-mocks/src/core_setup.mock';
import { defaultUiSettingsGet } from './__mocks__/ui_settings';
import {
  mockLayer,
  mockIndexPattern,
  mockIndexPatternWithoutTimeField,
  mockDateRange,
} from './__mocks__/esql_query_mocks';

// Helper to create static_value column with proper typing
const createStaticValueColumn = (
  value: string,
  label: string
): StaticValueIndexPatternColumn & GenericIndexPatternColumn => ({
  operationType: 'static_value',
  label,
  dataType: 'number',
  isBucketed: false,
  references: [],
  params: {
    value,
  },
});

describe('generateEsqlQuery metric max (static_value)', () => {
  const { uiSettings } = createCoreSetupMock();
  uiSettings.get.mockImplementation((key: string) => {
    return defaultUiSettingsGet(key);
  });

  it('should convert static_value columns to EVAL statements', () => {
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
        ['3', createStaticValueColumn('100', 'Static value: 100')],
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
        'FROM myIndexPattern | WHERE order_date >= ?_tstart AND order_date <= ?_tend | STATS COUNT(*) BY order_date = BUCKET(order_date, 75, ?_tstart, ?_tend) | EVAL static_value = 100'
      );
      expect(result.esAggsIdMap).toHaveProperty('static_value');
      expect(result.esAggsIdMap.static_value[0].id).toBe('3');
    }
  });

  it('should handle static_value without other metrics', () => {
    const result = generateEsqlQuery(
      [['1', createStaticValueColumn('50', 'Static value: 50')]],
      mockLayer,
      mockIndexPatternWithoutTimeField,
      uiSettings,
      mockDateRange,
      new Date()
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.esql).toBe('FROM myIndexPattern | EVAL static_value = 50');
      expect(result.esAggsIdMap).toHaveProperty('static_value');
    }
  });

  it('should use semantic role name when columnRoles provided', () => {
    const result = generateEsqlQuery(
      [
        [
          '1',
          {
            operationType: 'count',
            sourceField: 'records',
            label: 'Count',
            dataType: 'number',
            isBucketed: false,
          },
        ],
        ['max-col-id', createStaticValueColumn('100', 'Static value: 100')],
      ],
      mockLayer,
      mockIndexPatternWithoutTimeField,
      uiSettings,
      mockDateRange,
      new Date(),
      { 'max-col-id': 'max_value' }
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.esql).toBe(
        'FROM myIndexPattern | STATS COUNT(*) | EVAL static_max_value = 100'
      );
      expect(result.esAggsIdMap).toHaveProperty('static_max_value');
    }
  });

  it('should use indexed names for multiple static values', () => {
    const result = generateEsqlQuery(
      [
        ['1', createStaticValueColumn('100', 'Static value: 100')],
        ['2', createStaticValueColumn('200', 'Static value: 200')],
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
        'FROM myIndexPattern | EVAL static_value_0 = 100, static_value_1 = 200'
      );
      expect(result.esAggsIdMap).toHaveProperty('static_value_0');
      expect(result.esAggsIdMap).toHaveProperty('static_value_1');
    }
  });

  it('should use columnRoles for max metric with filter to produce semantic output name and preserve label', () => {
    const result = generateEsqlQuery(
      [
        [
          '1',
          {
            operationType: 'sum',
            sourceField: 'bytes',
            label: 'Sum of bytes',
            dataType: 'number' as const,
            isBucketed: false,
          },
        ],
        [
          '2',
          {
            operationType: 'max' as const,
            sourceField: 'bytes',
            label: 'Maximum of bytes',
            dataType: 'number' as const,
            isBucketed: false,
            filter: {
              query: 'bytes > 100',
              language: 'kuery' as const,
            },
          },
        ],
      ],
      mockLayer,
      mockIndexPatternWithoutTimeField,
      uiSettings,
      mockDateRange,
      new Date(),
      { '2': 'max_value' }
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.esql).toContain('max_value = MAX(bytes) WHERE KQL');
      expect(result.esAggsIdMap).toHaveProperty('max_value');
      const maxEntry = result.esAggsIdMap.max_value[0];
      expect(maxEntry.id).toBe('2');
      expect(maxEntry.label).toBe('Maximum of bytes');
    }
  });
});
