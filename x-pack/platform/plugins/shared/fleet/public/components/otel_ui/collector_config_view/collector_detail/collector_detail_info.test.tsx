/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import type { TestRenderer } from '../../../../mock';
import { createFleetTestRendererMock } from '../../../../mock';
import type { Agent, OTelCollectorConfig } from '../../../../../common/types';

import { CollectorDetailInfo } from './collector_detail_info';

const makeAgent = (overrides?: Partial<Agent>): Agent =>
  ({
    id: 'opamp-collector-001',
    type: 'OPAMP',
    active: true,
    enrolled_at: '2026-04-01T10:00:00Z',
    local_metadata: {
      host: { hostname: 'collector-prod-west-1' },
    },
    status: 'online',
    packages: [],
    identifying_attributes: {
      'service.name': 'otel-gateway',
      'service.version': '0.104.0',
    },
    non_identifying_attributes: {
      'elastic.display.name': 'prod-west-gateway',
      'host.arch': 'x86_64',
      'os.type': 'linux',
      'os.description': 'Ubuntu 22.04.4 LTS',
      'elastic.collector.group': 'production-west',
    },
    capabilities: ['logs', 'metrics', 'traces'],
    ...overrides,
  } as Agent);

const config: OTelCollectorConfig = {
  service: {
    pipelines: {
      traces: { receivers: ['otlp'], processors: ['batch'], exporters: ['elasticsearch/otel'] },
      logs: { receivers: ['otlp'], processors: ['batch'], exporters: ['elasticsearch/otel'] },
    },
  },
};

describe('CollectorDetailInfo', () => {
  let testRenderer: TestRenderer;

  beforeEach(() => {
    testRenderer = createFleetTestRendererMock();
  });

  it('renders agent metadata fields', () => {
    const result = testRenderer.render(<CollectorDetailInfo agent={makeAgent()} config={config} />);
    const panel = result.getByTestId('collectorDetailInfo');

    expect(panel.textContent).toContain('prod-west-gateway');
    expect(panel.textContent).toContain('opamp-collector-001');
    expect(panel.textContent).toContain('otel-gateway');
    expect(panel.textContent).toContain('0.104.0');
    expect(panel.textContent).toContain('collector-prod-west-1');
    expect(panel.textContent).toContain('x86_64');
    expect(panel.textContent).toContain('linux');
    expect(panel.textContent).toContain('Ubuntu 22.04.4 LTS');
    expect(panel.textContent).toContain('production-west');
    expect(panel.textContent).toContain('logs, metrics, traces');
  });

  it('renders pipeline count from config', () => {
    const result = testRenderer.render(<CollectorDetailInfo agent={makeAgent()} config={config} />);
    const panel = result.getByTestId('collectorDetailInfo');
    expect(panel.textContent).toContain('2');
  });

  it('renders dashes for missing optional fields', () => {
    const result = testRenderer.render(
      <CollectorDetailInfo
        agent={makeAgent({
          identifying_attributes: undefined,
          non_identifying_attributes: undefined,
          capabilities: undefined,
        })}
      />
    );
    const panel = result.getByTestId('collectorDetailInfo');
    const dashes = panel.textContent?.match(/-/g) ?? [];
    expect(dashes.length).toBeGreaterThanOrEqual(5);
  });
});
