/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { StoryFn } from '@storybook/react';
import React from 'react';
import { EuiPanel } from '@elastic/eui';
import type { HttpStart } from '@kbn/core-http-browser';
import { LatencyAggregationType } from '@kbn/apm-types';
import type { SharePluginStart } from '@kbn/share-plugin/public';
import { ServiceFlyoutTransactionsSection } from '.';

export default {
  title: 'shared/ServiceFlyout/TransactionsSection',
  component: ServiceFlyoutTransactionsSection,
};

const START = '2024-01-01T00:00:00.000Z';
const END = '2024-01-01T01:00:00.000Z';

const FIXTURE_GROUPS = [
  {
    name: 'GET /api/orders',
    transactionType: 'request',
    latency: 1200000,
    throughput: 42.3,
    errorRate: 0.02,
    alertsCount: 2,
    impact: 90,
  },
  {
    name: 'POST /api/checkout',
    transactionType: 'request',
    latency: 340000,
    throughput: 18.1,
    errorRate: 0.05,
    alertsCount: 0,
    impact: 55,
  },
  {
    name: 'GET /api/products',
    transactionType: 'request',
    latency: 85000,
    throughput: 120.7,
    errorRate: 0,
    alertsCount: 0,
    impact: 30,
  },
  {
    name: 'DELETE /api/cart/{id}',
    transactionType: 'request',
    latency: 60000,
    throughput: 5.4,
    errorRate: 0.12,
    alertsCount: 1,
    impact: 10,
  },
  {
    name: 'GET /api/v2/recommendations/personalized/homepage/featured-products',
    transactionType: 'request',
    latency: 230000,
    throughput: 9.8,
    errorRate: 0.01,
    alertsCount: 0,
    impact: 20,
  },
  {
    name: '_other',
    transactionType: 'request',
    latency: null,
    throughput: 0,
    errorRate: null,
    alertsCount: 0,
  },
];

function makeHttp(): HttpStart {
  return {
    get: (url: string) => {
      if (url === '/internal/apm/time_range_metadata') {
        return Promise.resolve({
          sources: [{ documentType: 'transactionMetric', rollupInterval: '1m', hasDocs: true }],
        });
      }
      return Promise.resolve({ transactionGroups: FIXTURE_GROUPS, maxCountExceeded: false });
    },
  } as unknown as HttpStart;
}

const mockLocators = {
  get: (id: string) => ({
    getRedirectUrl: () => `#mock-${id}`,
  }),
} as unknown as SharePluginStart['url']['locators'];

const mockNotifications = {
  toasts: { addDanger: () => {} },
} as any;

const BASE_PROPS = {
  serviceName: 'frontend-node',
  environment: 'production',
  start: START,
  end: END,
  transactionType: 'request',
  latencyAggregationType: LatencyAggregationType.p95,
  notifications: mockNotifications,
};

export const Default: StoryFn = () => (
  <EuiPanel style={{ maxWidth: 768 }}>
    <ServiceFlyoutTransactionsSection http={makeHttp()} locators={mockLocators} {...BASE_PROPS} />
  </EuiPanel>
);
