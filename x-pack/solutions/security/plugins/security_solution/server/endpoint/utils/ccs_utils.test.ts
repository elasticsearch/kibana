/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import { hasConnectedRemoteClusters, prefixIndexPatternsWithCcs, resetCcsCache } from './ccs_utils';

describe('hasConnectedRemoteClusters', () => {
  beforeEach(() => {
    resetCcsCache();
  });

  const mockEsClient = (remoteInfo: Record<string, { connected: boolean }>) =>
    ({
      cluster: {
        remoteInfo: jest.fn().mockResolvedValue(remoteInfo),
      },
    } as unknown as ElasticsearchClient);

  it('returns true when at least one remote cluster is connected', async () => {
    const esClient = mockEsClient({
      cluster_a: { connected: true },
      cluster_b: { connected: false },
    });
    expect(await hasConnectedRemoteClusters(esClient, true)).toBe(true);
  });

  it('returns false when no remote clusters are connected', async () => {
    const esClient = mockEsClient({
      cluster_a: { connected: false },
    });
    expect(await hasConnectedRemoteClusters(esClient, true)).toBe(false);
  });

  it('returns false when there are no remote clusters', async () => {
    const esClient = mockEsClient({});
    expect(await hasConnectedRemoteClusters(esClient, true)).toBe(false);
  });

  it('returns cached result without calling remoteInfo again within TTL', async () => {
    const esClient = mockEsClient({ cluster_a: { connected: true } });
    await hasConnectedRemoteClusters(esClient, true);
    await hasConnectedRemoteClusters(esClient, true);
    expect(esClient.cluster.remoteInfo).toHaveBeenCalledTimes(1);
  });

  it('returns false without calling remoteInfo when the feature flag is disabled', async () => {
    const esClient = mockEsClient({ cluster_a: { connected: true } });

    expect(await hasConnectedRemoteClusters(esClient, false)).toBe(false);
    expect(esClient.cluster.remoteInfo).not.toHaveBeenCalled();
  });

  it('returns false when remoteInfo throws', async () => {
    const esClient = {
      cluster: { remoteInfo: jest.fn().mockRejectedValue(new Error('permission denied')) },
    } as unknown as ElasticsearchClient;
    expect(await hasConnectedRemoteClusters(esClient, true)).toBe(false);
  });

  it('does not cache a transient remoteInfo failure and retries on the next call', async () => {
    const esClient = {
      cluster: {
        remoteInfo: jest
          .fn()
          .mockRejectedValueOnce(new Error('transient'))
          .mockResolvedValue({ cluster_a: { connected: true } }),
      },
    } as unknown as ElasticsearchClient;

    // first call hits the transient failure -> false, and must NOT be cached
    expect(await hasConnectedRemoteClusters(esClient, true)).toBe(false);
    // next call retries instead of serving the stale false, and sees the recovered remote
    expect(await hasConnectedRemoteClusters(esClient, true)).toBe(true);
    expect(esClient.cluster.remoteInfo).toHaveBeenCalledTimes(2);
  });
});

describe('prefixIndexPatternsWithCcs', () => {
  it('returns the original pattern unchanged when ccsEnabled is false', () => {
    expect(prefixIndexPatternsWithCcs('metrics-endpoint.metadata-*', false)).toBe(
      'metrics-endpoint.metadata-*'
    );
  });

  it('appends *: prefixed patterns when ccsEnabled is true', () => {
    expect(prefixIndexPatternsWithCcs('metrics-endpoint.metadata-*', true)).toBe(
      'metrics-endpoint.metadata-*,*:metrics-endpoint.metadata-*'
    );
  });

  it('handles comma-separated patterns', () => {
    expect(
      prefixIndexPatternsWithCcs(
        'metrics-endpoint.metadata-default,metrics-endpoint.metadata-ns1',
        true
      )
    ).toBe(
      'metrics-endpoint.metadata-default,metrics-endpoint.metadata-ns1,*:metrics-endpoint.metadata-default,*:metrics-endpoint.metadata-ns1'
    );
  });
});
