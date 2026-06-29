/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import * as observabilitySharedPublic from '@kbn/observability-shared-plugin/public';
import { useExternalMonitor } from './use_external_monitor';
import { SYNTHETICS_INDEX_PATTERN } from '../../../../../../common/constants';
import { ConfigKey } from '../../../../../../common/runtime_types';

jest.mock('@kbn/observability-shared-plugin/public', () => ({
  useEsSearch: jest.fn().mockReturnValue({ data: undefined, loading: false, error: undefined }),
}));

jest.mock('../../../contexts', () => ({
  useSyntheticsRefreshContext: () => ({ lastRefresh: 0 }),
}));

const useEsSearchMock = observabilitySharedPublic.useEsSearch as jest.Mock;

describe('useExternalMonitor', () => {
  afterEach(() => jest.clearAllMocks());

  describe('query construction', () => {
    it('uses an empty index when neither remoteName nor origin is provided so useEsSearch short-circuits', () => {
      renderHook(() => useExternalMonitor({ configId: 'config-1' }));

      expect(useEsSearchMock).toHaveBeenCalledWith(
        expect.objectContaining({ index: '' }),
        expect.arrayContaining(['config-1', undefined]),
        expect.any(Object)
      );
    });

    it('uses a CCS index pattern when remoteName is provided', () => {
      renderHook(() => useExternalMonitor({ configId: 'config-1', remoteName: 'remote-a' }));

      expect(useEsSearchMock).toHaveBeenCalledWith(
        expect.objectContaining({ index: `remote-a:${SYNTHETICS_INDEX_PATTERN}` }),
        expect.arrayContaining(['config-1', 'remote-a']),
        expect.any(Object)
      );
    });

    it('uses the local index pattern when origin is heartbeat (no remoteName)', () => {
      renderHook(() => useExternalMonitor({ configId: 'config-1', origin: 'heartbeat' }));

      expect(useEsSearchMock).toHaveBeenCalledWith(
        expect.objectContaining({ index: SYNTHETICS_INDEX_PATTERN }),
        expect.arrayContaining(['config-1', undefined, 'heartbeat']),
        expect.any(Object)
      );
    });

    it('filters by config_id, sorts by @timestamp desc, and aggregates locations by observer.name', () => {
      renderHook(() => useExternalMonitor({ configId: 'config-xyz', remoteName: 'remote-a' }));

      const params = useEsSearchMock.mock.calls[0][0];
      expect(params.query.bool.filter).toEqual([{ term: { config_id: 'config-xyz' } }]);
      expect(params.sort).toEqual([{ '@timestamp': 'desc' }]);
      // observer.name is the location id; observer.geo.name is wildcard-typed
      // so the label is resolved via a terms sub-agg
      expect(params.aggs.locations.terms.field).toBe('observer.name');
      expect(params.aggs.locations.aggs.label.terms).toEqual({
        field: 'observer.geo.name',
        size: 1,
      });
    });

    it('filters heartbeat monitors by monitor.id (their pings carry no config_id)', () => {
      renderHook(() => useExternalMonitor({ configId: 'k8s-monitor', origin: 'heartbeat' }));

      const params = useEsSearchMock.mock.calls[0][0];
      expect(params.query.bool.filter).toEqual([{ term: { 'monitor.id': 'k8s-monitor' } }]);
    });
  });

  describe('result synthesis', () => {
    it('returns undefined data when neither remoteName nor origin is provided (hook short-circuits)', () => {
      const { result } = renderHook(() => useExternalMonitor({ configId: 'config-1' }));

      expect(result.current.data).toBeUndefined();
      expect(result.current.loading).toBe(false);
    });

    it('returns undefined data when the query returns no hits (monitor dormant or missing)', () => {
      useEsSearchMock.mockReturnValue({
        data: { hits: { hits: [] }, aggregations: undefined },
        loading: false,
        error: undefined,
      });

      const { result } = renderHook(() =>
        useExternalMonitor({ configId: 'config-1', remoteName: 'remote-a' })
      );

      expect(result.current.data).toBeUndefined();
      expect(result.current.error).toBeUndefined();
    });

    it('synthesizes a remote monitor from the latest ping and locations aggregation', () => {
      useEsSearchMock.mockReturnValue({
        data: {
          hits: {
            hits: [
              {
                _source: {
                  monitor: { id: 'query-id-7', name: 'Frontend health', type: 'browser' },
                  tags: ['team:edge', 'env:prod'],
                  remote: { remoteName: 'remote-a', kibanaUrl: 'https://kibana.remote-a' },
                },
              },
            ],
          },
          aggregations: {
            locations: {
              buckets: [
                {
                  key: 'us-east',
                  doc_count: 12,
                  label: { buckets: [{ key: 'US East', doc_count: 12 }] },
                },
                {
                  key: 'eu-west',
                  doc_count: 8,
                  label: { buckets: [{ key: 'EU West', doc_count: 8 }] },
                },
              ],
            },
          },
        },
        loading: false,
        error: undefined,
      });

      const { result } = renderHook(() =>
        useExternalMonitor({ configId: 'config-abc', remoteName: 'remote-a' })
      );

      expect(result.current.data).toEqual({
        [ConfigKey.CONFIG_ID]: 'config-abc',
        [ConfigKey.MONITOR_QUERY_ID]: 'query-id-7',
        [ConfigKey.NAME]: 'Frontend health',
        [ConfigKey.MONITOR_TYPE]: 'browser',
        [ConfigKey.TAGS]: ['team:edge', 'env:prod'],
        [ConfigKey.LOCATIONS]: [
          { id: 'us-east', label: 'US East' },
          { id: 'eu-west', label: 'EU West' },
        ],
        remote: { remoteName: 'remote-a', kibanaUrl: 'https://kibana.remote-a' },
      });
    });

    it('synthesizes a heartbeat monitor (origin discriminant, no remote field) from local pings', () => {
      useEsSearchMock.mockReturnValue({
        data: {
          hits: {
            hits: [
              {
                _source: {
                  monitor: { id: 'k8s-monitor', name: 'Autodiscovered HTTP', type: 'http' },
                  tags: ['k8s'],
                },
              },
            ],
          },
          aggregations: {
            locations: {
              buckets: [{ key: 'agent-1', doc_count: 3, label: { buckets: [] } }],
            },
          },
        },
        loading: false,
        error: undefined,
      });

      const { result } = renderHook(() =>
        useExternalMonitor({ configId: 'k8s-monitor', origin: 'heartbeat' })
      );

      expect(result.current.data).toEqual({
        [ConfigKey.CONFIG_ID]: 'k8s-monitor',
        [ConfigKey.MONITOR_QUERY_ID]: 'k8s-monitor',
        [ConfigKey.NAME]: 'Autodiscovered HTTP',
        [ConfigKey.MONITOR_TYPE]: 'http',
        [ConfigKey.TAGS]: ['k8s'],
        [ConfigKey.LOCATIONS]: [{ id: 'agent-1', label: 'agent-1' }],
        origin: 'heartbeat',
      });
      // heartbeat monitors never carry a `remote` field
      expect(result.current.data).not.toHaveProperty('remote');
    });

    it('falls back to configId for MONITOR_QUERY_ID when the ping omits monitor.id', () => {
      useEsSearchMock.mockReturnValue({
        data: {
          hits: {
            hits: [{ _source: { monitor: { name: 'No-id ping', type: 'http' }, tags: [] } }],
          },
          aggregations: { locations: { buckets: [] } },
        },
        loading: false,
        error: undefined,
      });

      const { result } = renderHook(() =>
        useExternalMonitor({ configId: 'config-fallback', remoteName: 'remote-a' })
      );

      expect(result.current.data?.[ConfigKey.MONITOR_QUERY_ID]).toBe('config-fallback');
    });

    it('omits kibanaUrl when the ping does not carry one', () => {
      useEsSearchMock.mockReturnValue({
        data: {
          hits: {
            hits: [{ _source: { monitor: { id: 'x', name: 'n', type: 'http' }, tags: [] } }],
          },
          aggregations: { locations: { buckets: [] } },
        },
        loading: false,
        error: undefined,
      });

      const { result } = renderHook(() =>
        useExternalMonitor({ configId: 'config-1', remoteName: 'remote-a' })
      );

      expect(result.current.data).toMatchObject({ remote: { remoteName: 'remote-a' } });
    });

    it('reports loading while enabled until a result arrives (covers the enable transition)', () => {
      // `useFetcher` reports loading:false for the render where the query just
      // became enabled; the hook must still signal loading so the detail page
      // does not flash "monitor not found" before the probe runs.
      useEsSearchMock.mockReturnValue({ data: undefined, loading: false, error: undefined });

      const { result } = renderHook(() =>
        useExternalMonitor({ configId: 'k8s-monitor', origin: 'heartbeat' })
      );

      expect(result.current.loading).toBe(true);
      expect(result.current.data).toBeUndefined();
    });

    it('stops loading once the query returns a (possibly empty) response', () => {
      useEsSearchMock.mockReturnValue({
        data: { hits: { hits: [] } },
        loading: false,
        error: undefined,
      });

      const { result } = renderHook(() =>
        useExternalMonitor({ configId: 'k8s-monitor', origin: 'heartbeat' })
      );

      expect(result.current.loading).toBe(false);
      expect(result.current.data).toBeUndefined();
    });

    it('propagates loading state from useEsSearch', () => {
      useEsSearchMock.mockReturnValue({
        data: undefined,
        loading: true,
        error: undefined,
      });

      const { result } = renderHook(() =>
        useExternalMonitor({ configId: 'config-1', remoteName: 'remote-a' })
      );

      expect(result.current.loading).toBe(true);
      expect(result.current.data).toBeUndefined();
    });

    it('propagates error state from useEsSearch', () => {
      const boom = new Error('no_such_remote_cluster_exception');
      useEsSearchMock.mockReturnValue({
        data: undefined,
        loading: false,
        error: boom,
      });

      const { result } = renderHook(() =>
        useExternalMonitor({ configId: 'config-1', remoteName: 'remote-a' })
      );

      expect(result.current.error).toBe(boom);
      expect(result.current.data).toBeUndefined();
    });

    it('uses the bucket key as the location label when the sub-aggregation has no observer.geo.name', () => {
      useEsSearchMock.mockReturnValue({
        data: {
          hits: {
            hits: [{ _source: { monitor: { id: 'x', name: 'n', type: 'http' }, tags: [] } }],
          },
          aggregations: {
            locations: {
              buckets: [{ key: 'orphaned-location', doc_count: 1, label: { buckets: [] } }],
            },
          },
        },
        loading: false,
        error: undefined,
      });

      const { result } = renderHook(() =>
        useExternalMonitor({ configId: 'config-1', remoteName: 'remote-a' })
      );

      expect(result.current.data?.[ConfigKey.LOCATIONS]).toEqual([
        { id: 'orphaned-location', label: 'orphaned-location' },
      ]);
    });
  });
});
