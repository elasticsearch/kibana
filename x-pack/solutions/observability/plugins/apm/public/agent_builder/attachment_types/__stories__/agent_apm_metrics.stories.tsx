/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import type { ApmMetricsAttachmentData } from '../../../../common/agent_builder/attachments';
import { AgentApmMetrics } from '../agent_apm_metrics';

/**
 * Stories for `AgentApmMetrics`, the renderer used by the Agent Builder
 * `observability.apm-metrics` attachment. They exercise the card with
 * hand-crafted data — no APM index or LLM connector required.
 */

const meta: Meta<typeof AgentApmMetrics> = {
  title: 'app/AgentBuilder/AgentApmMetrics',
  component: AgentApmMetrics,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 700, padding: 16 }}>
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof AgentApmMetrics>;

const healthyData: ApmMetricsAttachmentData = {
  serviceName: 'checkout',
  environment: 'production',
  current: { latencyMs: 180, errorRate: 1.0, throughputRpm: 120 },
  baseline: { latencyMs: 200, errorRate: 2.0, throughputRpm: 110 },
};

const degradedData: ApmMetricsAttachmentData = {
  serviceName: 'payment',
  environment: 'production',
  current: { latencyMs: 450, errorRate: 12.0, throughputRpm: 50 },
  baseline: { latencyMs: 180, errorRate: 1.0, throughputRpm: 120 },
};

const noBaselineData: ApmMetricsAttachmentData = {
  serviceName: 'recommendation',
  current: { latencyMs: 95, errorRate: 0.005, throughputRpm: 300 },
};

const partialMetricsData: ApmMetricsAttachmentData = {
  serviceName: 'search',
  environment: 'staging',
  current: { latencyMs: 250 },
  baseline: { latencyMs: 200 },
};

const customTitleData: ApmMetricsAttachmentData = {
  serviceName: 'frontend',
  title: 'Alert Investigation — frontend (latency spike)',
  current: { latencyMs: 1200, errorRate: 5.0, throughputRpm: 80 },
  baseline: { latencyMs: 300, errorRate: 1.0, throughputRpm: 100 },
};

const emptyMetricsData: ApmMetricsAttachmentData = {
  serviceName: 'unknown-service',
  current: {},
};

/** Healthy: current metrics are better than baseline — all badges green. */
export const Healthy: Story = { args: { data: healthyData } };

/** Degraded: latency and errors are significantly worse than baseline. */
export const Degraded: Story = { args: { data: degradedData } };

/** No baseline: only current metrics shown, no delta badges. */
export const NoBaseline: Story = { args: { data: noBaselineData } };

/** Partial: only latency available, error rate and throughput show em-dash. */
export const PartialMetrics: Story = { args: { data: partialMetricsData } };

/** Custom title overrides the default "APM Metrics — {service}" heading. */
export const CustomTitle: Story = { args: { data: customTitleData } };

/** No metrics at all: all tiles show em-dash, no delta badges. */
export const EmptyMetrics: Story = { args: { data: emptyMetricsData } };
