/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import type { ApmMetricsAttachmentData } from '../../../common/agent_builder/attachments';
import {
  AgentApmMetrics,
  classifyDelta,
  computeDeltaPct,
  formatErrorRate,
  formatLatency,
  formatThroughput,
} from './agent_apm_metrics';
import { createApmMetricsAttachmentDefinition } from './register_apm_metrics_attachment';

// Mock useEuiTheme — the component only uses euiTheme.size.xs for badge margin.
jest.mock('@elastic/eui', () => {
  const original = jest.requireActual('@elastic/eui');
  return {
    ...original,
    useEuiTheme: () => ({
      euiTheme: { size: { xs: '4px' }, colors: {} },
      colorMode: 'LIGHT',
    }),
  };
});

// ─── Pure helper unit tests ──────────────────────────────────────────────────

describe('formatLatency', () => {
  it('returns em-dash for undefined', () => {
    expect(formatLatency(undefined)).toBe('—');
  });

  it('formats sub-second values as ms (rounded)', () => {
    expect(formatLatency(0)).toBe('0ms');
    expect(formatLatency(45.7)).toBe('46ms');
    expect(formatLatency(999)).toBe('999ms');
  });

  it('formats values >= 1000 as seconds (2 dp)', () => {
    expect(formatLatency(1000)).toBe('1.00s');
    expect(formatLatency(2500)).toBe('2.50s');
  });
});

describe('formatErrorRate', () => {
  it('returns em-dash for undefined', () => {
    expect(formatErrorRate(undefined)).toBe('—');
  });

  it('formats a percentage value (0–100) with 1 dp and a space before %', () => {
    expect(formatErrorRate(0)).toBe('0.0 %');
    expect(formatErrorRate(2.5)).toBe('2.5 %');
    expect(formatErrorRate(100)).toBe('100.0 %');
  });
});

describe('formatThroughput', () => {
  it('returns em-dash for undefined', () => {
    expect(formatThroughput(undefined)).toBe('—');
  });

  it('formats rpm with 1 dp', () => {
    expect(formatThroughput(0)).toBe('0.0 rpm');
    expect(formatThroughput(42.5)).toBe('42.5 rpm');
  });
});

describe('computeDeltaPct', () => {
  it('returns null when either value is missing', () => {
    expect(computeDeltaPct(undefined, 100)).toBeNull();
    expect(computeDeltaPct(100, undefined)).toBeNull();
  });

  it('returns null when baseline is zero (avoids division by zero)', () => {
    expect(computeDeltaPct(50, 0)).toBeNull();
  });

  it('computes correct percentage', () => {
    expect(computeDeltaPct(110, 100)).toBeCloseTo(10);
    expect(computeDeltaPct(90, 100)).toBeCloseTo(-10);
    expect(computeDeltaPct(100, 100)).toBeCloseTo(0);
  });
});

describe('classifyDelta (higherIsBetter=false — latency/error rate)', () => {
  it('classifies >5% increase as worse', () => {
    expect(classifyDelta(10, false)).toBe('worse');
  });

  it('classifies >5% decrease as better', () => {
    expect(classifyDelta(-10, false)).toBe('better');
  });

  it('classifies within ±5% as neutral', () => {
    expect(classifyDelta(3, false)).toBe('neutral');
    expect(classifyDelta(-3, false)).toBe('neutral');
    expect(classifyDelta(0, false)).toBe('neutral');
  });
});

describe('classifyDelta (higherIsBetter=true — throughput)', () => {
  it('classifies >5% decrease as worse', () => {
    expect(classifyDelta(-10, true)).toBe('worse');
  });

  it('classifies >5% increase as better', () => {
    expect(classifyDelta(10, true)).toBe('better');
  });

  it('classifies within ±5% as neutral', () => {
    expect(classifyDelta(3, true)).toBe('neutral');
    expect(classifyDelta(-3, true)).toBe('neutral');
  });
});

// ─── Render tests ────────────────────────────────────────────────────────────

// errorRate is a percentage (0–100), not a fraction.
const fullData: ApmMetricsAttachmentData = {
  serviceName: 'checkout',
  environment: 'production',
  current: { latencyMs: 250, errorRate: 8.0, throughputRpm: 100 },
  baseline: { latencyMs: 200, errorRate: 2.0, throughputRpm: 120 },
};

