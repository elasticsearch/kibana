/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { composeStories } from '@storybook/react';
import { defaultMetricTitle, trimNullEdges, unitLabel } from './agent_apm_timeseries';
import * as stories from './__stories__/agent_apm_timeseries.stories';
import { createApmTimeseriesAttachmentDefinition } from './register_apm_timeseries_attachment';

// Mock heavy chart dependencies — we only need render-without-throw checks.
jest.mock('@elastic/charts', () => ({
  Chart: ({ children }: { children: React.ReactNode }) => <div data-testid="chart">{children}</div>,
  LineSeries: () => null,
  LineAnnotation: () => null,
  RectAnnotation: () => null,
  Axis: () => null,
  Settings: () => null,
  niceTimeFormatter: () => (v: number) => String(v),
  ScaleType: { Time: 'time', Linear: 'linear' },
  Position: { Bottom: 'bottom', Left: 'left', Right: 'right' },
  CurveType: { LINEAR: 'LINEAR' },
  AnnotationDomainType: { YDomain: 'yDomain' },
}));

jest.mock('@elastic/eui', () => {
  const original = jest.requireActual('@elastic/eui');
  return {
    ...original,
    useEuiTheme: () => ({
      euiTheme: {
        size: { s: '8px', m: '16px' },
        colors: { primary: '#0077cc', danger: '#bd271e' },
      },
      colorMode: 'LIGHT',
    }),
  };
});

// ─── Pure helper unit tests ──────────────────────────────────────────────────

describe('trimNullEdges', () => {
  it('returns empty array when all null', () => {
    expect(
      trimNullEdges([
        { timestamp: 1, value: null },
        { timestamp: 2, value: null },
      ])
    ).toEqual([]);
  });

  it('strips leading nulls', () => {
    const input = [
      { timestamp: 1, value: null },
      { timestamp: 2, value: 10 },
      { timestamp: 3, value: 20 },
    ];
    expect(trimNullEdges(input)).toEqual([
      { timestamp: 2, value: 10 },
      { timestamp: 3, value: 20 },
    ]);
  });

  it('strips trailing nulls', () => {
    const input = [
      { timestamp: 1, value: 10 },
      { timestamp: 2, value: 20 },
      { timestamp: 3, value: null },
    ];
    expect(trimNullEdges(input)).toEqual([
      { timestamp: 1, value: 10 },
      { timestamp: 2, value: 20 },
    ]);
  });

  it('preserves interior nulls (gaps in the series)', () => {
    const input = [
      { timestamp: 1, value: 10 },
      { timestamp: 2, value: null },
      { timestamp: 3, value: 20 },
    ];
    expect(trimNullEdges(input)).toEqual(input);
  });

  it('returns the original array when no edge nulls', () => {
    const input = [
      { timestamp: 1, value: 5 },
      { timestamp: 2, value: 10 },
    ];
    expect(trimNullEdges(input)).toEqual(input);
  });
});

describe('unitLabel', () => {
  it('returns ms for latency', () => {
    expect(unitLabel('ms')).toBe('ms');
  });

  it('returns % for error rate', () => {
    expect(unitLabel('%')).toBe('%');
  });

  it('returns rpm for throughput', () => {
    expect(unitLabel('rpm')).toBe('rpm');
  });
});

describe('defaultMetricTitle', () => {
  it('returns Latency for latency metric', () => {
    expect(defaultMetricTitle('latency')).toBe('Latency');
  });

  it('returns Failed Transaction Rate for failedTransactionRate', () => {
    expect(defaultMetricTitle('failedTransactionRate')).toBe('Failed Transaction Rate');
  });

  it('returns Throughput for throughput', () => {
    expect(defaultMetricTitle('throughput')).toBe('Throughput');
  });
});

// ─── Storybook smoke tests ────────────────────────────────────────────────────

const {
  LatencyWithThreshold,
  ErrorRateWithAlertWindow,
  Throughput,
  SparseData,
  AllNullData,
  NoOptionalFields,
} = composeStories(stories);

describe('AgentApmTimeseries story smoke tests', () => {
  it('LatencyWithThreshold renders without error', async () => {
    await waitFor(() => {
      expect(() => render(<LatencyWithThreshold />)).not.toThrow();
    });
  });

  it('ErrorRateWithAlertWindow renders without error', async () => {
    await waitFor(() => {
      expect(() => render(<ErrorRateWithAlertWindow />)).not.toThrow();
    });
  });

  it('Throughput renders without error', async () => {
    await waitFor(() => {
      expect(() => render(<Throughput />)).not.toThrow();
    });
  });

  it('SparseData (interior nulls) renders without error', async () => {
    await waitFor(() => {
      expect(() => render(<SparseData />)).not.toThrow();
    });
  });

  it('AllNullData renders no-data message instead of chart', async () => {
    const { getByText } = render(<AllNullData />);
    await waitFor(() => {
      expect(getByText(/No data available/i)).toBeInTheDocument();
    });
  });

  it('NoOptionalFields renders without error', async () => {
    await waitFor(() => {
      expect(() => render(<NoOptionalFields />)).not.toThrow();
    });
  });
});

// ─── Registration definition tests ──────────────────────────────────────────

describe('createApmTimeseriesAttachmentDefinition', () => {
  const def = createApmTimeseriesAttachmentDefinition();

  it('getIcon returns visLine', () => {
    expect(def.getIcon()).toBe('visLine');
  });

  it('getLabel returns attachment.data.title when present', () => {
    const attachment = {
      id: 'a',
      type: 'observability.apm-timeseries' as const,
      data: {
        serviceName: 'svc',
        metric: 'latency' as const,
        unit: 'ms' as const,
        dataPoints: [],
        title: 'Latency spike — payment',
      },
    };
    expect(def.getLabel(attachment)).toBe('Latency spike — payment');
  });

  it('getLabel falls back to "APM Timeseries" when no title', () => {
    const attachment = {
      id: 'a',
      type: 'observability.apm-timeseries' as const,
      data: {
        serviceName: 'svc',
        metric: 'latency' as const,
        unit: 'ms' as const,
        dataPoints: [],
      },
    };
    expect(def.getLabel(attachment)).toBe('APM Timeseries');
  });
});
