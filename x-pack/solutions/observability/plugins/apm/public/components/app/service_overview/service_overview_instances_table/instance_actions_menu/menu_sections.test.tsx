/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getMenuSections } from './menu_sections';
import type { IBasePath } from '@kbn/core/public';
import type { LocatorPublic } from '@kbn/share-plugin/public';
import type { SerializableRecord } from '@kbn/utility-types';
import type { LogsLocatorParams } from '@kbn/logs-shared-plugin/common';
import type { AssetDetailsLocator } from '@kbn/observability-shared-plugin/common';
import type { APIReturnType } from '../../../../../services/rest/create_call_apm_api';

type InstaceDetails =
  APIReturnType<'GET /internal/apm/services/{serviceName}/service_overview_instances/details/{serviceNodeName}'>;

describe('getMenuSections', () => {
  const mockBasePath = {
    prepend: jest.fn((path: string) => `/basepath${path}`),
  } as unknown as IBasePath;

  const mockLogsLocator = {
    getRedirectUrl: jest.fn(() => 'logs-url'),
  } as unknown as LocatorPublic<LogsLocatorParams>;

  const mockAssetDetailsLocator = {
    getRedirectUrl: jest.fn(() => 'asset-details-url'),
  } as unknown as AssetDetailsLocator;

  const mockDiscoverLocator = {
    getRedirectUrl: jest.fn((params: SerializableRecord) => {
      const esql = (params.query as { esql?: string })?.esql || '';
      return `/app/discover#/?_a=(query:(esql:'${esql}'))`;
    }),
  } as unknown as LocatorPublic<SerializableRecord>;

  const mockOnFilterByInstanceClick = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns APM actions section with filter and metrics actions', () => {
    const instanceDetails: InstaceDetails = {
      '@timestamp': '2021-10-10T00:00:00.000Z',
    } as InstaceDetails;

    const sections = getMenuSections({
      instanceDetails,
      basePath: mockBasePath,
      onFilterByInstanceClick: mockOnFilterByInstanceClick,
      metricsHref: '/metrics-href',
      logsLocator: mockLogsLocator,
      assetDetailsLocator: mockAssetDetailsLocator,
      infraLinksAvailable: true,
    });

    // Should have at least the APM section
    expect(sections.length).toBeGreaterThanOrEqual(1);

    // Find the APM section (the one with filterByInstance action)
    const allActions = sections.flat().flatMap((section) => section.actions);

    // Verify Filter overview by instance action exists
    const filterByInstanceAction = allActions.find((action) => action.key === 'filterByInstance');
    expect(filterByInstanceAction?.label).toBe('Filter overview by instance');

    // Verify onClick function is called when action is triggered
    filterByInstanceAction?.onClick?.({} as any);
    expect(mockOnFilterByInstanceClick).toHaveBeenCalledTimes(1);

    // Verify Metrics action exists
    const metricsAction = allActions.find((action) => action.key === 'analyzeRuntimeMetric');
    expect(metricsAction).toBeDefined();
    expect(metricsAction?.label).toBe('Metrics');
    expect(metricsAction?.href).toBe('/metrics-href');
  });

  it('returns pod actions when pod ID is present', () => {
    const instanceDetails: InstaceDetails = {
      '@timestamp': '2021-10-10T00:00:00.000Z',
      kubernetes: {
        pod: {
          uid: 'pod-123',
        },
      },
    } as InstaceDetails;

    const sections = getMenuSections({
      instanceDetails,
      basePath: mockBasePath,
      onFilterByInstanceClick: mockOnFilterByInstanceClick,
      metricsHref: '/metrics-href',
      logsLocator: mockLogsLocator,
      assetDetailsLocator: mockAssetDetailsLocator,
      infraLinksAvailable: true,
    });

    const allActions = sections.flat().flatMap((section) => section.actions);

    // Verify Pod logs action exists
    const podLogsAction = allActions.find((action) => action.key === 'podLogs');
    expect(podLogsAction).toBeDefined();
    expect(podLogsAction?.label).toBe('Pod logs');

    // Verify Pod metrics action exists
    const podMetricsAction = allActions.find((action) => action.key === 'podMetrics');
    expect(podMetricsAction?.label).toBe('Pod metrics');
  });

  it('returns container actions when container ID is present', () => {
    const instanceDetails: InstaceDetails = {
      '@timestamp': '2021-10-10T00:00:00.000Z',
      container: {
        id: 'container-456',
      },
    } as InstaceDetails;

    const sections = getMenuSections({
      instanceDetails,
      basePath: mockBasePath,
      onFilterByInstanceClick: mockOnFilterByInstanceClick,
      metricsHref: '/metrics-href',
      logsLocator: mockLogsLocator,
      assetDetailsLocator: mockAssetDetailsLocator,
      infraLinksAvailable: true,
    });

    const allActions = sections.flat().flatMap((section) => section.actions);

    // Verify Container logs action exists
    const containerLogsAction = allActions.find((action) => action.key === 'containerLogs');
    expect(containerLogsAction).toBeDefined();
    expect(containerLogsAction?.label).toBe('Container logs');

    // Verify Container metrics action exists
    const containerMetricsAction = allActions.find((action) => action.key === 'containerMetrics');
    expect(containerMetricsAction).toBeDefined();
    expect(containerMetricsAction?.label).toBe('Container metrics');
  });

  it('returns both pod and container actions when both are present', () => {
    const instanceDetails: InstaceDetails = {
      '@timestamp': '2021-10-10T00:00:00.000Z',
      kubernetes: {
        pod: {
          uid: 'pod-123',
        },
      },
      container: {
        id: 'container-456',
      },
    } as InstaceDetails;

    const sections = getMenuSections({
      instanceDetails,
      basePath: mockBasePath,
      onFilterByInstanceClick: mockOnFilterByInstanceClick,
      metricsHref: '/metrics-href',
      logsLocator: mockLogsLocator,
      assetDetailsLocator: mockAssetDetailsLocator,
      infraLinksAvailable: true,
    });

    const allActions = sections.flat().flatMap((section) => section.actions);
    const actionKeys = new Set(allActions.map((action) => action.key));

    // Should have pod logs, pod metrics, container logs, container metrics, filter by instance, and metrics
    expect(actionKeys.has('podLogs')).toBe(true);
    expect(actionKeys.has('podMetrics')).toBe(true);
    expect(actionKeys.has('containerLogs')).toBe(true);
    expect(actionKeys.has('containerMetrics')).toBe(true);
    expect(actionKeys.has('filterByInstance')).toBe(true);
    expect(actionKeys.has('analyzeRuntimeMetric')).toBe(true);
  });

  it('does not return pod metrics action when assetDetailsLocator is not provided', () => {
    const instanceDetails: InstaceDetails = {
      '@timestamp': '2021-10-10T00:00:00.000Z',
      kubernetes: {
        pod: {
          uid: 'pod-123',
        },
      },
    } as InstaceDetails;

    const sections = getMenuSections({
      instanceDetails,
      basePath: mockBasePath,
      onFilterByInstanceClick: mockOnFilterByInstanceClick,
      metricsHref: '/metrics-href',
      logsLocator: mockLogsLocator,
      assetDetailsLocator: undefined,
      infraLinksAvailable: true,
    });

    const allActions = sections.flat().flatMap((section) => section.actions);

    // Pod logs should still exist
    expect(allActions.find((action) => action.key === 'podLogs')).toBeDefined();

    // Pod metrics should not exist without assetDetailsLocator
    expect(allActions.find((action) => action.key === 'podMetrics')).toBeUndefined();
  });

  it('does not return container metrics action when assetDetailsLocator is not provided', () => {
    const instanceDetails: InstaceDetails = {
      '@timestamp': '2021-10-10T00:00:00.000Z',
      container: {
        id: 'container-456',
      },
    } as InstaceDetails;

    const sections = getMenuSections({
      instanceDetails,
      basePath: mockBasePath,
      onFilterByInstanceClick: mockOnFilterByInstanceClick,
      metricsHref: '/metrics-href',
      logsLocator: mockLogsLocator,
      assetDetailsLocator: undefined,
      infraLinksAvailable: true,
    });

    const allActions = sections.flat().flatMap((section) => section.actions);

    // Container logs should still exist
    expect(allActions.find((action) => action.key === 'containerLogs')).toBeDefined();

    // Container metrics should not exist without assetDetailsLocator
    expect(allActions.find((action) => action.key === 'containerMetrics')).toBeUndefined();
  });

  it('returns pod details section with correct title and subtitle', () => {
    const instanceDetails: InstaceDetails = {
      '@timestamp': '2021-10-10T00:00:00.000Z',
      kubernetes: {
        pod: {
          uid: 'pod-123',
        },
      },
    } as InstaceDetails;

    const sections = getMenuSections({
      instanceDetails,
      basePath: mockBasePath,
      onFilterByInstanceClick: mockOnFilterByInstanceClick,
      metricsHref: '/metrics-href',
      logsLocator: mockLogsLocator,
      assetDetailsLocator: mockAssetDetailsLocator,
      infraLinksAvailable: true,
    });

    const podSection = sections.flat().find((section) => section.key === 'podDetails');
    expect(podSection).toBeDefined();
    expect(podSection?.title).toBe('Pod details');
    expect(podSection?.subtitle).toBe('View logs and metrics for this pod to get further details.');
  });

  it('returns container details section with correct title and subtitle', () => {
    const instanceDetails: InstaceDetails = {
      '@timestamp': '2021-10-10T00:00:00.000Z',
      container: {
        id: 'container-456',
      },
    } as InstaceDetails;

    const sections = getMenuSections({
      instanceDetails,
      basePath: mockBasePath,
      onFilterByInstanceClick: mockOnFilterByInstanceClick,
      metricsHref: '/metrics-href',
      logsLocator: mockLogsLocator,
      assetDetailsLocator: mockAssetDetailsLocator,
      infraLinksAvailable: true,
    });

    const containerSection = sections.flat().find((section) => section.key === 'containerDetails');
    expect(containerSection).toBeDefined();
    expect(containerSection?.title).toBe('Container details');
    expect(containerSection?.subtitle).toBe(
      'View logs and metrics for this container to get further details.'
    );
  });

  it('uses Discover link for OTel-observed K8s pods instead of Infra UI', () => {
    const instanceDetails: InstaceDetails = {
      '@timestamp': '2021-10-10T00:00:00.000Z',
      kubernetes: {
        pod: {
          uid: 'pod-123',
        },
      },
      agent: {
        name: 'otlp/nodejs',
      },
    } as InstaceDetails;

    const sections = getMenuSections({
      instanceDetails,
      basePath: mockBasePath,
      onFilterByInstanceClick: mockOnFilterByInstanceClick,
      metricsHref: '/metrics-href',
      logsLocator: mockLogsLocator,
      assetDetailsLocator: mockAssetDetailsLocator,
      discoverLocator: mockDiscoverLocator,
      infraLinksAvailable: true,
    });

    const allActions = sections.flat().flatMap((section) => section.actions);
    const podMetricsAction = allActions.find((action) => action.key === 'podMetrics');

    expect(podMetricsAction?.condition).toBe(true);
    // Should use Discover link, not Infra UI link
    expect(mockAssetDetailsLocator.getRedirectUrl).not.toHaveBeenCalled();
    // Should use an ES|QL TS (time series) query, not classic KQL
    expect(mockDiscoverLocator.getRedirectUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({
          esql: 'TS metrics-* | WHERE `kubernetes.pod.uid` == "pod-123"',
        }),
      })
    );
    // Verify the generated URL contains the correct query
    expect(podMetricsAction?.href).toContain('/app/discover');
    expect(podMetricsAction?.href).toContain('TS metrics-*');
    expect(podMetricsAction?.href).toContain('kubernetes.pod.uid');
  });
});
