/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { StoryFn, Meta } from '@storybook/react';
import React from 'react';
import { ServiceOverview } from '.';
import type { APMServiceContextValue } from '../../../context/apm_service/apm_service_context';
import { ChartPointerEventContextProvider } from '../../../context/chart_pointer_event/chart_pointer_event_context';
import { FETCH_STATUS } from '../../../hooks/use_fetcher';
import {
  opbeansScenario,
  SCENARIO_START,
  SCENARIO_END,
  toLatencyChartResponse,
  toThroughputChartResponse,
  toErrorRateChartResponse,
  TIME_RANGE_METADATA_DEFAULTS,
  APM_STORY_A11Y,
  makeApmContextParams,
} from '../../../test_helpers/synthtrace_stories';

const SERVICE_NAME = 'opbeans-node';
const EMPTY_STATS = { currentPeriod: {}, previousPeriod: {} };

const stories: Meta<{}> = {
  title: 'app/ServiceOverview',
  component: ServiceOverview,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Service overview page showing latency, throughput, error-rate, and breakdown charts ' +
          'alongside transactions, errors, dependencies, and instances tables. The `Example` story ' +
          'derives chart data from the shared `opbeansScenario()` — no Elasticsearch required.',
      },
    },
    a11y: APM_STORY_A11Y,
  },
};
export default stories;

export const Example: StoryFn<{}> = () => {
  return <ServiceOverview />;
};

const _overviewDocs = opbeansScenario();

Example.decorators = [
  (StoryComponent) => (
    <ChartPointerEventContextProvider>
      <StoryComponent />
    </ChartPointerEventContextProvider>
  ),
];

Example.parameters = {
  routePath: `/services/${SERVICE_NAME}/overview?environment=ENVIRONMENT_ALL&rangeFrom=${SCENARIO_START.toISOString()}&rangeTo=${SCENARIO_END.toISOString()}`,
  serviceContextValue: {
    serviceName: SERVICE_NAME,
    agentName: 'nodejs',
    transactionType: 'request',
    transactionTypeStatus: FETCH_STATUS.SUCCESS,
    transactionTypes: ['request'],
    fallbackToTransactions: false,
    serviceAgentStatus: FETCH_STATUS.SUCCESS,
  } as unknown as APMServiceContextValue,
  ...makeApmContextParams(
    (endpoint) => {
      if (endpoint === '/internal/apm/time_range_metadata') return TIME_RANGE_METADATA_DEFAULTS;
      if (endpoint === '/internal/apm/data_view/index_pattern')
        return {
          apmDataViewIndexPattern: 'traces-apm*,apm-*',
          apmIndices: {
            transaction: 'traces-apm*,apm-*',
            span: 'traces-apm*,apm-*',
            error: 'logs-apm*,apm-*',
            metric: 'metrics-apm*,apm-*',
            onboarding: 'apm-*',
            sourcemap: 'apm-*',
          },
        };
      if (endpoint === '/internal/apm/fallback_to_transactions')
        return { fallbackToTransactions: false };
      if (endpoint.endsWith('/transactions/charts/latency'))
        return toLatencyChartResponse(_overviewDocs, SERVICE_NAME);
      if (endpoint.endsWith('/throughput'))
        return toThroughputChartResponse(_overviewDocs, SERVICE_NAME);
      if (endpoint.endsWith('/transactions/charts/error_rate'))
        return toErrorRateChartResponse(_overviewDocs, SERVICE_NAME);
      if (endpoint.endsWith('/transaction/charts/breakdown')) return { timeseries: [] };
      if (endpoint.includes('/annotation/search')) return { annotations: [] };
      if (endpoint.endsWith('/transactions/groups/main_statistics'))
        return {
          transactionGroups: [],
          maxCountExceeded: false,
          transactionOverflowCount: 0,
          hasActiveAlerts: false,
        };
      if (endpoint.endsWith('/transactions/groups/detailed_statistics')) return EMPTY_STATS;
      if (endpoint.endsWith('/errors/groups/main_statistics'))
        return { errorGroups: [], maxCountExceeded: false };
      if (endpoint.endsWith('/service_overview_instances/main_statistics'))
        return { currentPeriod: [], previousPeriod: [] };
      if (endpoint.endsWith('/service_overview_instances/detailed_statistics')) return EMPTY_STATS;
      if (endpoint.endsWith('/dependencies')) return { serviceDependencies: [] };
      return {};
    },
    () => EMPTY_STATS
  ),
};
