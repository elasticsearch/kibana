/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import type { ServiceMapAttachmentData } from '../../../../common/agent_builder/attachments';
import { AgentServiceMap } from '../agent_service_map';

/**
 * Stories for `AgentServiceMap`, the renderer used by the Agent Builder
 * `observability.service-map` attachment. They exercise the same
 * code path the LLM ends up driving — but with hand-crafted `connections`
 * data, so no LLM connector, agent, or APM index data is required.
 *
 * The Agent Builder attachment intentionally renders without the providers
 * the main Service Map relies on (`ServiceMapSloFlyoutProvider`,
 * `ServiceMapAlertsNavigateProvider`, search context), so these stories
 * also verify the shared `ServiceNode` degrades gracefully without them.
 */

const meta: Meta<typeof AgentServiceMap> = {
  title: 'app/AgentBuilder/AgentServiceMap',
  component: AgentServiceMap,
  decorators: [
    (Story) => (
      <div
        style={{
          width: 700,
          height: 480,
          border: '1px solid var(--euiColorLightShade, #d3dae6)',
          borderRadius: 4,
        }}
      >
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof AgentServiceMap>;

const basicConnections: ServiceMapAttachmentData['connections'] = [
  {
    source: { 'service.name': 'frontend', 'agent.name': 'nodejs' },
    target: { 'service.name': 'checkout', 'agent.name': 'java' },
    metrics: { latencyMs: 142, throughputPerMin: 38.4, errorRate: 0.02 },
  },
  {
    source: { 'service.name': 'frontend', 'agent.name': 'nodejs' },
    target: { 'service.name': 'recommendation', 'agent.name': 'python' },
    metrics: { latencyMs: 78, throughputPerMin: 12.1 },
  },
];

const withExternalDependencies: ServiceMapAttachmentData['connections'] = [
  ...basicConnections,
  {
    source: { 'service.name': 'checkout', 'agent.name': 'java' },
    target: {
      'span.destination.service.resource': 'postgres:5432',
      'span.type': 'db',
      'span.subtype': 'postgresql',
    },
    metrics: { latencyMs: 8, throughputPerMin: 250 },
  },
  {
    source: { 'service.name': 'recommendation', 'agent.name': 'python' },
    target: {
      'span.destination.service.resource': 'redis:6379',
      'span.type': 'cache',
      'span.subtype': 'redis',
    },
    metrics: { latencyMs: 2, throughputPerMin: 500 },
  },
];

const longLabels: ServiceMapAttachmentData['connections'] = [
  {
    source: {
      'service.name': 'very-long-frontend-service-name-that-might-need-truncation',
      'agent.name': 'nodejs',
    },
    target: {
      'service.name': 'another-rather-long-backend-service-name-with-many-words',
      'agent.name': 'java',
    },
    metrics: { latencyMs: 1234, throughputPerMin: 1500.5, errorRate: 0.085 },
  },
];

const missingAgentName: ServiceMapAttachmentData['connections'] = [
  {
    source: { 'service.name': 'frontend', 'agent.name': 'nodejs' },
    target: { 'service.name': 'unknown-service' },
    metrics: { latencyMs: 50, throughputPerMin: 5 },
  },
];

const noMetrics: ServiceMapAttachmentData['connections'] = [
  {
    source: { 'service.name': 'frontend', 'agent.name': 'nodejs' },
    target: { 'service.name': 'checkout', 'agent.name': 'java' },
  },
];

const singleService: ServiceMapAttachmentData['connections'] = [
  {
    source: { 'service.name': 'lonely-service', 'agent.name': 'go' },
    target: {
      'span.destination.service.resource': 'kafka:9092',
      'span.type': 'messaging',
      'span.subtype': 'kafka',
    },
  },
];

/** Service nodes with alert count and SLO status badges (via nodeMetadata) */
const withBadgesConnections: ServiceMapAttachmentData['connections'] = [
  {
    source: { 'service.name': 'payment', 'agent.name': 'java' },
    target: { 'service.name': 'checkout', 'agent.name': 'nodejs' },
    metrics: { latencyMs: 450, errorRate: 0.12, throughputPerMin: 50 },
  },
  {
    source: { 'service.name': 'checkout', 'agent.name': 'nodejs' },
    target: {
      'span.destination.service.resource': 'postgres:5432',
      'span.type': 'db',
      'span.subtype': 'postgresql',
    },
    metrics: { latencyMs: 25 },
  },
];

const withBadgesNodeMetadata: ServiceMapAttachmentData['nodeMetadata'] = {
  payment: { alertsCount: 3, sloStatus: 'violated', sloCount: 2 },
  checkout: { alertsCount: 1, sloStatus: 'degrading', sloCount: 1 },
};

export const Basic: Story = {
  args: { connections: basicConnections },
};

export const WithExternalDependencies: Story = {
  args: { connections: withExternalDependencies },
};

export const LongServiceNames: Story = {
  args: { connections: longLabels },
};

export const MissingAgentName: Story = {
  args: { connections: missingAgentName },
};

export const NoMetrics: Story = {
  args: { connections: noMetrics },
};

export const SingleServiceWithExternalDependency: Story = {
  args: { connections: singleService },
};

/** Nodes with alert count and SLO violation/degrading badges (via nodeMetadata). */
export const WithAlertAndSloBadges: Story = {
  args: { connections: withBadgesConnections, nodeMetadata: withBadgesNodeMetadata },
};
