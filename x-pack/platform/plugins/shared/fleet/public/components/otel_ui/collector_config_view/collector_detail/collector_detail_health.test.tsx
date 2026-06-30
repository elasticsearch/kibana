/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import type { TestRenderer } from '../../../../mock';
import { createFleetTestRendererMock } from '../../../../mock';
import type { ComponentHealth, OTelCollectorConfig } from '../../../../../common/types';

import { CollectorDetailHealth } from './collector_detail_health';

const config: OTelCollectorConfig = {
  receivers: { otlp: {} },
  processors: { batch: {} },
  exporters: { 'elasticsearch/default': {} },
  service: {
    pipelines: {
      'logs/default': {
        receivers: ['otlp'],
        processors: ['batch'],
        exporters: ['elasticsearch/default'],
      },
    },
  },
};

const onlineHealth: ComponentHealth = {
  healthy: true,
  status: 'StatusOK',
  status_time_unix_nano: 1777926000000000000,
};

describe('CollectorDetailHealth', () => {
  let testRenderer: TestRenderer;

  beforeEach(() => {
    testRenderer = createFleetTestRendererMock();
  });

  it('renders no-data message when health is undefined', () => {
    const result = testRenderer.render(<CollectorDetailHealth />);
    expect(result.getByTestId('collectorDetailHealthNoData')).toBeInTheDocument();
  });

  it.each(['offline', 'inactive', 'unenrolled', 'uninstalled'] as const)(
    'shows offline callout and hides health data when agentStatus is %s',
    (status) => {
      const result = testRenderer.render(
        <CollectorDetailHealth health={onlineHealth} agentStatus={status} />
      );
      expect(result.getByTestId('collectorDetailHealthOffline')).toBeInTheDocument();
      expect(result.queryByTestId('collectorDetailHealth')).not.toBeInTheDocument();
      expect(result.queryByText('Healthy')).not.toBeInTheDocument();
    }
  );

  it('does not show offline callout when agentStatus is online', () => {
    const result = testRenderer.render(
      <CollectorDetailHealth health={onlineHealth} agentStatus="online" />
    );
    expect(result.queryByTestId('collectorDetailHealthOffline')).not.toBeInTheDocument();
    expect(result.getByTestId('collectorDetailHealth')).toBeInTheDocument();
  });

  it('renders healthy status', () => {
    const health: ComponentHealth = {
      healthy: true,
      status: 'StatusOK',
      status_time_unix_nano: 1777926000000000000,
      component_health_map: {
        'receiver:otlp': { healthy: true, status: 'StatusOK' },
        'processor:batch': { healthy: true, status: 'StatusOK' },
      },
    };

    const result = testRenderer.render(<CollectorDetailHealth health={health} />);
    const panel = result.getByTestId('collectorDetailHealth');
    expect(panel).toBeInTheDocument();
    expect(panel.textContent).toContain('Healthy');
  });

  it('renders unhealthy status with error', () => {
    const health: ComponentHealth = {
      healthy: false,
      status: 'StatusRecoverableError',
      status_time_unix_nano: 1777925000000000000,
      last_error: 'connection refused',
      component_health_map: {
        'receiver:otlp': { healthy: true, status: 'StatusOK' },
        'exporter:elasticsearch/default': {
          healthy: false,
          status: 'StatusRecoverableError',
          last_error: 'connection refused',
        },
      },
    };

    const result = testRenderer.render(<CollectorDetailHealth health={health} />);
    const panel = result.getByTestId('collectorDetailHealth');
    expect(panel.textContent).toContain('Unhealthy');
    expect(panel.textContent).toContain('connection refused');
  });

  it('resolves connector health when an exporter id appears in config.connectors', () => {
    const connectorConfig: OTelCollectorConfig = {
      receivers: { otlp: {} },
      processors: { batch: {} },
      connectors: { 'forward/connector': {} },
      exporters: { 'elasticsearch/default': {} },
      service: {
        pipelines: {
          'logs/default': {
            receivers: ['otlp'],
            processors: ['batch'],
            exporters: ['forward/connector'],
          },
        },
      },
    };

    const health: ComponentHealth = {
      healthy: true,
      status: 'StatusOK',
      component_health_map: {
        'pipeline:logs/default': {
          healthy: true,
          status: 'StatusOK',
          component_health_map: {
            'receiver:otlp': { healthy: true, status: 'StatusOK' },
            'processor:batch': { healthy: true, status: 'StatusOK' },
            // health is keyed as connector, not exporter
            'connector:forward/connector': { healthy: true, status: 'StatusOK' },
          },
        },
      },
    };

    const result = testRenderer.render(
      <CollectorDetailHealth health={health} config={connectorConfig} />
    );

    const pipeline = result.getByTestId('collectorHealthPipeline-logs/default');
    expect(pipeline.textContent).toContain('3 healthy');
  });

  it('renders pipeline component breakdown when config is provided', () => {
    const health: ComponentHealth = {
      healthy: true,
      status: 'StatusOK',
      component_health_map: {
        'pipeline:logs/default': {
          healthy: true,
          status: 'StatusOK',
          component_health_map: {
            'receiver:otlp': { healthy: true, status: 'StatusOK' },
            'processor:batch': { healthy: true, status: 'StatusOK' },
            'exporter:elasticsearch/default': { healthy: true, status: 'StatusOK' },
          },
        },
      },
    };

    const result = testRenderer.render(<CollectorDetailHealth health={health} config={config} />);
    expect(result.getByText('Component health')).toBeInTheDocument();
    expect(result.getByTestId('collectorHealthPipeline-logs/default')).toBeInTheDocument();
  });
});
