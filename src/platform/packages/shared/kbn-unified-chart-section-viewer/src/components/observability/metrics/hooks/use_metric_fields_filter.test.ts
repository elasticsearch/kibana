/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { renderHook } from '@testing-library/react';
import { ES_FIELD_TYPES } from '@kbn/field-types';
import { useMetricFieldsFilter } from './use_metric_fields_filter';
import type { ParsedMetricItem } from '../../../../types';

describe('useMetricFieldsFilter', () => {
  const baseDimensions = [{ name: 'host.name' }, { name: 'service.name' }];

  const baseMetricItems: ParsedMetricItem[] = [
    {
      metricName: 'system.cpu.utilization',
      indexName: 'metrics-*',
      units: ['ms'],
      metricTypes: ['counter'],
      fieldTypes: [ES_FIELD_TYPES.DOUBLE],
      dimensionFields: baseDimensions,
    },
    {
      metricName: 'system.memory.utilization',
      indexName: 'metrics-*',
      units: ['ms'],
      metricTypes: ['counter'],
      fieldTypes: [ES_FIELD_TYPES.DOUBLE],
      dimensionFields: baseDimensions,
    },
  ];

  const defaultParams = {
    metricItems: baseMetricItems,
    searchTerm: '',
    dimensions: [] as string[],
  };

  describe('when no filters are applied', () => {
    it('returns all metric items', () => {
      const { result } = renderHook(() => useMetricFieldsFilter(defaultParams));

      expect(result.current.filteredMetricItems).toEqual(baseMetricItems);
    });
  });

  describe('search term filtering', () => {
    it('filters fields by search term (case-insensitive)', () => {
      const { result } = renderHook(() =>
        useMetricFieldsFilter({
          ...defaultParams,
          searchTerm: 'cpu',
        })
      );

      expect(result.current.filteredMetricItems).toHaveLength(1);
      expect(result.current.filteredMetricItems[0].metricName).toBe('system.cpu.utilization');
    });

    it('filters fields by uppercase search term', () => {
      const { result } = renderHook(() =>
        useMetricFieldsFilter({
          ...defaultParams,
          searchTerm: 'CPU',
        })
      );

      expect(result.current.filteredMetricItems).toHaveLength(1);
      expect(result.current.filteredMetricItems[0].metricName).toBe('system.cpu.utilization');
    });

    it('returns multiple matches for partial search term', () => {
      const { result } = renderHook(() =>
        useMetricFieldsFilter({
          ...defaultParams,
          searchTerm: '.u',
        })
      );

      expect(result.current.filteredMetricItems).toHaveLength(2);
      expect(result.current.filteredMetricItems.map((f) => f.metricName)).toEqual([
        'system.cpu.utilization',
        'system.memory.utilization',
      ]);
    });

    it('returns empty array when no fields match search term', () => {
      const { result } = renderHook(() =>
        useMetricFieldsFilter({
          ...defaultParams,
          searchTerm: 'nonexistent',
        })
      );

      expect(result.current.filteredMetricItems).toEqual([]);
    });

    it('filters by space-separated non-contiguous terms', () => {
      const { result } = renderHook(() =>
        useMetricFieldsFilter({
          ...defaultParams,
          searchTerm: 'system util',
        })
      );

      expect(result.current.filteredMetricItems).toHaveLength(2);
      expect(result.current.filteredMetricItems.map((f) => f.metricName)).toEqual([
        'system.cpu.utilization',
        'system.memory.utilization',
      ]);
    });

    it('filters by wildcard pattern', () => {
      const { result } = renderHook(() =>
        useMetricFieldsFilter({
          ...defaultParams,
          searchTerm: 'system.cpu*',
        })
      );

      expect(result.current.filteredMetricItems).toHaveLength(1);
      expect(result.current.filteredMetricItems[0].metricName).toBe('system.cpu.utilization');
    });

    it('filters with typo tolerance', () => {
      const { result } = renderHook(() =>
        useMetricFieldsFilter({
          ...defaultParams,
          searchTerm: 'utilizaton',
        })
      );

      expect(result.current.filteredMetricItems).toHaveLength(2);
      expect(result.current.filteredMetricItems.map((f) => f.metricName)).toEqual([
        'system.cpu.utilization',
        'system.memory.utilization',
      ]);
    });
  });
});
