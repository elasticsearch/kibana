/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { coreMock } from '@kbn/core/public/mocks';
import { I18nProvider } from '@kbn/i18n-react';
import { KibanaRenderContextProvider } from '@kbn/react-kibana-context-render';
import { createKibanaContextForPlugin } from '../../../../hooks/use_kibana';
import {
  CompareMetricNodesLink,
  MetricsNodeDetailsLink,
  type NodeTypeForLink,
} from './metrics_node_details_link';

const DISCOVER_APP_LOCATOR_ID = 'DISCOVER_APP_LOCATOR';
const ASSET_HREF = '/app/metrics/link-to/asset-detail';
const DISCOVER_HREF = '/app/discover#/';

const mockGetAssetDetailUrl = jest.fn(() => ({
  href: ASSET_HREF,
  onClick: jest.fn(),
}));

jest.mock('../../../../pages/link_to/use_asset_details_redirect', () => ({
  useAssetDetailsRedirect: () => ({
    getAssetDetailUrl: mockGetAssetDetailUrl,
  }),
}));

function createDiscoverLocatorMock() {
  const getRedirectUrl = jest.fn(
    (params: { query?: { esql?: string }; timeRange?: unknown; breakdownField?: string }) => {
      return params?.query?.esql ? DISCOVER_HREF : '#';
    }
  );
  const navigate = jest.fn();
  return { getRedirectUrl, navigate };
}

function CompareMetricNodesLinkHarness({
  ids,
  nodeType,
  timerange,
  metricsIndices,
}: {
  ids: string[];
  nodeType: NodeTypeForLink;
  timerange: { from: string; to: string };
  metricsIndices?: string;
}) {
  const { href, onClick } = CompareMetricNodesLink({
    ids,
    nodeType,
    timerange,
    metricsIndices,
  });

  return (
    <a href={href} onClick={onClick} data-test-subj="compareMetricNodesLink">
      Compare
    </a>
  );
}

function createWrapper(discoverLocator = createDiscoverLocatorMock()) {
  const core = coreMock.createStart();
  core.i18n.Context.mockImplementation(I18nProvider as () => JSX.Element);

  const share = {
    url: {
      locators: {
        get: (id: string) => (id === DISCOVER_APP_LOCATOR_ID ? discoverLocator : undefined),
      },
    },
  };

  const services = { ...core, share: share as any };
  const { Provider: KibanaContextProviderForPlugin } = createKibanaContextForPlugin(services);

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <KibanaRenderContextProvider {...core}>
        <KibanaContextProviderForPlugin services={services}>
          {children}
        </KibanaContextProviderForPlugin>
      </KibanaRenderContextProvider>
    );
  };
}

const defaultProps = {
  id: 'my-container-id',
  label: 'my-container',
  nodeType: 'container' as const,
  timerange: { from: 'now-15m', to: 'now' },
};

