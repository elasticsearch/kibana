/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import type { HttpStart } from '@kbn/core-http-browser';
import { LatencyAggregationType } from '@kbn/apm-types';
import type { SharePluginStart } from '@kbn/share-plugin/public';
import { ServiceFlyoutTransactionsSection } from '.';
import { useServiceFlyoutTransactions } from './hooks/use_service_flyout_transactions';

jest.mock('./hooks/use_service_flyout_transactions');

const FIXTURE_ITEMS = [
  {
    name: 'GET /api/orders',
    transactionType: 'request',
    latency: { value: 1200000 },
    throughput: { value: 42.3 },
    errorRate: { value: 0.02 },
    alertsCount: 3,
  },
  {
    name: 'POST /api/checkout',
    transactionType: 'request',
    latency: { value: 340000 },
    throughput: { value: 18.1 },
    errorRate: { value: 0.05 },
    alertsCount: 0,
  },
];

const DEFAULT_HOOK_RESULT = {
  items: FIXTURE_ITEMS,
  isLoading: false,
  maxCountExceeded: false,
  hasActiveAlerts: true,
  error: undefined,
};

const START = '2024-01-01T00:00:00.000Z';
const END = '2024-01-01T01:00:00.000Z';

const locators = {
  get: (id: string) => ({
    getRedirectUrl: (params: Record<string, unknown>) =>
      `#mock-${id}?${Object.entries(params)
        .map(([k, v]) => `${k}=${v}`)
        .join('&')}`,
  }),
} as unknown as SharePluginStart['url']['locators'];

const BASE_PROPS = {
  http: {} as unknown as HttpStart,
  notifications: { toasts: { addDanger: jest.fn() } } as any,
  serviceName: 'frontend-node',
  environment: 'production',
  start: START,
  end: END,
  transactionType: 'request',
  latencyAggregationType: LatencyAggregationType.p95,
  locators,
};

const mockedUseServiceFlyoutTransactions = useServiceFlyoutTransactions as jest.Mock;

describe('ServiceFlyoutTransactionsSection', () => {
  beforeEach(() => {
    mockedUseServiceFlyoutTransactions.mockReturnValue(DEFAULT_HOOK_RESULT);
  });

  it('renders transaction names as links when locators are provided', () => {
    render(<ServiceFlyoutTransactionsSection {...BASE_PROPS} />);

    const link = screen.getByRole('link', { name: 'GET /api/orders' });
    expect(link).toBeInTheDocument();
    expect(link.getAttribute('href')).toContain('TransactionDetailsByNameLocator');
    expect(link.getAttribute('href')).toContain('frontend-node');
  });

  it('renders the Open in APM header link when locators are provided', () => {
    render(<ServiceFlyoutTransactionsSection {...BASE_PROPS} />);

    expect(screen.getByRole('link', { name: 'Open in APM' })).toBeInTheDocument();
  });

  it('renders transaction names as plain text when locators are not provided', () => {
    render(<ServiceFlyoutTransactionsSection {...BASE_PROPS} locators={undefined} />);

    expect(screen.queryByRole('link', { name: 'GET /api/orders' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open in APM' })).not.toBeInTheDocument();
  });

  it('renders the alerts column when hasActiveAlerts is true', () => {
    render(<ServiceFlyoutTransactionsSection {...BASE_PROPS} />);

    expect(screen.getByRole('columnheader', { name: /active alerts/i })).toBeInTheDocument();
  });

  it('omits the alerts column when hasActiveAlerts is false', () => {
    mockedUseServiceFlyoutTransactions.mockReturnValue({
      ...DEFAULT_HOOK_RESULT,
      hasActiveAlerts: false,
    });

    render(<ServiceFlyoutTransactionsSection {...BASE_PROPS} />);

    expect(screen.queryByRole('columnheader', { name: /active alerts/i })).not.toBeInTheDocument();
  });

  it('renders the alerts badge as a link pointing to the service alerts locator', () => {
    render(<ServiceFlyoutTransactionsSection {...BASE_PROPS} />);

    const badge = screen.getByRole('link', { name: '3' });
    expect(badge).toBeInTheDocument();
    expect(badge.getAttribute('href')).toContain('serviceAlertsLocator');
    expect(badge.getAttribute('href')).toContain('frontend-node');
  });

  describe('error state', () => {
    it('renders the error callout when the hook returns an error', () => {
      mockedUseServiceFlyoutTransactions.mockReturnValue({
        ...DEFAULT_HOOK_RESULT,
        error: new Error('network error'),
        items: [],
      });

      render(<ServiceFlyoutTransactionsSection {...BASE_PROPS} />);

      expect(screen.getByText('Failed to load transaction data')).toBeInTheDocument();
    });

    it('does not render the error callout when there is no error', () => {
      render(<ServiceFlyoutTransactionsSection {...BASE_PROPS} />);

      expect(screen.queryByText('Failed to load transaction data')).not.toBeInTheDocument();
    });
  });
});
