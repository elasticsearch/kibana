/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { fromCumulativeSumAPItoLensState, fromCumulativeSumLensStateToAPI } from './cumulative_sum';
import type { CumulativeSumIndexPatternColumn } from '@kbn/lens-common';
import type {
  LensApiCountMetricOperation,
  LensApiCumulativeSumOperation,
  LensApiSumMetricOperation,
} from '../../schema/metric_ops';

describe('Cumulative Sum Transforms', () => {
  const columnRef: LensApiSumMetricOperation = {
    operation: 'sum',
    field: 'sales',
    label: 'Sum of sales',
    empty_as_null: false,
  };

  describe('fromCumulativeSumAPItoLensState', () => {
    it('should transform basic cumulative sum configuration', () => {
      const input: LensApiCumulativeSumOperation = {
        operation: 'cumulative_sum',
        field: 'sales',
      };

      const expected: CumulativeSumIndexPatternColumn = {
        operationType: 'cumulative_sum',
        references: [],
        label: '',
        customLabel: false,
        isBucketed: false,
        dataType: 'number',
        params: {},
      };

      expect(fromCumulativeSumAPItoLensState(input)).toEqual(expected);
    });

    it('should handle format configuration', () => {
      const input: LensApiCumulativeSumOperation = {
        operation: 'cumulative_sum',
        field: 'sales',
        format: {
          type: 'number',
          decimals: 2,
          compact: false,
        },
      };

      const result = fromCumulativeSumAPItoLensState(input);
      expect(result.params?.format).toEqual({
        id: 'number',
        params: {
          decimals: 2,
          compact: false,
        },
      });
    });

    it('should handle custom label', () => {
      const input: LensApiCumulativeSumOperation = {
        operation: 'cumulative_sum',
        field: 'sales',
        label: 'Running Total',
      };

      const result = fromCumulativeSumAPItoLensState(input);
      expect(result.label).toBe('Running Total');
      expect(result.customLabel).toBe(true);
    });
  });

  describe('fromCumulativeSumLensStateToAPI', () => {
    it('should transform basic cumulative sum configuration', () => {
      const input: CumulativeSumIndexPatternColumn = {
        operationType: 'cumulative_sum',
        references: ['col1'],
        label: 'Cumulative sum of sales',
        customLabel: false,
        isBucketed: false,
        dataType: 'number',
        params: {},
      };

      const expected: LensApiCumulativeSumOperation = {
        operation: 'cumulative_sum',
        field: 'sales',
      };

      expect(fromCumulativeSumLensStateToAPI(input, columnRef)).toEqual(expected);
    });

    it('should handle format configuration', () => {
      const input: CumulativeSumIndexPatternColumn = {
        operationType: 'cumulative_sum',
        references: ['col1'],
        label: 'Cumulative sum of sales',
        customLabel: false,
        isBucketed: false,
        dataType: 'number',
        params: {
          format: {
            id: 'number',
            params: {
              decimals: 2,
            },
          },
        },
      };

      const result = fromCumulativeSumLensStateToAPI(input, columnRef);
      expect(result.format).toEqual({
        type: 'number',
        decimals: 2,
      });
    });

    it('should handle custom label', () => {
      const input: CumulativeSumIndexPatternColumn = {
        operationType: 'cumulative_sum',
        references: ['col1'],
        label: 'Running Total',
        customLabel: true,
        isBucketed: false,
        dataType: 'number',
        params: {},
      };

      const result = fromCumulativeSumLensStateToAPI(input, columnRef);
      expect(result.label).toBe('Running Total');
    });

    it('should transform cumulative sum of count of records', () => {
      const countRef: LensApiCountMetricOperation = {
        operation: 'count',
        empty_as_null: false,
      };
      const input: CumulativeSumIndexPatternColumn = {
        operationType: 'cumulative_sum',
        references: ['col1'],
        label: 'Cumulative sum of count',
        customLabel: false,
        isBucketed: false,
        dataType: 'number',
        params: {},
      };

      expect(fromCumulativeSumLensStateToAPI(input, countRef)).toEqual({
        operation: 'cumulative_sum',
      });
    });
  });
});
