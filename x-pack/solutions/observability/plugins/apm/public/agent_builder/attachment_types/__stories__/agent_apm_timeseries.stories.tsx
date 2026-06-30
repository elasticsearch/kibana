/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import type { ApmTimeseriesAttachmentData } from '../../../../common/agent_builder/attachments';
import { AgentApmTimeseries } from '../agent_apm_timeseries';

/**
 * Stories for `AgentApmTimeseries`, the renderer used by the Agent Builder
 * `observability.apm-timeseries` attachment. They exercise the chart with
 * hand-crafted time series data — no APM index or LLM connector required.
 */

const meta: Meta<typeof AgentApmTimeseries> = {
  title: 'app/AgentBuilder/AgentApmTimeseries',
  component: AgentApmTimeseries,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 800, padding: 16 }}>
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof AgentApmTimeseries>;

// Helper: generate a monotonically increasing time range starting from a given
// epoch and stepping by `stepMs` for `count` points.
function makePoints(
  startMs: number,
  stepMs: number,
  values: Array<number | null>
): ApmTimeseriesAttachmentData['dataPoints'] {
  return values.map((value, i) => ({ timestamp: startMs + i * stepMs, value }));
}

const NOW = 1_720_000_000_000; // fixed epoch for deterministic stories
const STEP = 60_000; // 1-minute buckets

// Latency spike: normal → spike → recovering
const latencyValues: Array<number | null> = [
  180, 190, 175, 185, 200, 210, 350, 800, 1200, 950, 700, 450, 300, 220, 190,
];

// Error rate (0–100 %): mostly low, brief burst
const errorRateValues: Array<number | null> = [1, 1, 2, 1, 5, 12, 18, 25, 20, 10, 3, 1, 1];

// Throughput: stable
const throughputValues: Array<number | null> = [
  120, 118, 122, 119, 125, 115, 110, 100, 95, 105, 115, 120, 122, 118, 120,
];

// Sparse data: nulls in the middle
const sparseValues: Array<number | null> = [
  null,
  null,
  200,
  210,
  null,
  null,
  250,
  240,
  null,
  230,
  null,
  null,
];

// All null — should trigger the "no data" fallback
const allNullValues: Array<number | null> = Array(10).fill(null);

const alertStart = NOW + 7 * STEP;

export const LatencyWithThreshold: Story = {
  args: {
    data: {
      serviceName: 'payment',
      metric: 'latency',
      unit: 'ms',
      dataPoints: makePoints(NOW, STEP, latencyValues),
      threshold: 500,
      alertStart,
    } satisfies ApmTimeseriesAttachmentData,
  },
};

export const ErrorRateWithAlertWindow: Story = {
  args: {
    data: {
      serviceName: 'checkout',
      metric: 'failedTransactionRate',
      unit: '%',
      dataPoints: makePoints(NOW, STEP, errorRateValues),
      threshold: 10, // 10 % threshold — same unit as the values (0–100)
      alertStart,
    } satisfies ApmTimeseriesAttachmentData,
  },
};

export const Throughput: Story = {
  args: {
    data: {
      serviceName: 'frontend',
      metric: 'throughput',
      unit: 'rpm',
      dataPoints: makePoints(NOW, STEP, throughputValues),
    } satisfies ApmTimeseriesAttachmentData,
  },
};

/** Series with interior null gaps — should render with gaps rather than crashing. */
export const SparseData: Story = {
  args: {
    data: {
      serviceName: 'recommendation',
      metric: 'latency',
      unit: 'ms',
      dataPoints: makePoints(NOW, STEP, sparseValues),
    } satisfies ApmTimeseriesAttachmentData,
  },
};

/** All data points are null — should render the "no data" fallback message. */
export const AllNullData: Story = {
  args: {
    data: {
      serviceName: 'unknown',
      metric: 'latency',
      unit: 'ms',
      dataPoints: makePoints(NOW, STEP, allNullValues),
    } satisfies ApmTimeseriesAttachmentData,
  },
};

/** Minimal — no threshold, no alertStart, no custom title. */
export const NoOptionalFields: Story = {
  args: {
    data: {
      serviceName: 'search',
      metric: 'throughput',
      unit: 'rpm',
      dataPoints: makePoints(NOW, STEP, throughputValues),
    } satisfies ApmTimeseriesAttachmentData,
  },
};

/** Custom title overrides the default metric name. */
export const CustomTitle: Story = {
  args: {
    data: {
      serviceName: 'catalog',
      title: 'Latency spike investigation — catalog (p95)',
      metric: 'latency',
      unit: 'ms',
      dataPoints: makePoints(NOW, STEP, latencyValues),
      threshold: 400,
    } satisfies ApmTimeseriesAttachmentData,
  },
};
