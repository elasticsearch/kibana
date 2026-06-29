/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { StoryFn, Meta } from '@storybook/react';
import React from 'react';
import { ServiceInventory } from '.';
import { AnomalyDetectionSetupState } from '../../../../common/anomaly_detection/get_anomaly_detection_setup_state';
import { AnomalyDetectionJobsContext } from '../../../context/anomaly_detection_jobs/anomaly_detection_jobs_context';
import { FETCH_STATUS } from '../../../hooks/use_fetcher';
import {
  opbeansScenario,
  SCENARIO_START,
  SCENARIO_END,
  toServiceInventoryResponse,
  toDetailedStatisticsResponse,
  TIME_RANGE_METADATA_DEFAULTS,
  APM_STORY_A11Y,
  makeApmContextParams,
} from '../../../test_helpers/synthtrace_stories';

const anomalyDetectionJobsContextValue = {
  anomalyDetectionJobsData: { jobs: [], hasLegacyJobs: false },
  anomalyDetectionJobsStatus: FETCH_STATUS.SUCCESS,
  anomalyDetectionJobsRefetch: () => {},
  anomalyDetectionSetupState: AnomalyDetectionSetupState.NoJobs,
};

const stories: Meta<{}> = {
  title: 'app/ServiceInventory',
  component: ServiceInventory,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Service inventory table listing all APM-instrumented services with latency, ' +
          'throughput, and error-rate metrics. The `SynthtraceGenerated` story derives its ' +
          'data from the shared `opbeansScenario()` — no Elasticsearch required.',
      },
    },
    a11y: APM_STORY_A11Y,
  },
};
export default stories;

export const EmptyState: StoryFn<{}> = () => {
  return <ServiceInventory />;
};

EmptyState.parameters = {
  routePath: '/services?rangeFrom=now-15m&rangeTo=now&comparisonEnabled=true&offset=1d',
  ...makeApmContextParams((endpoint) => {
    if (endpoint === '/internal/apm/time_range_metadata') return TIME_RANGE_METADATA_DEFAULTS;
    if (endpoint === '/internal/apm/services') return { items: [] };
    if (endpoint === '/internal/apm/sorted_and_filtered_services') return { services: [] };
    return {};
  }),
};

EmptyState.decorators = [
  (StoryComponent) => (
    <AnomalyDetectionJobsContext.Provider value={anomalyDetectionJobsContextValue}>
      <StoryComponent />
    </AnomalyDetectionJobsContext.Provider>
  ),
];

// Synthtrace-derived metrics augmented with alert/SLO/anomaly data for all columns.
const _docs = opbeansScenario();
const { items: _baseItems, ...rest } = toServiceInventoryResponse(_docs);

const _ENRICHMENTS: Record<string, object> = {
  'opbeans-node': { alertsCount: 3, sloStatus: 'violated', sloCount: 1, anomalyScore: 82 },
  'opbeans-java': { alertsCount: 1, sloStatus: 'degrading', sloCount: 2, anomalyScore: 55 },
  'opbeans-go': { sloStatus: 'healthy', sloCount: 3, anomalyScore: 27 },
  'opbeans-python': { sloStatus: 'noData', sloCount: 1, anomalyScore: 5 },
};

const _enrichedInventory = {
  ...rest,
  items: _baseItems.map((item) => ({ ...item, ...(_ENRICHMENTS[item.serviceName] ?? {}) })),
};

export const WithData: StoryFn<{}> = () => {
  return <ServiceInventory />;
};

WithData.storyName = 'With Data (Alerts + SLOs + Anomalies)';

WithData.parameters = {
  routePath: `/services?rangeFrom=${SCENARIO_START.toISOString()}&rangeTo=${SCENARIO_END.toISOString()}`,
  ...makeApmContextParams(
    (endpoint) => {
      if (endpoint === '/internal/apm/time_range_metadata') return TIME_RANGE_METADATA_DEFAULTS;
      if (endpoint === '/internal/apm/services') return _enrichedInventory;
      return {};
    },
    (endpoint) => {
      if (endpoint === '/internal/apm/services/detailed_statistics')
        return toDetailedStatisticsResponse(_docs);
      return { currentPeriod: {}, previousPeriod: {} };
    }
  ),
};

WithData.decorators = [
  (StoryComponent) => (
    <AnomalyDetectionJobsContext.Provider value={anomalyDetectionJobsContextValue}>
      <StoryComponent />
    </AnomalyDetectionJobsContext.Provider>
  ),
];