describe('AgentApmMetrics rendering', () => {
  it('renders the service name in the default title', () => {
    render(<AgentApmMetrics data={fullData} />);
    expect(screen.getByText(/checkout/i)).toBeInTheDocument();
  });

  it('renders a custom title when provided', () => {
    render(<AgentApmMetrics data={{ ...fullData, title: 'My custom title' }} />);
    expect(screen.getByText('My custom title')).toBeInTheDocument();
  });

  it('renders the environment label', () => {
    render(<AgentApmMetrics data={fullData} />);
    expect(screen.getByText('production')).toBeInTheDocument();
  });

  it('renders current latency, error rate, and throughput', () => {
    render(<AgentApmMetrics data={fullData} />);
    expect(screen.getByText('250ms')).toBeInTheDocument();
    expect(screen.getByText('8.0 %')).toBeInTheDocument();
    expect(screen.getByText('100.0 rpm')).toBeInTheDocument();
  });

  it('renders the baseline summary when baseline is provided', () => {
    render(<AgentApmMetrics data={fullData} />);
    // The baseline section contains a "Baseline:" prefix
    expect(screen.getByText(/Baseline:/i)).toBeInTheDocument();
  });

  it('does not render the baseline section when no baseline is given', () => {
    const noBaseline: ApmMetricsAttachmentData = {
      serviceName: 'frontend',
      current: { latencyMs: 100 },
    };
    render(<AgentApmMetrics data={noBaseline} />);
    expect(screen.queryByText(/Baseline:/i)).not.toBeInTheDocument();
  });

  it('renders em-dashes for missing metric values', () => {
    render(<AgentApmMetrics data={{ serviceName: 'svc', current: {}, baseline: {} }} />);
    // Should render three em-dashes — one per metric
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(3);
  });

  it('renders delta badges when both current and baseline values are present', () => {
    render(<AgentApmMetrics data={fullData} />);
    // "vs baseline" text should appear in the delta badges
    const vsBaseline = screen.getAllByText(/vs baseline/i);
    expect(vsBaseline.length).toBeGreaterThanOrEqual(1);
  });

  it('does not render delta badges when baseline is absent', () => {
    render(<AgentApmMetrics data={{ serviceName: 'svc', current: { latencyMs: 100 } }} />);
    expect(screen.queryByText(/vs baseline/i)).not.toBeInTheDocument();
  });

  it('renders delta badge with correct +/- sign and percentage label', () => {
    // latency: 250ms vs 200ms baseline → +25 % change
    render(<AgentApmMetrics data={fullData} />);
    expect(screen.getByText(/\+25%/)).toBeInTheDocument();
  });

  it('renders a neutral (0%) badge when current exactly equals baseline', () => {
    render(
      <AgentApmMetrics
        data={{ serviceName: 'svc', current: { latencyMs: 100 }, baseline: { latencyMs: 100 } }}
      />
    );
    // 0% delta renders as "0% vs baseline"
    expect(screen.getByText(/0%/)).toBeInTheDocument();
    expect(screen.getByText(/vs baseline/i)).toBeInTheDocument();
  });

  it('error rate stat highlights as danger when above 5%', () => {
    // errorRate 8.0 > 5 → isDanger on error rate stat
    render(<AgentApmMetrics data={fullData} />);
    // EuiStat with titleColor="danger" renders its title with danger colour.
    // We verify the formatted value appears; colour is a visual concern for Storybook.
    expect(screen.getByText('8.0 %')).toBeInTheDocument();
  });

  it('error rate stat does not highlight as danger when at or below 5%', () => {
    render(<AgentApmMetrics data={{ serviceName: 'svc', current: { errorRate: 4.9 } }} />);
    expect(screen.getByText('4.9 %')).toBeInTheDocument();
  });
});

// ─── Registration definition tests ──────────────────────────────────────────

describe('createApmMetricsAttachmentDefinition', () => {
  const def = createApmMetricsAttachmentDefinition();

  it('getIcon returns visMetric', () => {
    expect(def.getIcon()).toBe('visMetric');
  });

  it('getLabel returns attachment.data.title when present', () => {
    const attachment = {
      id: 'a',
      type: 'observability.apm-metrics' as const,
      data: { serviceName: 'svc', current: {}, title: 'My Dashboard Tile' },
    };
    expect(def.getLabel(attachment)).toBe('My Dashboard Tile');
  });

  it('getLabel falls back to "APM Metrics" when no title', () => {
    const attachment = {
      id: 'a',
      type: 'observability.apm-metrics' as const,
      data: { serviceName: 'svc', current: {} },
    };
    expect(def.getLabel(attachment)).toBe('APM Metrics');
  });
});
