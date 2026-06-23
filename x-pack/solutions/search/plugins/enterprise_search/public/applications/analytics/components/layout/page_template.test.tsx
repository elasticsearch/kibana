/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setMockValues, mockTelemetryActions } from '../../../__mocks__/kea_logic';

import React from 'react';

import { screen, waitFor } from '@testing-library/react';
import { of } from 'rxjs';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

const mockUseEnterpriseSearchAnalyticsNav = jest.fn().mockReturnValue([]);

jest.mock('../../../shared/layout/nav', () => ({
  useEnterpriseSearchAnalyticsNav: (...args: any[]) => mockUseEnterpriseSearchAnalyticsNav(...args),
}));

// SetAnalyticsChrome renders null — mock it so we can verify the page template passes the
// correct trail prop. SendEnterpriseSearchTelemetry is verified via mockTelemetryActions
// (the kea_logic mock overrides any factory placed here for that module).
jest.mock('../../../shared/kibana_chrome', () => ({
  SetAnalyticsChrome: jest.fn(() => null),
}));

import { SetAnalyticsChrome } from '../../../shared/kibana_chrome';

import { EnterpriseSearchAnalyticsPageTemplate } from './page_template';

const MockedSetAnalyticsChrome = jest.mocked(SetAnalyticsChrome);

const mockValues = {
  getChromeStyle$: () => of('classic'),
  updateSideNavDefinition: jest.fn(),
};

describe('EnterpriseSearchAnalyticsPageTemplate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders', () => {
    setMockValues(mockValues);

    renderWithKibanaRenderContext(
      <EnterpriseSearchAnalyticsPageTemplate>
        <div className="hello">world</div>
      </EnterpriseSearchAnalyticsPageTemplate>
    );

    expect(screen.getByText('world')).toBeInTheDocument();
  });

  it('updates the side nav dynamic links', async () => {
    const updateSideNavDefinition = jest.fn();
    setMockValues({ ...mockValues, updateSideNavDefinition });

    const collectionsItems = [{ foo: 'bar' }];
    mockUseEnterpriseSearchAnalyticsNav.mockReturnValueOnce([
      {
        id: 'build',
        items: [
          {
            id: 'analyticsCollections',
            items: collectionsItems,
          },
        ],
      },
    ]);

    renderWithKibanaRenderContext(<EnterpriseSearchAnalyticsPageTemplate />);

    await waitFor(() => {
      expect(updateSideNavDefinition).toHaveBeenCalledWith({
        collections: collectionsItems,
      });
    });
  });

  describe('page chrome', () => {
    it('takes a breadcrumb array & renders a product-specific page chrome', () => {
      setMockValues(mockValues);

      renderWithKibanaRenderContext(
        <EnterpriseSearchAnalyticsPageTemplate pageChrome={['Some page']} />
      );

      expect(MockedSetAnalyticsChrome).toHaveBeenCalledWith(
        expect.objectContaining({ trail: ['Some page'] }),
        expect.anything()
      );
    });
  });

  describe('page telemetry', () => {
    it('takes a metric & renders product-specific telemetry viewed event', async () => {
      setMockValues(mockValues);

      renderWithKibanaRenderContext(
        <EnterpriseSearchAnalyticsPageTemplate pageViewTelemetry="some_page" />
      );

      await waitFor(() => {
        expect(mockTelemetryActions.sendTelemetry).toHaveBeenCalledWith({
          action: 'viewed',
          metric: 'some_page',
          product: 'enterprise_search',
        });
      });
    });
  });

  describe('props', () => {
    it('passes down any ...pageTemplateProps that EnterpriseSearchPageTemplateWrapper accepts', () => {
      setMockValues(mockValues);

      renderWithKibanaRenderContext(
        <EnterpriseSearchAnalyticsPageTemplate
          pageHeader={{ pageTitle: 'hello world' }}
          isLoading={false}
          emptyState={<div />}
        />
      );

      expect(screen.getByText('hello world')).toBeInTheDocument();
    });

    it('passes down analytics name and paths to useEnterpriseSearchAnalyticsNav', () => {
      setMockValues(mockValues);

      const mockAnalyticsName = 'some_analytics_name';
      renderWithKibanaRenderContext(
        <EnterpriseSearchAnalyticsPageTemplate
          analyticsName={mockAnalyticsName}
          pageHeader={{ pageTitle: 'hello world' }}
          isLoading={false}
          emptyState={<div />}
        />
      );

      expect(mockUseEnterpriseSearchAnalyticsNav).toHaveBeenCalledWith(
        mockAnalyticsName,
        {
          explorer: '/collections/some_analytics_name/explorer',
          integration: '/collections/some_analytics_name/integrate',
          overview: '/collections/some_analytics_name/overview',
        },
        true
      );
    });
  });
});
