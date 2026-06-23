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
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiPanel,
  EuiProgress,
  EuiText,
  RIGHT_ALIGNMENT,
} from '@elastic/eui';
import type { EuiBasicTableColumn } from '@elastic/eui';
import { LatencyAggregationType } from '@kbn/apm-types';
import { ActionsMenu } from '../actions_menu';
import { TransactionsTable } from '.';
import type { TransactionGroup } from './types';

export default {
  title: 'shared/TransactionsTable',
  component: TransactionsTable,
};

const now = Date.now();
const minute = 60 * 1000;

function makeSeries(fn: (i: number) => number | null) {
  return Array.from({ length: 20 }, (_, i) => ({
    x: now - (20 - i) * minute,
    y: fn(i),
  }));
}

const items: TransactionGroup[] = [
  {
    name: 'GET /api/orders',
    transactionType: 'request',
    environment: 'production',
    latency: { value: 1200000 },
    throughput: { value: 42.3 },
    errorRate: { value: 0.02 },
    alertsCount: 2,
    impact: { value: 90 },
  },
  {
    name: 'POST /api/checkout',
    transactionType: 'request',
    environment: 'production',
    latency: { value: 340000 },
    throughput: { value: 18.1 },
    errorRate: { value: 0.05 },
    alertsCount: 0,
    impact: { value: 55 },
  },
  {
    name: 'GET /api/products',
    transactionType: 'request',
    environment: 'production',
    latency: { value: 85000 },
    throughput: { value: 120.7 },
    errorRate: { value: 0 },
    alertsCount: 0,
    impact: { value: 30 },
  },
  {
    name: 'DELETE /api/cart/{id}',
    transactionType: 'request',
    environment: 'production',
    latency: { value: 60000 },
    throughput: { value: 5.4 },
    errorRate: { value: 0.12 },
    alertsCount: 1,
    impact: { value: 10 },
  },
  {
    name: 'GET /api/v2/recommendations/personalized/homepage/featured-products',
    transactionType: 'request',
    environment: 'production',
    latency: { value: 230000 },
    throughput: { value: 9.8 },
    errorRate: { value: 0.01 },
    alertsCount: 0,
    impact: { value: 20 },
  },
  {
    name: 'PUT /api/sessions/{id}/activity',
    transactionType: 'request',
    environment: 'production',
    latency: { value: null },
    throughput: { value: 0 },
    errorRate: { value: null },
    alertsCount: 0,
    impact: { value: 0 },
  },
  {
    name: '_other',
    transactionType: 'request',
    environment: 'production',
    latency: { value: 520000 },
    throughput: { value: 31.4 },
    errorRate: { value: 0.04 },
    alertsCount: 0,
    impact: { value: 15 },
  },
];

const itemsWithComparison: TransactionGroup[] = items.map((item, idx) => ({
  ...item,
  latency: {
    value: item.latency.value,
    series: {
      value: makeSeries((i) =>
        item.latency.value !== null
          ? item.latency.value * (0.8 + Math.sin(i / 3 + idx) * 0.2)
          : null
      ),
      comparison: makeSeries((i) =>
        item.latency.value !== null
          ? item.latency.value * (1.0 + Math.sin(i / 3 + idx) * 0.15)
          : null
      ),
    },
  },
  throughput: {
    value: item.throughput.value,
    series: {
      value: makeSeries((i) => (item.throughput.value ?? 0) * (0.9 + Math.cos(i / 4 + idx) * 0.1)),
      comparison: makeSeries(
        (i) => (item.throughput.value ?? 0) * (1.1 + Math.cos(i / 4 + idx) * 0.08)
      ),
    },
  },
  errorRate: {
    value: item.errorRate.value,
    series: {
      value: makeSeries((i) =>
        item.errorRate.value !== null
          ? Math.max(0, item.errorRate.value + Math.sin(i / 5 + idx) * 0.01)
          : null
      ),
      comparison: makeSeries((i) =>
        item.errorRate.value !== null
          ? Math.max(0, item.errorRate.value * 1.2 + Math.sin(i / 5 + idx) * 0.01)
          : null
      ),
    },
  },
  impact: {
    value: item.impact?.value ?? 0,
    comparison: (item.impact?.value ?? 0) * 0.8,
  },
}));

