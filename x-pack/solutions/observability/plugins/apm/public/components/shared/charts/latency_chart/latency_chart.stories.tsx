/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { StoryObj, Meta } from '@storybook/react';
import React from 'react';
import { LatencyChart } from '.';
import type { Props } from '.';
import type { APMServiceContextValue } from '../../../../context/apm_service/apm_service_context';
import { APMServiceContext } from '../../../../context/apm_service/apm_service_context';
import { ChartPointerEventContextProvider } from '../../../../context/chart_pointer_event/chart_pointer_event_context';
import { FETCH_STATUS } from '../../../../hooks/use_fetcher';
import { createCallApmApi } from '../../../../services/rest/create_call_apm_api';
import type { APIReturnType } from '../../../../services/rest/create_call_apm_api';
import {
  opbeansScenario,
  toLatencyChartResponse,
  SCENARIO_START,
  SCENARIO_END,
  TIME_RANGE_METADATA_DEFAULTS,
  APM_STORY_A11Y,
} from '../../../../test_helpers/synthtrace_stories';

const OPBEANS_SERVICES = [
  'opbeans-node',
  'opbeans-go',
  'opbeans-java',
  'opbeans-python',
  'opbeans-dotnet',
] as const;

interface Args extends Props {
  serviceName?: (typeof OPBEANS_SERVICES)[number] | string;
  latencyChartResponse?: APIReturnType<'GET /internal/apm/services/{serviceName}/transactions/charts/latency'>;
}

const stories: Meta<Args> = {
  title: 'shared/charts/LatencyChart',
  component: LatencyChart,
  tags: ['autodocs'],
  parameters: {
    routePath: `/services/opbeans-node/overview?environment=ENVIRONMENT_ALL&kuery=&rangeFrom=${SCENARIO_START.toISOString()}&rangeTo=${SCENARIO_END.toISOString()}&transactionType=request&comparisonEnabled=false&latencyAggregationType=avg`,
    docs: {
      description: {
        component:
          'Latency-over-time chart for a single APM service. Renders a time-series line from ' +
          'the `GET .../transactions/charts/latency` endpoint. Use the **serviceName** control ' +
          'to switch between opbeans services and see how latency profiles differ.',
      },
    },
    a11y: APM_STORY_A11Y,
  },
  argTypes: {
    serviceName: {
      control: 'select',
      options: OPBEANS_SERVICES,
      description:
        'Pick an opbeans service from the shared synthtrace scenario. The chart re-renders ' +
        "with that service's latency data (derived from in-memory synthtrace docs).",
    },
    latencyChartResponse: {
      control: { type: 'object' },
      description:
        'Advanced override: supply the full latency chart API response directly. ' +
        'When `serviceName` is set this field is ignored.',
    },
  },
  decorators: [
    (StoryComponent, { args }) => {
      const { serviceName, latencyChartResponse } = args as Args;

      // latencyChartResponse (explicit story override) wins; serviceName is the interactive default
      const response =
        latencyChartResponse !== undefined
          ? latencyChartResponse
          : serviceName
          ? toLatencyChartResponse(opbeansScenario(), serviceName)
          : undefined;

      const contextServiceName = serviceName ?? 'opbeans-node';

      createCallApmApi({
        http: {
          get: async (pathname: string) => {
            if (pathname === '/internal/apm/time_range_metadata')
              return TIME_RANGE_METADATA_DEFAULTS;
            if (pathname.endsWith('/transactions/charts/latency')) return response;
            return {};
          },
        },
      } as any);

      const serviceContextValue = {
        serviceName: contextServiceName,
        agentName: 'nodejs',
        transactionType: 'request',
        transactionTypeStatus: FETCH_STATUS.SUCCESS,
        transactionTypes: ['request'],
        fallbackToTransactions: false,
        serviceAgentStatus: FETCH_STATUS.SUCCESS,
      } as unknown as APMServiceContextValue;

      return (
        <APMServiceContext.Provider value={serviceContextValue}>
          <ChartPointerEventContextProvider>
            <StoryComponent />
          </ChartPointerEventContextProvider>
        </APMServiceContext.Provider>
      );
    },
  ],
};

export default stories;

export const Example: StoryObj<Args> = {
  render: () => <LatencyChart height={300} kuery="" />,
  args: { serviceName: 'opbeans-node' },
};

export const NoData: StoryObj<Args> = {
  render: () => <LatencyChart height={300} kuery="" />,
  args: {
    latencyChartResponse: {
      currentPeriod: { latencyTimeseries: [], overallAvgDuration: null },
      previousPeriod: { latencyTimeseries: [], overallAvgDuration: null },
    },
  },
};
