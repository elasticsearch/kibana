/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { LocatorPublic } from '@kbn/share-plugin/public';
import type { SerializableRecord } from '@kbn/utility-types';
import type { AssetDetailsLocator } from '@kbn/observability-shared-plugin/common';
import { getPodMetricsLink } from './pod_metrics_utils';

const infraMetricsQuery = {
  from: '2020-02-06T10:55:00.000Z',
  to: '2020-02-06T11:05:00.000Z',
};

const createDiscoverLocator = () =>
  ({
    getRedirectUrl: jest.fn((params: { query?: { esql?: string } }) => {
      const esql = params.query?.esql ?? '';
      return `/app/discover#/?_a=(query:(esql:'${esql}'))`;
    }),
  } as unknown as LocatorPublic<SerializableRecord>);

const createAssetDetailsLocator = () =>
  ({
    getRedirectUrl: jest.fn(
      ({ entityId, entityType }: { entityId: string; entityType: string }) =>
        `/node-mock/${entityType}/${entityId}`
    ),
  } as unknown as jest.Mocked<AssetDetailsLocator>);

describe('getPodMetricsLink', () => {
  it('returns undefined when there is no pod id', () => {
    expect(
      getPodMetricsLink({
        podId: undefined,
        agentName: 'otlp/nodejs',
        infraMetricsQuery,
        discoverLocator: createDiscoverLocator(),
      })
    ).toBeUndefined();
  });

  describe('OTel-observed K8s pods', () => {
    it('builds an ES|QL TS query against the metrics indices instead of classic KQL', () => {
      const discoverLocator = createDiscoverLocator();
      const assetDetailsLocator = createAssetDetailsLocator();

      const href = getPodMetricsLink({
        podId: '123',
        agentName: 'otlp/nodejs',
        infraMetricsQuery,
        discoverLocator,
        assetDetailsLocator,
        metricsIndices: 'metrics-*',
      });

      expect(assetDetailsLocator.getRedirectUrl).not.toHaveBeenCalled();
      expect(discoverLocator.getRedirectUrl).toHaveBeenCalledWith({
        timeRange: { from: infraMetricsQuery.from, to: infraMetricsQuery.to },
        query: { esql: 'TS metrics-* | WHERE `kubernetes.pod.uid` == "123"' },
      });
      expect(href).toContain('/app/discover');
      expect(href).toContain('TS metrics-*');
      expect(href).toContain('kubernetes.pod.uid');
    });

    it('uses the provided metrics indices in the TS source command', () => {
      const discoverLocator = createDiscoverLocator();

      getPodMetricsLink({
        podId: 'abc',
        agentName: 'otlp/java',
        infraMetricsQuery,
        discoverLocator,
        metricsIndices: 'custom-metrics-*',
      });

      expect(discoverLocator.getRedirectUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          query: { esql: 'TS custom-metrics-* | WHERE `kubernetes.pod.uid` == "abc"' },
        })
      );
    });

    it('falls back to the default metrics indices when none are provided', () => {
      const discoverLocator = createDiscoverLocator();

      getPodMetricsLink({
        podId: 'abc',
        agentName: 'otlp/java',
        infraMetricsQuery,
        discoverLocator,
      });

      expect(discoverLocator.getRedirectUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          query: { esql: 'TS metrics-* | WHERE `kubernetes.pod.uid` == "abc"' },
        })
      );
    });

    it('returns undefined when no discover locator is available', () => {
      expect(
        getPodMetricsLink({
          podId: '123',
          agentName: 'otlp/nodejs',
          infraMetricsQuery,
          discoverLocator: undefined,
        })
      ).toBeUndefined();
    });
  });

  describe('non-OTel pods', () => {
    it('uses the Infra UI asset details link', () => {
      const assetDetailsLocator = createAssetDetailsLocator();
      const discoverLocator = createDiscoverLocator();

      const href = getPodMetricsLink({
        podId: '123',
        agentName: 'nodejs',
        infraMetricsQuery,
        assetDetailsLocator,
        discoverLocator,
      });

      expect(discoverLocator.getRedirectUrl).not.toHaveBeenCalled();
      expect(assetDetailsLocator.getRedirectUrl).toHaveBeenCalledWith({
        entityId: '123',
        entityType: 'pod',
        assetDetails: { dateRange: infraMetricsQuery },
      });
      expect(href).toBe('/node-mock/pod/123');
    });

    it('returns undefined when infra links are unavailable', () => {
      const assetDetailsLocator = createAssetDetailsLocator();

      expect(
        getPodMetricsLink({
          podId: '123',
          agentName: 'nodejs',
          infraMetricsQuery,
          assetDetailsLocator,
          infraLinksAvailable: false,
        })
      ).toBeUndefined();
    });
  });
});
