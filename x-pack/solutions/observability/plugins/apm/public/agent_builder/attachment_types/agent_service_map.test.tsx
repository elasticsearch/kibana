/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import type { ServiceMapAttachmentData } from '../../../common/agent_builder/attachments';
import { MOCK_EUI_THEME_FOR_USE_THEME } from '../../components/shared/service_map/test_helpers';
import { AgentServiceMap, formatEdgeLabel } from './agent_service_map';

jest.mock('@elastic/eui', () => {
  const original = jest.requireActual('@elastic/eui');
  return {
    ...original,
    useEuiTheme: () => ({
      euiTheme: MOCK_EUI_THEME_FOR_USE_THEME,
      colorMode: 'LIGHT',
    }),
  };
});

jest.mock('@kbn/apm-ui-shared', () => ({
  getSpanIcon: jest.fn((type?: string) => (type ? 'mock-span-icon.svg' : undefined)),
}));

jest.mock('../../components/shared/service_map/layout', () => ({
  applyDagreLayout: (nodes: unknown[]) => nodes,
}));

function createConnections(
  overrides: Partial<ServiceMapAttachmentData['connections'][0]>[] = []
): ServiceMapAttachmentData['connections'] {
  const defaults: ServiceMapAttachmentData['connections'] = [
    {
      source: { 'service.name': 'frontend', 'agent.name': 'nodejs' },
      target: { 'service.name': 'backend', 'agent.name': 'java' },
      metrics: { latencyMs: 150, throughputPerMin: 42.5, errorRate: 0.02 },
    },
    {
      source: { 'service.name': 'backend', 'agent.name': 'java' },
      target: {
        'span.destination.service.resource': 'postgresql:5432',
        'span.type': 'db',
        'span.subtype': 'postgresql',
      },
      metrics: { latencyMs: 5, throughputPerMin: 100 },
    },
  ];

  if (overrides.length > 0) {
    return overrides.map((override, i) => ({
      ...defaults[i % defaults.length],
      ...override,
    }));
  }
  return defaults;
}

// ─── Alert/SLO badge data ────────────────────────────────────────────────────

function createConnectionsWithBadges(): {
  connections: ServiceMapAttachmentData['connections'];
  nodeMetadata: ServiceMapAttachmentData['nodeMetadata'];
} {
  return {
    connections: [
      {
        source: { 'service.name': 'payment', 'agent.name': 'java' },
        target: { 'service.name': 'database', 'agent.name': 'go' },
        metrics: { latencyMs: 500 },
      },
    ],
    nodeMetadata: {
      payment: { alertsCount: 3, sloStatus: 'violated', sloCount: 2 },
    },
  };
}

describe('AgentServiceMap', () => {
  it('renders service nodes with labels', () => {
    render(<AgentServiceMap connections={createConnections()} />);
    expect(screen.getByText('frontend')).toBeInTheDocument();
    expect(screen.getByText('backend')).toBeInTheDocument();
  });

  it('renders dependency nodes with labels', () => {
    render(<AgentServiceMap connections={createConnections()} />);
    expect(screen.getByText('postgresql:5432')).toBeInTheDocument();
  });

  it('deduplicates nodes that appear in multiple connections', () => {
    render(<AgentServiceMap connections={createConnections()} />);
    // 'backend' appears as target in connection 1 and source in connection 2
    const backendLabels = screen.getAllByText('backend');
    expect(backendLabels).toHaveLength(1);
  });

  it('renders with empty connections', () => {
    const { container } = render(<AgentServiceMap connections={[]} />);
    expect(container.querySelector('.react-flow')).toBeInTheDocument();
  });

  it('renders no edge label when metrics are undefined', () => {
    const connections = createConnections([
      {
        source: { 'service.name': 'a' },
        target: { 'service.name': 'b' },
        metrics: undefined,
      },
    ]);
    render(<AgentServiceMap connections={connections} />);
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();
  });

  it('renders alert badge when nodeMetadata provides alertsCount > 0', () => {
    const { connections, nodeMetadata } = createConnectionsWithBadges();
    render(<AgentServiceMap connections={connections} nodeMetadata={nodeMetadata} />);
    // ServiceNode renders data-test-subj="serviceMapNodeAlertsBadge" for alert count
    expect(screen.getByTestId('serviceMapNodeAlertsBadge')).toBeInTheDocument();
  });

  it('does not render alert badge when nodeMetadata is absent', () => {
    render(<AgentServiceMap connections={createConnections()} />);
    expect(screen.queryByTestId('serviceMapNodeAlertsBadge')).not.toBeInTheDocument();
  });

  it('shows alert badge count from nodeMetadata, not from connection node', () => {
    const { connections, nodeMetadata } = createConnectionsWithBadges();
    render(<AgentServiceMap connections={connections} nodeMetadata={nodeMetadata} />);
    const badge = screen.getByTestId('serviceMapNodeAlertsBadge');
    // The badge text is the count — "3" in our fixture
    expect(badge).toHaveTextContent('3');
  });

  it('applies nodeMetadata to the correct service node when multiple services exist', () => {
    const { connections, nodeMetadata } = createConnectionsWithBadges();
    // "database" service has no metadata — should NOT get a badge
    render(<AgentServiceMap connections={connections} nodeMetadata={nodeMetadata} />);
    // Only one alert badge — for "payment", not for "database"
    expect(screen.getAllByTestId('serviceMapNodeAlertsBadge')).toHaveLength(1);
  });
});

describe('formatEdgeLabel', () => {
  it('formats all metrics', () => {
    expect(formatEdgeLabel({ latencyMs: 150, throughputPerMin: 42.5, errorRate: 0.02 })).toBe(
      '150 ms · 42.5 tpm · 2.0% err'
    );
  });

  it('formats latency in seconds when >= 1000ms', () => {
    expect(formatEdgeLabel({ latencyMs: 2500 })).toBe('2.5 s');
  });

  it('formats latency in milliseconds when < 1000ms', () => {
    expect(formatEdgeLabel({ latencyMs: 45 })).toBe('45 ms');
  });

  it('rounds milliseconds to nearest integer', () => {
    expect(formatEdgeLabel({ latencyMs: 3.7 })).toBe('4 ms');
  });

  it('omits error rate when zero', () => {
    expect(formatEdgeLabel({ latencyMs: 10, throughputPerMin: 5, errorRate: 0 })).toBe(
      '10 ms · 5.0 tpm'
    );
  });

  it('includes error rate when non-zero', () => {
    expect(formatEdgeLabel({ errorRate: 0.15 })).toBe('15.0% err');
  });

  it('returns undefined when metrics are undefined', () => {
    expect(formatEdgeLabel(undefined)).toBeUndefined();
  });

  it('returns undefined when metrics object has no values', () => {
    expect(formatEdgeLabel({})).toBeUndefined();
  });

  it('formats throughput only', () => {
    expect(formatEdgeLabel({ throughputPerMin: 100 })).toBe('100.0 tpm');
  });
});
