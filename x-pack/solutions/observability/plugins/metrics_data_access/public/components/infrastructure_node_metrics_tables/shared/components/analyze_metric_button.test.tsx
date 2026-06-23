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
import { AnalyzeMetricButton } from './analyze_metric_button';

const DISCOVER_APP_LOCATOR_ID = 'DISCOVER_APP_LOCATOR';
const DISCOVER_HREF = '/app/discover#/';

function createDiscoverLocatorMock() {
  const getRedirectUrl = jest.fn(
    (params: { query?: { esql?: string }; timeRange?: unknown; breakdownField?: string }) => {
      return params?.query?.esql ? DISCOVER_HREF : '#';
    }
  );
  const navigate = jest.fn();
  return { getRedirectUrl, navigate };
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
  ids: ['container-a', 'container-b'],
  nodeType: 'container' as const,
  timerange: { from: 'now-15m', to: 'now' },
};

describe('AnalyzeMetricButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the compare metrics button', () => {
    const Wrapper = createWrapper();

    render(<AnalyzeMetricButton {...defaultProps} />, { wrapper: Wrapper });

    expect(screen.getByTestId('analyzeMetricButton')).toHaveTextContent(
      'Compare metrics in Discover'
    );
  });

  it('opens Discover with a multi-node ES|QL query for containers', () => {
    const discoverLocator = createDiscoverLocatorMock();
    const Wrapper = createWrapper(discoverLocator);

    render(<AnalyzeMetricButton {...defaultProps} />, { wrapper: Wrapper });

    expect(discoverLocator.getRedirectUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        query: {
          esql: 'TS "metrics-*" | WHERE container.id IN ("container-a", "container-b")',
        },
        breakdownField: 'resource.attributes.container.id',
        timeRange: { from: 'now-15m', to: 'now' },
      })
    );
  });

  it('uses metricsIndices in the ES|QL query when provided', () => {
    const discoverLocator = createDiscoverLocatorMock();
    const Wrapper = createWrapper(discoverLocator);

    render(
      <AnalyzeMetricButton
        {...defaultProps}
        ids={['pod-1']}
        nodeType="pod"
        metricsIndices="otel-metrics-*"
      />,
      { wrapper: Wrapper }
    );

    expect(discoverLocator.getRedirectUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        query: { esql: 'TS "otel-metrics-*" | WHERE k8s.pod.name IN ("pod-1")' },
        breakdownField: 'resource.attributes.k8s.pod.name',
      })
    );
  });

  it('navigates to Discover when clicked', () => {
    const discoverLocator = createDiscoverLocatorMock();
    const Wrapper = createWrapper(discoverLocator);

    render(<AnalyzeMetricButton {...defaultProps} />, { wrapper: Wrapper });

    fireEvent.click(screen.getByTestId('analyzeMetricButton'));

    expect(discoverLocator.navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        query: {
          esql: 'TS "metrics-*" | WHERE container.id IN ("container-a", "container-b")',
        },
        breakdownField: 'resource.attributes.container.id',
        timeRange: { from: 'now-15m', to: 'now' },
      })
    );
  });
});
