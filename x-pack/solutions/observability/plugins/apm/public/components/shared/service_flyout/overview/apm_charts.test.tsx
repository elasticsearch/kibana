/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { LatencyAggregationType } from '../../../../../common/latency_aggregation_types';
import { ServiceFlyoutApmCharts } from './apm_charts';

jest.mock('../../../../context/apm_plugin/use_apm_plugin_context', () => ({
  useApmPluginContext: () => ({
    core: {
      uiSettings: { get: jest.fn().mockReturnValue('Browser') },
    },
  }),
}));

const mockLatencyChart = jest.fn();
const mockThroughputChart = jest.fn();
const mockFailedTransactionChart = jest.fn();

jest.mock('../../../alerting/ui_components/alert_details_app_section/latency_chart', () => {
  const ReactActual = jest.requireActual('react');
  const { useHistory } = jest.requireActual('react-router-dom');
  return {
    LatencyChart: (props: unknown) => {
      mockLatencyChart(props as never);
      const history = useHistory();
      return ReactActual.createElement('button', {
        'data-test-subj': 'latencyChartMock',
        onClick: () =>
          history.push({
            search: 'rangeFrom=2024-01-01T00:00:00.000Z&rangeTo=2024-01-02T00:00:00.000Z',
          }),
      });
    },
  };
});

jest.mock('../../../alerting/ui_components/alert_details_app_section/throughput_chart', () => ({
  ThroughputChart: (props: unknown) => {
    mockThroughputChart(props as never);
    return <div data-test-subj="throughputChartMock" />;
  },
}));

jest.mock(
  '../../../alerting/ui_components/alert_details_app_section/failed_transaction_chart',
  () => ({
    FailedTransactionChart: (props: unknown) => {
      mockFailedTransactionChart(props as never);
      return <div data-test-subj="failedTransactionChartMock" />;
    },
  })
);

const onRangeChange = jest.fn();

const defaultProps = {
  latencyAggregationType: LatencyAggregationType.p95,
  setLatencyAggregationType: jest.fn(),
  serviceName: 'opbeans-java',
  environment: 'production',
  rangeFrom: 'now-15m',
  rangeTo: 'now',
  transactionType: 'request',
  onRangeChange,
};

function renderCharts(overrides: Partial<typeof defaultProps> = {}) {
  return render(
    <IntlProvider locale="en">
      <ServiceFlyoutApmCharts {...defaultProps} {...overrides} />
    </IntlProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ServiceFlyoutApmCharts', () => {
  it('renders the latency, failed transaction rate and throughput charts', () => {
    renderCharts();

    expect(screen.getByTestId('latencyChartMock')).toBeInTheDocument();
    expect(screen.getByTestId('failedTransactionChartMock')).toBeInTheDocument();
    expect(screen.getByTestId('throughputChartMock')).toBeInTheDocument();
  });

  it('uses flyout-specific chart ids so the flyout tooltip z-index override does not hide them', () => {
    renderCharts();

    expect(mockLatencyChart).toHaveBeenCalledWith(
      expect.objectContaining({ chartId: 'serviceFlyoutLatencyChart' })
    );
    expect(mockFailedTransactionChart).toHaveBeenCalledWith(
      expect.objectContaining({ chartId: 'serviceFlyoutErrorRate' })
    );
    expect(mockThroughputChart).toHaveBeenCalledWith(
      expect.objectContaining({ chartId: 'serviceFlyoutThroughput' })
    );
  });

  it('passes the flyout query scope to every chart without alert annotations', () => {
    renderCharts();

    [mockLatencyChart, mockThroughputChart, mockFailedTransactionChart].forEach((chart) => {
      expect(chart).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceName: 'opbeans-java',
          environment: 'production',
          transactionType: 'request',
          comparisonEnabled: false,
          offset: '',
          showAlertAnnotations: false,
          showChartActions: false,
          panelPaddingSize: 's',
          // synced crosshair stays, but sibling tooltips would overlap in the
          // narrow flyout columns
          chartSettings: { externalPointerEvents: { tooltip: { visible: false } } },
        })
      );
      const props = chart.mock.calls[0][0] as { alert?: unknown; start: string; end: string };
      expect(props.alert).toBeUndefined();
      // absolute timestamps resolved from the relative flyout range
      expect(props.start).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(props.end).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  it('forwards the latency aggregation type and its setter to the latency chart only', () => {
    renderCharts();

    expect(mockLatencyChart).toHaveBeenCalledWith(
      expect.objectContaining({
        latencyAggregationType: LatencyAggregationType.p95,
        setLatencyAggregationType: expect.any(Function),
      })
    );
    expect(mockThroughputChart).toHaveBeenCalledWith(
      expect.not.objectContaining({ latencyAggregationType: expect.anything() })
    );
  });

  it('translates chart brushes into the flyout time range instead of a URL change', () => {
    renderCharts();

    fireEvent.click(screen.getByTestId('latencyChartMock'));

    expect(onRangeChange).toHaveBeenCalledWith({
      rangeFrom: '2024-01-01T00:00:00.000Z',
      rangeTo: '2024-01-02T00:00:00.000Z',
    });
  });
});