const impactColumn: EuiBasicTableColumn<TransactionGroup> = {
  field: 'impact',
  name: 'Impact',
  align: RIGHT_ALIGNMENT,
  width: '8em',
  minWidth: '8em',
  maxWidth: '8em',
  nameTooltip: {
    content:
      'The most used and slowest endpoints in your service. Calculated by multiplying latency by throughput.',
    icon: 'question',
  },
  sortable: true,
  render: (_: unknown, { impact }: TransactionGroup) =>
    impact != null ? (
      <EuiFlexGroup direction="column" gutterSize="xs">
        <EuiFlexItem>
          <EuiProgress
            value={impact.value}
            max={100}
            size="m"
            color="primary"
            style={{ width: 96 }}
          />
        </EuiFlexItem>
        {impact.comparison !== undefined && (
          <EuiFlexItem>
            <EuiProgress
              value={impact.comparison}
              max={100}
              size="s"
              color="subdued"
              style={{ width: 96 }}
            />
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
    ) : null,
};

const actionsColumn: EuiBasicTableColumn<TransactionGroup> = {
  name: 'Actions',
  align: RIGHT_ALIGNMENT,
  width: '4.5em',
  minWidth: '4.5em',
  render: (item: TransactionGroup) => (
    <ActionsMenu
      actions={[
        {
          id: 'discover',
          actions: [
            {
              id: 'openInDiscover',
              name: 'Open traces in Discover',
              icon: 'discoverApp',
              onClick: () => alert(`Open in Discover: ${item.name}`),
              ebt: { action: 'openInDiscover', element: 'transactionsTableRowActions' },
            },
          ],
        },
        {
          id: 'alerts',
          groupLabel: 'Alerts',
          actions: [
            {
              id: 'createThresholdRule',
              name: 'Create threshold rule',
              icon: 'bell',
              ebt: { action: 'createThresholdRule', element: 'transactionsTableRowActions' },
              items: [
                {
                  id: 'createLatencyRule',
                  name: 'Latency',
                  onClick: () => alert(`Create latency rule: ${item.name}`),
                  ebt: { action: 'createLatencyRule', element: 'transactionsTableRowActions' },
                },
                {
                  id: 'createFailedTransactionRateRule',
                  name: 'Failed transaction rate',
                  onClick: () => alert(`Create failed transaction rate rule: ${item.name}`),
                  ebt: {
                    action: 'createFailedTransactionRateRule',
                    element: 'transactionsTableRowActions',
                  },
                },
                {
                  id: 'createAnomalyRule',
                  name: 'Create anomaly rule',
                  onClick: () => alert(`Create anomaly rule: ${item.name}`),
                  ebt: { action: 'createAnomalyRule', element: 'transactionsTableRowActions' },
                },
              ],
            },
            {
              id: 'createErrorCountRule',
              name: 'Create error count rule',
              icon: 'bell',
              onClick: () => alert(`Create error count rule: ${item.name}`),
              ebt: { action: 'createErrorCountRule', element: 'transactionsTableRowActions' },
            },
            {
              id: 'manageRules',
              name: 'Manage rules',
              icon: 'tableOfContents',
              onClick: () => alert('Manage rules'),
              ebt: { action: 'manageRules', element: 'transactionsTableRowActions' },
            },
          ],
        },
        {
          id: 'slos',
          groupLabel: 'SLOs',
          actions: [
            {
              id: 'createLatencySlo',
              name: 'Create APM latency SLO',
              icon: 'visGauge',
              onClick: () => alert(`Create latency SLO: ${item.name}`),
              ebt: { action: 'createLatencySlo', element: 'transactionsTableRowActions' },
            },
            {
              id: 'createAvailabilitySlo',
              name: 'Create APM availability SLO',
              icon: 'visGauge',
              onClick: () => alert(`Create availability SLO: ${item.name}`),
              ebt: { action: 'createAvailabilitySlo', element: 'transactionsTableRowActions' },
            },
            {
              id: 'manageSlos',
              name: 'Manage SLOs',
              icon: 'tableOfContents',
              onClick: () => alert('Manage SLOs'),
              ebt: { action: 'manageSlos', element: 'transactionsTableRowActions' },
            },
          ],
        },
      ]}
    />
  ),
};

export const MaxCountExceeded: StoryFn = () => (
  <TransactionsTable
    items={items}
    isLoading={false}
    maxCountExceeded={true}
    showMaxTransactionGroupsExceededWarning={true}
    latencyAggregationType={LatencyAggregationType.p95}
    onSearchQueryChange={(query) => alert(`Server fetch triggered with: "${query}"`)}
  />
);

export const Default: StoryFn = () => (
  <TransactionsTable
    items={items}
    isLoading={false}
    maxCountExceeded={false}
    latencyAggregationType={LatencyAggregationType.p95}
  />
);

export const WithHeaderActions: StoryFn = () => (
  <TransactionsTable
    items={items}
    isLoading={false}
    maxCountExceeded={false}
    latencyAggregationType={LatencyAggregationType.p95}
    headerActions={[
      {
        label: 'View transactions',
        href: '#',
        ebt: { action: 'viewTransactions', element: 'transactionsTableHeader' },
      },
    ]}
  />
);

export const WithError: StoryFn = () => (
  <EuiPanel style={{ maxWidth: 768 }}>
    <TransactionsTable
      items={[]}
      isLoading={false}
      maxCountExceeded={false}
      latencyAggregationType={LatencyAggregationType.p95}
      showSparklines={false}
      headerActions={[
        {
          label: 'Open in APM',
          href: '#',
          ebt: { action: 'openInApm', element: 'transactionsTableHeader' },
        },
      ]}
      errorMessage="Failed to load transaction data"
    />
  </EuiPanel>
);

export const Loading: StoryFn = () => (
  <TransactionsTable
    items={[]}
    isLoading={true}
    maxCountExceeded={false}
    latencyAggregationType={LatencyAggregationType.p95}
  />
);

export const Empty: StoryFn = () => (
  <TransactionsTable
    items={[]}
    isLoading={false}
    maxCountExceeded={false}
    latencyAggregationType={LatencyAggregationType.p95}
  />
);

export const Compact: StoryFn = () => (
  <EuiPanel style={{ maxWidth: 768 }}>
    <TransactionsTable
      items={items}
      isLoading={false}
      maxCountExceeded={false}
      latencyAggregationType={LatencyAggregationType.p95}
      showSparklines={false}
      headerActions={[
        {
          label: 'Open in APM',
          href: '#',
          ebt: { action: 'openInApm', element: 'transactionsTableHeader' },
        },
      ]}
      columnInteractions={{
        name: { href: () => '#' },
      }}
    />
  </EuiPanel>
);

export const Complete: StoryFn = () => (
  <TransactionsTable
    items={itemsWithComparison}
    isLoading={false}
    maxCountExceeded={false}
    latencyAggregationType={LatencyAggregationType.p95}
    columns={['alerts', 'name', 'latency', 'throughput', 'errorRate', impactColumn, actionsColumn]}
    columnInteractions={{
      name: {
        onClick: (item) =>
          alert(
            `Clicked: ${item.name}\nType: ${item.transactionType}\nLatency: ${item.latency.value}`
          ),
      },
      alerts: { onClick: (item) => alert(`View alerts for: ${item.name}`) },
    }}
    remainingTransactionsCellTooltipContent={
      <EuiText size="s" style={{ maxWidth: 448 }}>
        The cardinality of APM data being collected is too high. Please review{' '}
        <EuiLink
          href="https://www.elastic.co/guide/en/kibana/8.7/troubleshooting.html#troubleshooting-too-many-transactions"
          target="_blank"
        >
          docs
        </EuiLink>{' '}
        to mitigate the situation.
      </EuiText>
    }
  />
);