describe('MetricsNodeDetailsLink', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when isOtel is true and nodeType is not host', () => {
    it('navigates to Discover with ES|QL query for container', () => {
      const discoverLocator = createDiscoverLocatorMock();
      const Wrapper = createWrapper(discoverLocator);

      render(
        <MetricsNodeDetailsLink
          {...defaultProps}
          isOtel={true}
          nodeType="container"
          id="abc-123"
        />,
        { wrapper: Wrapper }
      );

      expect(discoverLocator.getRedirectUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          query: { esql: 'TS "metrics-*" | WHERE container.id == "abc-123"' },
          timeRange: { from: 'now-15m', to: 'now' },
        })
      );
      expect(mockGetAssetDetailUrl).not.toHaveBeenCalled();
    });

    it('navigates to Discover with ES|QL query for pod', () => {
      const discoverLocator = createDiscoverLocatorMock();
      const Wrapper = createWrapper(discoverLocator);

      render(
        <MetricsNodeDetailsLink {...defaultProps} isOtel={true} nodeType="pod" id="pod-uid-456" />,
        { wrapper: Wrapper }
      );

      expect(discoverLocator.getRedirectUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          query: { esql: 'TS "metrics-*" | WHERE k8s.pod.uid == "pod-uid-456"' },
          timeRange: { from: 'now-15m', to: 'now' },
        })
      );
      expect(mockGetAssetDetailUrl).not.toHaveBeenCalled();
    });

    it('uses metricIndices in ES|QL when provided', () => {
      const discoverLocator = createDiscoverLocatorMock();
      const Wrapper = createWrapper(discoverLocator);

      render(
        <MetricsNodeDetailsLink
          {...defaultProps}
          isOtel={true}
          nodeType="container"
          id="abc-123"
          metricsIndices="my-metrics-*"
        />,
        { wrapper: Wrapper }
      );

      expect(discoverLocator.getRedirectUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          query: { esql: 'TS "my-metrics-*" | WHERE container.id == "abc-123"' },
          timeRange: { from: 'now-15m', to: 'now' },
        })
      );
    });

    it('falls back to metrics-* when metricIndices is not provided', () => {
      const discoverLocator = createDiscoverLocatorMock();
      const Wrapper = createWrapper(discoverLocator);

      render(
        <MetricsNodeDetailsLink {...defaultProps} isOtel={true} nodeType="container" id="x" />,
        { wrapper: Wrapper }
      );

      expect(discoverLocator.getRedirectUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          query: { esql: 'TS "metrics-*" | WHERE container.id == "x"' },
          timeRange: { from: 'now-15m', to: 'now' },
        })
      );
    });

    it('escapes double quotes in entity id in ES|QL', () => {
      const discoverLocator = createDiscoverLocatorMock();
      const Wrapper = createWrapper(discoverLocator);

      render(
        <MetricsNodeDetailsLink
          {...defaultProps}
          isOtel={true}
          nodeType="container"
          id='id-with-"quote"'
        />,
        { wrapper: Wrapper }
      );

      expect(discoverLocator.getRedirectUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          query: {
            esql: 'TS "metrics-*" | WHERE container.id == "id-with-\\"quote\\""',
          },
          timeRange: { from: 'now-15m', to: 'now' },
        })
      );
    });
  });

  describe('when isOtel is true and nodeType is host', () => {
    it('uses asset details redirect, not Discover', () => {
      const discoverLocator = createDiscoverLocatorMock();
      const Wrapper = createWrapper(discoverLocator);

      render(
        <MetricsNodeDetailsLink
          {...defaultProps}
          isOtel={true}
          nodeType="host"
          id="host-01"
          label="host-01"
        />,
        { wrapper: Wrapper }
      );

      expect(mockGetAssetDetailUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'host',
          entityId: 'host-01',
          preferredSchema: 'semconv',
        })
      );
      expect(discoverLocator.getRedirectUrl).not.toHaveBeenCalled();
    });
  });

  describe('when isOtel is false or undefined', () => {
    it('uses asset details redirect for container when isOtel is false', () => {
      const discoverLocator = createDiscoverLocatorMock();
      const Wrapper = createWrapper(discoverLocator);

      render(
        <MetricsNodeDetailsLink
          {...defaultProps}
          isOtel={false}
          nodeType="container"
          id="abc-123"
          label="my-container"
        />,
        { wrapper: Wrapper }
      );

      expect(mockGetAssetDetailUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'container',
          entityId: 'abc-123',
          preferredSchema: 'ecs',
          search: expect.objectContaining({ name: 'my-container' }),
        })
      );
      expect(discoverLocator.getRedirectUrl).not.toHaveBeenCalled();
    });

    it('uses asset details redirect when isOtel is undefined', () => {
      const discoverLocator = createDiscoverLocatorMock();
      const Wrapper = createWrapper(discoverLocator);

      render(
        <MetricsNodeDetailsLink {...defaultProps} nodeType="pod" id="pod-1" label="my-pod" />,
        { wrapper: Wrapper }
      );

      expect(mockGetAssetDetailUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'pod',
          entityId: 'pod-1',
        })
      );
      expect(discoverLocator.getRedirectUrl).not.toHaveBeenCalled();
    });
  });

  describe('render', () => {
    it('renders link with label', () => {
      const Wrapper = createWrapper();

      render(<MetricsNodeDetailsLink {...defaultProps} label="My Container Label" />, {
        wrapper: Wrapper,
      });

      const link = screen.getByTestId('infraMetricsNodeDetailsLinkLink');
      expect(link).toHaveTextContent('My Container Label');
    });

    it('uses Discover href when redirecting to Discover', () => {
      const Wrapper = createWrapper();

      render(<MetricsNodeDetailsLink {...defaultProps} isOtel={true} nodeType="container" />, {
        wrapper: Wrapper,
      });

      const link = screen.getByRole('link', { name: defaultProps.label });
      expect(link).toHaveAttribute('href', DISCOVER_HREF);
    });

    it('uses asset details href when not redirecting to Discover', () => {
      const Wrapper = createWrapper();

      render(<MetricsNodeDetailsLink {...defaultProps} />, { wrapper: Wrapper });

      const link = screen.getByRole('link', { name: defaultProps.label });
      expect(link).toHaveAttribute('href', ASSET_HREF);
    });
  });
});

