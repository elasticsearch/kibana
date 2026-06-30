/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createMemoryHistory } from 'history';
import rison from '@kbn/rison';
import type { IBasePath } from '@kbn/core/public';
import type { Transaction } from '../../../../typings/es_schemas/ui/transaction';
import { getSections } from './sections';
import { apmRouter as apmRouterBase, type ApmRouter } from '../../routing/apm_route_config';
import { logsLocatorMock } from '../../../context/apm_plugin/mock_apm_plugin_context';
import { sharePluginMock } from '@kbn/share-plugin/public/mocks';
import type {
  AssetDetailsLocatorParams,
  AssetDetailsLocator,
} from '@kbn/observability-shared-plugin/common';

const apmRouter = {
  ...apmRouterBase,
  link: (...args: [any]) => `some-basepath/app/apm${apmRouterBase.link(...args)}`,
} as ApmRouter;

const uptimeLocator = sharePluginMock.createLocator();

const mockAssetDetailsLocator = {
  getRedirectUrl: jest
    .fn()
    .mockImplementation(
      ({ entityId, entityType, assetDetails }: AssetDetailsLocatorParams) =>
        `/node-mock/${entityType}/${entityId}?receivedParams=${rison.encodeUnknown(assetDetails)}`
    ),
} as unknown as jest.Mocked<AssetDetailsLocator>;

const mockDiscoverLocator = {
  getRedirectUrl: jest.fn((params: { query?: { esql?: string } }) => {
    const esql = params.query?.esql || '';
    return `/app/discover#/?_a=(query:(esql:'${esql}'))`;
  }),
} as unknown as ReturnType<typeof sharePluginMock.createLocator>;

const expectLogsLocatorToBeCalled = () => {
  expect(logsLocatorMock.getRedirectUrl).toBeCalledTimes(4);
};

const expectUptimeLocatorToBeCalled = () => {
  expect(uptimeLocator.getRedirectUrl).toBeCalledTimes(1);
};

