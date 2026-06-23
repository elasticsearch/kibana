/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { LENS_EMPTY_AS_NULL_DEFAULT_VALUE } from '../transforms/columns/utils';
import {
  LENS_LAST_VALUE_DEFAULT_MULTI_VALUE,
  LENS_MOVING_AVERAGE_DEFAULT_WINDOW,
  LENS_PERCENTILE_DEFAULT_VALUE,
  LENS_PERCENTILE_RANK_DEFAULT_VALUE,
} from './constants';
import {
  metricOperationDefinitionSchema,
  staticOperationDefinitionSchema,
  formulaOperationDefinitionSchema,
  countMetricOperationSchema,
  uniqueCountMetricOperationSchema,
  metricOperationSchema,
  lastValueOperationSchema,
  percentileOperationSchema,
  percentileRanksOperationSchema,
  differencesOperationSchema,
  movingAverageOperationSchema,
  cumulativeSumOperationSchema,
  counterRateOperationSchema,
  esqlColumnSchema,
} from './metric_ops';

describe('Metric Operations Schemas', () => {
  describe('columnValueOperationSchema', () => {
    it('validates a valid metric operation configuration', () => {
      const input = {
        column: 'sum' as const,
      };

      const validated = esqlColumnSchema.validate(input);
      expect(validated).toEqual(input);
    });
  });

  describe('staticOperationDefinition', () => {
    it('validates a valid static value configuration', () => {
      const input = {
        operation: 'static_value' as const,
        value: 42,
        label: 'Static Value',
      };

      const validated = staticOperationDefinitionSchema.validate(input);
      expect(validated).toEqual(input);
    });
  });

  describe('formulaOperationDefinition', () => {
    it('validates a valid formula configuration', () => {
      const input = {
        operation: 'formula' as const,
        formula: 'count(col1) / sum(col2)',
        label: 'Custom Formula',
      };

      const validated = formulaOperationDefinitionSchema.validate(input);
      expect(validated).toEqual(input);
    });

    it('throws on missing formula', () => {
      const input = {
        operation: 'formula' as const,
      };

      expect(() => formulaOperationDefinitionSchema.validate(input)).toThrow();
    });
  });

  describe('fieldBasedOperations', () => {
    it('validates count metric operation', () => {
      const input = {
        operation: 'count' as const,
        field: 'my_field',
        empty_as_null: true,
        time_scale: 's' as const,
        filter: {
          language: 'kql' as const,
          expression: 'status:active',
        },
      };

      const validated = countMetricOperationSchema.validate(input);
      expect(validated).toEqual(input);
    });

    it('validates unique count metric operation', () => {
      const input = {
        operation: 'unique_count' as const,
        field: 'user_id',
        empty_as_null: true,
      };

      const validated = uniqueCountMetricOperationSchema.validate(input);
      expect(validated).toEqual(input);
    });

    it('validates basic metric operations', () => {
      const operations = ['min', 'max', 'average', 'median', 'standard_deviation'] as const;

      operations.forEach((op) => {
        const input = {
          operation: op,
          field: 'price',
          time_scale: 'h' as const,
        };

        const validated = metricOperationSchema.validate(input);
        expect(validated).toEqual(input);
      });
    });
  });

  describe('advanced metric operations', () => {
    it('validates percentile operation', () => {
      const input = {
        operation: 'percentile' as const,
        field: 'response_time',
        percentile: 95,
      };

      const validated = percentileOperationSchema.validate(input);
      expect(validated).toEqual(input);
    });

    it('validates percentile operation with default value', () => {
      const input = {
        operation: 'percentile' as const,
        field: 'response_time',
        percentile: undefined,
      };

      const validated = percentileOperationSchema.validate(input);
      expect(validated).toEqual({ ...input, percentile: LENS_PERCENTILE_DEFAULT_VALUE });
    });

    it('validates percentile operation without percentile', () => {
      const input = {
        operation: 'percentile' as const,
        field: 'response_time',
      };

      const validated = percentileOperationSchema.validate(input);
      expect(validated).toEqual({ ...input, percentile: LENS_PERCENTILE_DEFAULT_VALUE });
    });

    it('validates percentile ranks operation', () => {
      const input = {
        operation: 'percentile_rank' as const,
        field: 'response_time',
        rank: 50,
      };

      const validated = percentileRanksOperationSchema.validate(input);
      expect(validated).toEqual(input);
    });

    it('should use percentile rank without rank', () => {
      const input = {
        operation: 'percentile_rank' as const,
        field: 'response_time',
      };

      const validated = percentileRanksOperationSchema.validate(input);
      expect(validated).toEqual({ ...input, rank: LENS_PERCENTILE_RANK_DEFAULT_VALUE });
    });

    it('should use percentile rank pass ', () => {
      const input = {
        operation: 'percentile_rank' as const,
        field: 'response_time',
        rank: undefined,
      };

      const validated = percentileRanksOperationSchema.validate(input);
      expect(validated).toEqual({ ...input, rank: LENS_PERCENTILE_RANK_DEFAULT_VALUE });
    });

    it('validates differences operation', () => {
      const input = {
        operation: 'differences' as const,
        of: {
          operation: 'sum' as const,
          field: 'value',
          empty_as_null: LENS_EMPTY_AS_NULL_DEFAULT_VALUE,
        },
      };

      const validated = differencesOperationSchema.validate(input);
      expect(validated).toEqual(input);
    });

    it('validates moving average operation', () => {
      const input = {
        operation: 'moving_average' as const,
        of: {
          operation: 'sum' as const,
          field: 'value',
          empty_as_null: LENS_EMPTY_AS_NULL_DEFAULT_VALUE,
        },
        window: 7,
      };

      const validated = movingAverageOperationSchema.validate(input);
      expect(validated).toEqual(input);
    });

    it('validates moving average operation without window param', () => {
      const input = {
        operation: 'moving_average' as const,
        of: {
          operation: 'sum' as const,
          field: 'value',
          empty_as_null: LENS_EMPTY_AS_NULL_DEFAULT_VALUE,
        },
      };

      const validated = movingAverageOperationSchema.validate(input);
      expect(validated).toEqual({ ...input, window: LENS_MOVING_AVERAGE_DEFAULT_WINDOW });
    });

    it('validates moving average operation with undefined window param', () => {
      const input = {
        operation: 'moving_average' as const,
        of: {
          operation: 'sum' as const,
          field: 'value',
          empty_as_null: LENS_EMPTY_AS_NULL_DEFAULT_VALUE,
        },
        window: undefined,
      };

      const validated = movingAverageOperationSchema.validate(input);
      expect(validated).toEqual({ ...input, window: LENS_MOVING_AVERAGE_DEFAULT_WINDOW });
    });
  });

  describe('time-based operations', () => {
    it('validates cumulative sum operation', () => {
      const input = {
        operation: 'cumulative_sum' as const,
        field: 'value',
      };

      const validated = cumulativeSumOperationSchema.validate(input);
      expect(validated).toEqual(input);
    });

    it('validates cumulative sum of count of records without field', () => {
      const input = {
        operation: 'cumulative_sum' as const,
      };

      const validated = cumulativeSumOperationSchema.validate(input);
      expect(validated).toEqual(input);
    });

    it('validates counter rate operation', () => {
      const input = {
        operation: 'counter_rate' as const,
        field: 'value',
      };

      const validated = counterRateOperationSchema.validate(input);
      expect(validated).toEqual(input);
    });

    it('validates last value operation', () => {
      const input = {
        operation: 'last_value' as const,
        field: 'status',
        time_field: 'timestamp',
      };

      const validated = lastValueOperationSchema.validate(input);
      expect(validated).toEqual({
        ...input,
        multi_value: LENS_LAST_VALUE_DEFAULT_MULTI_VALUE,
      });
    });

    it('validates last value operation with undefined multi_value value', () => {
      const input = {
        operation: 'last_value' as const,
        field: 'status',
        time_field: 'timestamp',
        multi_value: undefined,
      };

      const validated = lastValueOperationSchema.validate(input);
      expect(validated).toEqual({
        ...input,
        multi_value: LENS_LAST_VALUE_DEFAULT_MULTI_VALUE,
      });
    });
  });

  describe('metricOperationDefinition', () => {
    it('validates all operation types', () => {
      const operations = [
        {
          operation: 'formula' as const,
          formula: 'count(col1)',
        },
        {
          operation: 'static_value' as const,
          value: 42,
        },
        {
          operation: 'count' as const,
          field: 'my_field',
          empty_as_null: LENS_EMPTY_AS_NULL_DEFAULT_VALUE,
        },
        {
          operation: 'sum' as const,
          field: 'value',
          empty_as_null: LENS_EMPTY_AS_NULL_DEFAULT_VALUE,
        },
        {
          operation: 'percentile' as const,
          field: 'response_time',
          percentile: 95,
        },
      ];

      operations.forEach((op) => {
        const validated = metricOperationDefinitionSchema.validate(op);
        expect(validated).toEqual(op);
      });
    });

    it('throws on invalid operation type', () => {
      const input = {
        operation: 'invalid_operation' as const,
        field: 'value',
      };

      expect(() => metricOperationDefinitionSchema.validate(input)).toThrow();
    });
  });
});
