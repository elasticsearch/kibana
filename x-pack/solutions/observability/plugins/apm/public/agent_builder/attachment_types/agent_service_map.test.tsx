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
});

describe('AgentServiceMap with nodeMetadata', () => {
  it('passes alertsCount from nodeMetadata to the service node', () => {
    render(
      <AgentServiceMap
        connections={createConnections()}
        nodeMetadata={{
          frontend: { alertsCount: 3 },
        }}
      />
    );
    // AlertsBadge renders the count as text; ServiceNode shows it when alertsCount > 0
    expect(screen.getByTestId('serviceMapNodeAlertsBadge')).toBeInTheDocument();
  });

  it('does not show alert badge when alertsCount is zero', () => {
    render(
      <AgentServiceMap
        connections={createConnections()}
        nodeMetadata={{
          frontend: { alertsCount: 0 },
        }}
      />
    );
    expect(screen.queryByTestId('serviceMapNodeAlertsBadge')).not.toBeInTheDocument();
  });

  it('renders without error when nodeMetadata is undefined (backward-compatible)', () => {
    render(<AgentServiceMap connections={createConnections()} />);
    expect(screen.getByText('frontend')).toBeInTheDocument();
    expect(screen.getByText('backend')).toBeInTheDocument();
  });

  it('ignores nodeMetadata for dependency (external) nodes', () => {
    // Dependency nodes don't have a service name; metadata keyed by their resource name is a no-op
    render(
      <AgentServiceMap
        connections={createConnections()}
        nodeMetadata={
          {
            'postgresql:5432': { alertsCount: 5 },
          } as Record<string, { alertsCount: number }>
        }
      />
    );
    // No alert badge expected because dependency nodes never render one
    expect(screen.queryByTestId('serviceMapNodeAlertsBadge')).not.toBeInTheDocument();
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
