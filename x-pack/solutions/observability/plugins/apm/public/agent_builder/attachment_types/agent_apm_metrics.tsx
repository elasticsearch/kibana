/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiBadge,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiStat,
  EuiText,
  EuiTitle,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import type { ApmMetricsAttachmentData } from '../../../common/agent_builder/attachments';

// ─── Pure formatting helpers (exported for unit tests) ──────────────────────

export function formatLatency(ms?: number): string {
  if (ms == null) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.round(ms)}ms`;
}

/**
 * Formats an error rate that is already a percentage (0–100).
 * Example: `formatErrorRate(8.0)` → `"8.0 %"`.
 */
export function formatErrorRate(rate?: number): string {
  if (rate == null) return '—';
  return `${rate.toFixed(1)} %`;
}

export function formatThroughput(rpm?: number): string {
  if (rpm == null) return '—';
  return `${rpm.toFixed(1)} rpm`;
}

/**
 * Computes the percentage delta between current and baseline.
 * Returns null when either value is missing or baseline is zero.
 */
export function computeDeltaPct(current?: number, baseline?: number): number | null {
  if (current == null || baseline == null || baseline === 0) return null;
  return ((current - baseline) / baseline) * 100;
}

/**
 * Classifies a delta as 'worse', 'better', or 'neutral' depending on
 * whether higher is better (e.g. throughput) or lower is better (latency, errors).
 * A threshold of ±5 % is used to avoid spurious coloring.
 */
export function classifyDelta(
  delta: number,
  higherIsBetter: boolean
): 'worse' | 'better' | 'neutral' {
  if (higherIsBetter) {
    if (delta < -5) return 'worse';
    if (delta > 5) return 'better';
  } else {
    if (delta > 5) return 'worse';
    if (delta < -5) return 'better';
  }
  return 'neutral';
}

// ─── Sub-components ──────────────────────────────────────────────────────────

interface DeltaBadgeProps {
  current?: number;
  baseline?: number;
  higherIsBetter?: boolean;
}

function DeltaBadge({ current, baseline, higherIsBetter = false }: DeltaBadgeProps) {
  const { euiTheme } = useEuiTheme();
  const delta = computeDeltaPct(current, baseline);
  if (delta === null) return null;

  const classification = classifyDelta(delta, higherIsBetter);
  const label = `${delta > 0 ? '+' : ''}${delta.toFixed(0)}%`;
  const color =
    classification === 'worse' ? 'danger' : classification === 'better' ? 'success' : 'hollow';

  return (
    <EuiBadge
      color={color}
      css={css`
        margin-left: ${euiTheme.size.xs};
      `}
    >
      {label}{' '}
      {i18n.translate('xpack.apm.agentBuilder.attachments.apmMetrics.vsBaseline', {
        defaultMessage: 'vs baseline',
      })}
    </EuiBadge>
  );
}

interface MetricStatProps {
  title: string;
  description: string;
  isDanger?: boolean;
  current?: number;
  baseline?: number;
  higherIsBetter?: boolean;
}

function MetricStat({
  title,
  description,
  isDanger,
  current,
  baseline,
  higherIsBetter,
}: MetricStatProps) {
  return (
    <EuiFlexItem grow={false} style={{ minWidth: 160 }}>
      <EuiStat title={title} description={description} titleColor={isDanger ? 'danger' : 'default'}>
        <DeltaBadge current={current} baseline={baseline} higherIsBetter={higherIsBetter} />
      </EuiStat>
    </EuiFlexItem>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export interface AgentApmMetricsProps {
  data: ApmMetricsAttachmentData;
}

export function AgentApmMetrics({ data }: AgentApmMetricsProps) {
  const { current, baseline, serviceName, environment, title } = data;

  // Use the same 5% threshold as the delta badge so stat colour and badge colour are always in sync.
  const latencyDelta = computeDeltaPct(current.latencyMs, baseline?.latencyMs);
  const isLatencyWorse = latencyDelta != null && classifyDelta(latencyDelta, false) === 'worse';

  // Absolute threshold: error rate above 5% is always highlighted regardless of baseline.
  const isErrorRateHigh = current.errorRate != null && current.errorRate > 5;

  const baselineSummaryParts: string[] = [];
  if (baseline) {
    if (baseline.latencyMs != null) {
      baselineSummaryParts.push(
        i18n.translate('xpack.apm.agentBuilder.attachments.apmMetrics.baselineLatency', {
          defaultMessage: '{latency} latency',
          values: { latency: formatLatency(baseline.latencyMs) },
        })
      );
    }
    if (baseline.errorRate != null) {
      baselineSummaryParts.push(
        i18n.translate('xpack.apm.agentBuilder.attachments.apmMetrics.baselineErrors', {
          defaultMessage: '{errorRate} errors',
          values: { errorRate: formatErrorRate(baseline.errorRate) },
        })
      );
    }
    if (baseline.throughputRpm != null) {
      baselineSummaryParts.push(formatThroughput(baseline.throughputRpm));
    }
  }

  return (
    <EuiPanel hasBorder paddingSize="m">
      <EuiTitle size="xs">
        <h4>
          {title ??
            i18n.translate('xpack.apm.agentBuilder.attachments.apmMetrics.defaultTitle', {
              defaultMessage: 'APM Metrics — {serviceName}',
              values: { serviceName },
            })}
        </h4>
      </EuiTitle>

      {environment && (
        <EuiText size="xs" color="subdued">
          <p>{environment}</p>
        </EuiText>
      )}

      <EuiSpacer size="m" />

      <EuiFlexGroup gutterSize="l" wrap>
        <MetricStat
          title={formatLatency(current.latencyMs)}
          description={i18n.translate('xpack.apm.agentBuilder.attachments.apmMetrics.latency', {
            defaultMessage: 'Avg Latency',
          })}
          isDanger={isLatencyWorse}
          current={current.latencyMs}
          baseline={baseline?.latencyMs}
          higherIsBetter={false}
        />

        <MetricStat
          title={formatErrorRate(current.errorRate)}
          description={i18n.translate('xpack.apm.agentBuilder.attachments.apmMetrics.errorRate', {
            defaultMessage: 'Error Rate',
          })}
          isDanger={isErrorRateHigh}
          current={current.errorRate}
          baseline={baseline?.errorRate}
          higherIsBetter={false}
        />

        <MetricStat
          title={formatThroughput(current.throughputRpm)}
          description={i18n.translate('xpack.apm.agentBuilder.attachments.apmMetrics.throughput', {
            defaultMessage: 'Throughput',
          })}
          current={current.throughputRpm}
          baseline={baseline?.throughputRpm}
          higherIsBetter={true}
        />
      </EuiFlexGroup>

      {baseline && baselineSummaryParts.length > 0 && (
        <>
          <EuiSpacer size="s" />
          <EuiText size="xs" color="subdued">
            <p>
              {i18n.translate('xpack.apm.agentBuilder.attachments.apmMetrics.baselineLabel', {
                defaultMessage: 'Baseline: {summary}',
                values: { summary: baselineSummaryParts.join(' · ') },
              })}
            </p>
          </EuiText>
        </>
      )}
    </EuiPanel>
  );
}
