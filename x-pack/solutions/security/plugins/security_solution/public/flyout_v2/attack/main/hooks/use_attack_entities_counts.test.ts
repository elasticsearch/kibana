/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import { useAttackEntitiesCounts } from './use_attack_entities_counts';
import { useQueryAlerts } from '../../../../detections/containers/detection_engine/alerts/use_query';

jest.mock('../../../../detections/containers/detection_engine/alerts/use_query', () => ({
  useQueryAlerts: jest.fn(),
}));

describe('useAttackEntitiesCounts', () => {
  const mockUseQueryAlerts = jest.mocked(useQueryAlerts);

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseQueryAlerts.mockReturnValue({
      loading: false,
      data: null,
      setQuery: jest.fn(),
      response: '',
      request: '',
      refetch: null,
    });
  });

  it('returns zero counts and skips query when alertIds is empty', () => {
    const { result } = renderHook(() => useAttackEntitiesCounts([]));

    expect(mockUseQueryAlerts).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: true,
      })
    );
    expect(result.current.relatedUsers).toBe(0);
    expect(result.current.relatedHosts).toBe(0);
    expect(result.current.loading).toBe(false);
  });

  it('passes query with ids filter and cardinality aggs when alertIds exist', () => {
    renderHook(() => useAttackEntitiesCounts(['id1', 'id2']));

    expect(mockUseQueryAlerts).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: false,
        query: expect.objectContaining({
          query: { ids: { values: ['id1', 'id2'] } },
          size: 0,
          aggs: {
            unique_users: { cardinality: { field: 'user.name' } },
            unique_hosts: { cardinality: { field: 'host.name' } },
          },
        }),
      })
    );
  });

  it('parses relatedUsers and relatedHosts from aggregations', () => {
    mockUseQueryAlerts.mockReturnValue({
      loading: false,
      data: {
        _shards: { total: 0, successful: 0, skipped: 0, failed: 0 },
        hits: { total: { value: 0, relation: 'eq' }, max_score: null, hits: [] },
        took: 0,
        timeout: false,
        aggregations: {
          unique_users: { value: 6 },
          unique_hosts: { value: 10 },
        },
      },
      setQuery: jest.fn(),
      response: '',
      request: '',
      refetch: null,
    });

    const { result } = renderHook(() => useAttackEntitiesCounts(['id1']));

    expect(result.current.relatedUsers).toBe(6);
    expect(result.current.relatedHosts).toBe(10);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(false);
  });

  it('returns zero when aggregations are missing', () => {
    mockUseQueryAlerts.mockReturnValue({
      loading: false,
      data: {
        _shards: { total: 0, successful: 0, skipped: 0, failed: 0 },
        hits: { total: { value: 0, relation: 'eq' }, max_score: null, hits: [] },
        took: 0,
        timeout: false,
        aggregations: {},
      },
      setQuery: jest.fn(),
      response: '',
      request: '',
      refetch: null,
    });

    const { result } = renderHook(() => useAttackEntitiesCounts(['id1']));

    expect(result.current.relatedUsers).toBe(0);
    expect(result.current.relatedHosts).toBe(0);
  });

  it('returns error true when loading is done, data is null, and alertIds are non-empty', () => {
    mockUseQueryAlerts.mockReturnValue({
      loading: false,
      data: null,
      setQuery: jest.fn(),
      response: '',
      request: '',
      refetch: null,
    });

    const { result } = renderHook(() => useAttackEntitiesCounts(['id1']));

    expect(result.current.error).toBe(true);
  });
});