describe('Transaction action menu', () => {
  const basePath = {
    prepend: (url: string) => {
      return `some-basepath${url}`;
    },
  } as unknown as IBasePath;
  const date = '2020-02-06T11:00:00.000Z';
  const timestamp = { us: new Date(date).getTime() };

  const history = createMemoryHistory();
  history.replace(
    '/services/testbeans-go/transactions/view?rangeFrom=now-24h&rangeTo=now&transactionName=GET+%2Ftestbeans-go%2Fapi'
  );
  const location = history.location;

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('shows required sections only', () => {
    const transaction = {
      timestamp,
      trace: { id: '123' },
      transaction: { id: '123' },
      '@timestamp': date,
    } as unknown as Transaction;
    expect(
      getSections({
        transaction,
        basePath,
        location,
        apmRouter,
        logsLocator: logsLocatorMock,
        uptimeLocator,
        infraLinksAvailable: false,
        rangeFrom: 'now-24h',
        rangeTo: 'now',
        environment: 'ENVIRONMENT_ALL',
        dataViewId: 'apm_static_data_view_id_default',
        assetDetailsLocator: mockAssetDetailsLocator,
      })
    ).toEqual([
      [
        {
          key: 'traceDetails',
          title: 'Trace details',
          subtitle: 'View trace logs to get further details.',
          actions: [
            {
              key: 'traceLogs',
              label: 'Trace logs',
              condition: true,
            },
          ],
        },
        {
          key: 'serviceMap',
          title: 'Service map',
          subtitle: 'View service map filtered by this trace.',
          actions: [
            {
              key: 'serviceMap',
              label: 'Show in service map',
              href: 'some-basepath/app/apm/service-map?comparisonEnabled=false&environment=ENVIRONMENT_ALL&kuery=trace.id%20%3A%20%22123%22&rangeFrom=now-24h&rangeTo=now&serviceGroup=',
              condition: true,
            },
          ],
        },
      ],
    ]);
    expectUptimeLocatorToBeCalled();
    expectLogsLocatorToBeCalled();
  });

  it('shows pod and required sections only', () => {
    const transaction = {
      kubernetes: { pod: { uid: '123' } },
      timestamp,
      trace: { id: '123' },
      transaction: { id: '123' },
      '@timestamp': date,
    } as unknown as Transaction;
    expect(
      getSections({
        transaction,
        basePath,
        location,
        apmRouter,
        uptimeLocator,
        logsLocator: logsLocatorMock,
        infraLinksAvailable: true,
        rangeFrom: 'now-24h',
        rangeTo: 'now',
        environment: 'ENVIRONMENT_ALL',
        dataViewId: 'apm_static_data_view_id_default',
        assetDetailsLocator: mockAssetDetailsLocator,
      })
    ).toEqual([
      [
        {
          key: 'podDetails',
          title: 'Pod details',
          subtitle: 'View logs and metrics for this pod to get further details.',
          actions: [
            {
              key: 'podLogs',
              label: 'Pod logs',
              condition: true,
            },
            {
              key: 'podMetrics',
              label: 'Pod metrics',
              href: "/node-mock/pod/123?receivedParams=(dateRange:(from:'2020-02-06T10:55:00.000Z',to:'2020-02-06T11:05:00.000Z'))",
              condition: true,
            },
          ],
        },
        {
          key: 'traceDetails',
          title: 'Trace details',
          subtitle: 'View trace logs to get further details.',
          actions: [
            {
              key: 'traceLogs',
              label: 'Trace logs',
              condition: true,
            },
          ],
        },
        {
          key: 'serviceMap',
          title: 'Service map',
          subtitle: 'View service map filtered by this trace.',
          actions: [
            {
              key: 'serviceMap',
              label: 'Show in service map',
              href: 'some-basepath/app/apm/service-map?comparisonEnabled=false&environment=ENVIRONMENT_ALL&kuery=trace.id%20%3A%20%22123%22&rangeFrom=now-24h&rangeTo=now&serviceGroup=',
              condition: true,
            },
          ],
        },
      ],
    ]);
    expectUptimeLocatorToBeCalled();
    expectLogsLocatorToBeCalled();
  });

  it('shows Discover link for OTel-observed K8s pods instead of Infra UI', () => {
    const transaction = {
      kubernetes: { pod: { uid: '123' } },
      agent: { name: 'otlp/nodejs' },
      timestamp,
      trace: { id: '123' },
      transaction: { id: '123' },
      '@timestamp': date,
    } as unknown as Transaction;
    const sections = getSections({
      transaction,
      basePath,
      location,
      apmRouter,
      uptimeLocator,
      logsLocator: logsLocatorMock,
      infraLinksAvailable: true,
      rangeFrom: 'now-24h',
      rangeTo: 'now',
      environment: 'ENVIRONMENT_ALL',
      dataViewId: 'apm_static_data_view_id_default',
      assetDetailsLocator: mockAssetDetailsLocator,
      discoverLocator: mockDiscoverLocator,
    });

    const podDetailsSection = sections[0]?.find((section) => section.key === 'podDetails');
    const podMetricsAction = podDetailsSection?.actions.find(
      (action) => action.key === 'podMetrics'
    );

    expect(podMetricsAction?.condition).toBe(true);
    // Should use Discover link, not Infra UI link
    expect(mockAssetDetailsLocator.getRedirectUrl).not.toHaveBeenCalled();
    // Should use an ES|QL TS (time series) query, not classic KQL
    expect(mockDiscoverLocator.getRedirectUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({
          esql: 'TS metrics-* | WHERE `kubernetes.pod.uid` == "123"',
        }),
      })
    );
    // Verify the generated URL contains the correct query
    expect(podMetricsAction?.href).toContain('/app/discover');
    expect(podMetricsAction?.href).toContain('TS metrics-*');
    expect(podMetricsAction?.href).toContain('kubernetes.pod.uid');
  });

  it('shows host and required sections only', () => {
    const transaction = {
      host: { hostname: 'foo' },
      timestamp,
      trace: { id: '123' },
      transaction: { id: '123' },
      '@timestamp': date,
    } as unknown as Transaction;
    expect(
      getSections({
        transaction,
        basePath,
        location,
        apmRouter,
        uptimeLocator,
        logsLocator: logsLocatorMock,
        infraLinksAvailable: true,
        rangeFrom: 'now-24h',
        rangeTo: 'now',
        environment: 'ENVIRONMENT_ALL',
        dataViewId: 'apm_static_data_view_id_default',
        assetDetailsLocator: mockAssetDetailsLocator,
      })
    ).toEqual([
      [
        {
          key: 'hostDetails',
          title: 'Host details',
          subtitle: 'View host logs and metrics to get further details.',
          actions: [
            {
              key: 'hostLogs',
              label: 'Host logs',
              condition: true,
            },
            {
              key: 'hostMetrics',
              label: 'Host metrics',
              href: "/node-mock/host/foo?receivedParams=(dateRange:(from:'2020-02-06T10:55:00.000Z',to:'2020-02-06T11:05:00.000Z'))",
              condition: true,
            },
          ],
        },
        {
          key: 'traceDetails',
          title: 'Trace details',
          subtitle: 'View trace logs to get further details.',
          actions: [
            {
              key: 'traceLogs',
              label: 'Trace logs',
              condition: true,
            },
          ],
        },
        {
          key: 'serviceMap',
          title: 'Service map',
          subtitle: 'View service map filtered by this trace.',
          actions: [
            {
              key: 'serviceMap',
              label: 'Show in service map',
              href: 'some-basepath/app/apm/service-map?comparisonEnabled=false&environment=ENVIRONMENT_ALL&kuery=trace.id%20%3A%20%22123%22&rangeFrom=now-24h&rangeTo=now&serviceGroup=',
              condition: true,
            },
          ],
        },
      ],
    ]);
    expectUptimeLocatorToBeCalled();
    expectLogsLocatorToBeCalled();
  });
});