describe('CompareMetricNodesLink', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const timerange = { from: 'now-15m', to: 'now' };

  it('builds a multi-id ES|QL query and breakdown field for containers', () => {
    const discoverLocator = createDiscoverLocatorMock();
    const Wrapper = createWrapper(discoverLocator);

    render(
      <CompareMetricNodesLinkHarness
        ids={['abc-123', 'def-456']}
        nodeType="container"
        timerange={timerange}
      />,
      { wrapper: Wrapper }
    );

    expect(discoverLocator.getRedirectUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        query: {
          esql: 'TS "metrics-*" | WHERE container.id IN ("abc-123", "def-456")',
        },
        breakdownField: 'resource.attributes.container.id',
        timeRange: timerange,
      })
    );
  });

  it('builds a multi-id ES|QL query and breakdown field for pods', () => {
    const discoverLocator = createDiscoverLocatorMock();
    const Wrapper = createWrapper(discoverLocator);

    render(
      <CompareMetricNodesLinkHarness
        ids={['pod-uid-1', 'pod-uid-2']}
        nodeType="pod"
        timerange={timerange}
      />,
      { wrapper: Wrapper }
    );

    expect(discoverLocator.getRedirectUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        query: {
          esql: 'TS "metrics-*" | WHERE k8s.pod.name IN ("pod-uid-1", "pod-uid-2")',
        },
        breakdownField: 'resource.attributes.k8s.pod.name',
        timeRange: timerange,
      })
    );
  });

  it('builds a multi-id ES|QL query and breakdown field for hosts', () => {
    const discoverLocator = createDiscoverLocatorMock();
    const Wrapper = createWrapper(discoverLocator);

    render(
      <CompareMetricNodesLinkHarness
        ids={['host-a', 'host-b']}
        nodeType="host"
        timerange={timerange}
      />,
      { wrapper: Wrapper }
    );

    expect(discoverLocator.getRedirectUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        query: {
          esql: 'TS "metrics-*" | WHERE host.name IN ("host-a", "host-b")',
        },
        breakdownField: 'resource.attributes.host.name',
        timeRange: timerange,
      })
    );
  });

  it('uses metricsIndices in the ES|QL query when provided', () => {
    const discoverLocator = createDiscoverLocatorMock();
    const Wrapper = createWrapper(discoverLocator);

    render(
      <CompareMetricNodesLinkHarness
        ids={['abc-123']}
        nodeType="container"
        timerange={timerange}
        metricsIndices="my-metrics-*"
      />,
      { wrapper: Wrapper }
    );

    expect(discoverLocator.getRedirectUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        query: { esql: 'TS "my-metrics-*" | WHERE container.id IN ("abc-123")' },
        timeRange: timerange,
      })
    );
  });

  it('falls back to metrics-* when metricsIndices is not provided', () => {
    const discoverLocator = createDiscoverLocatorMock();
    const Wrapper = createWrapper(discoverLocator);

    render(<CompareMetricNodesLinkHarness ids={['x']} nodeType="pod" timerange={timerange} />, {
      wrapper: Wrapper,
    });

    expect(discoverLocator.getRedirectUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        query: { esql: 'TS "metrics-*" | WHERE k8s.pod.name IN ("x")' },
        timeRange: timerange,
      })
    );
  });

  it('escapes double quotes in ids in the ES|QL IN clause', () => {
    const discoverLocator = createDiscoverLocatorMock();
    const Wrapper = createWrapper(discoverLocator);

    render(
      <CompareMetricNodesLinkHarness
        ids={['id-with-"quote"']}
        nodeType="container"
        timerange={timerange}
      />,
      { wrapper: Wrapper }
    );

    expect(discoverLocator.getRedirectUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        query: {
          esql: 'TS "metrics-*" | WHERE container.id IN ("id-with-\\"quote\\"")',
        },
        timeRange: timerange,
      })
    );
  });

  it('navigates to Discover when clicked', () => {
    const discoverLocator = createDiscoverLocatorMock();
    const Wrapper = createWrapper(discoverLocator);

    render(
      <CompareMetricNodesLinkHarness
        ids={['abc-123']}
        nodeType="container"
        timerange={timerange}
      />,
      { wrapper: Wrapper }
    );

    fireEvent.click(screen.getByTestId('compareMetricNodesLink'));

    expect(discoverLocator.navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        query: { esql: 'TS "metrics-*" | WHERE container.id IN ("abc-123")' },
        breakdownField: 'resource.attributes.container.id',
        timeRange: timerange,
      })
    );
  });

  it('uses Discover href from the locator', () => {
    const Wrapper = createWrapper();

    render(
      <CompareMetricNodesLinkHarness
        ids={['abc-123']}
        nodeType="container"
        timerange={timerange}
      />,
      { wrapper: Wrapper }
    );

    expect(screen.getByTestId('compareMetricNodesLink')).toHaveAttribute('href', DISCOVER_HREF);
  });

  it('does not navigate when the Discover locator is unavailable', () => {
    const core = coreMock.createStart();
    core.i18n.Context.mockImplementation(I18nProvider as () => JSX.Element);

    const share = {
      url: {
        locators: {
          get: () => undefined,
        },
      },
    };

    const services = { ...core, share: share as any };
    const { Provider: KibanaContextProviderForPlugin } = createKibanaContextForPlugin(services);

    function WrapperWithoutLocator({ children }: { children: React.ReactNode }) {
      return (
        <KibanaRenderContextProvider {...core}>
          <KibanaContextProviderForPlugin services={services}>
            {children}
          </KibanaContextProviderForPlugin>
        </KibanaRenderContextProvider>
      );
    }

    render(
      <CompareMetricNodesLinkHarness
        ids={['abc-123']}
        nodeType="container"
        timerange={timerange}
      />,
      { wrapper: WrapperWithoutLocator }
    );

    fireEvent.click(screen.getByTestId('compareMetricNodesLink'));

    expect(screen.getByTestId('compareMetricNodesLink')).toHaveAttribute('href', '#');
  });
});
