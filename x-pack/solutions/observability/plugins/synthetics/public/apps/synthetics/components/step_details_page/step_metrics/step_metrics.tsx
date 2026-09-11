/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiSpacer, EuiTitle, EuiFlexGrid } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { ThresholdIndicator } from '../../common/components/thershold_indicator';
import { DefinitionsPopover } from './definitions_popover';
import { useStepMetrics } from '../hooks/use_step_metrics';
import { useStepPrevMetrics } from '../hooks/use_step_prev_metrics';

export const formatMillisecond = (ms: number) => {
  if (ms < 0) {
    return '- ms';
  }

  if (ms < 1000) {
    return `${ms.toFixed(0)} ms`;
  }
  return `${(ms / 1000).toFixed(1)} s`;
};

// Web-vital tiles (LCP/FCP/CLS/DCL) are sourced from `browser.experience.*`
// fields that Heartbeat only emits for browser journeys. API monitors would
// always render them as `0`, so callers pass `isApiMonitor` to drop them.
const BROWSER_ONLY_METRIC_TEST_SUBJS = new Set([
  'synth-step-metric-lcp',
  'synth-step-metric-fcp',
  'synth-step-metric-cls',
  'synth-step-metric-dcl',
]);

export const StepMetrics = ({ isApiMonitor = false }: { isApiMonitor?: boolean }) => {
  const { metrics: stepMetrics } = useStepMetrics();
  const { metrics: prevMetrics, loading } = useStepPrevMetrics();

  const visibleStepMetrics = isApiMonitor
    ? stepMetrics.filter(({ dataTestSubj }) => !BROWSER_ONLY_METRIC_TEST_SUBJS.has(dataTestSubj))
    : stepMetrics;

  return (
    <>
      <EuiFlexGroup alignItems="center">
        <EuiFlexItem grow>
          <EuiTitle size="xs">
            <h3>{METRICS_LABEL}</h3>
          </EuiTitle>
        </EuiFlexItem>
        {!isApiMonitor && (
          <EuiFlexItem grow={false}>
            <DefinitionsPopover />
          </EuiFlexItem>
        )}
      </EuiFlexGroup>

      <EuiSpacer size="s" />
      <EuiFlexGrid data-test-subj="synth-step-metrics" gutterSize="l" columns={3}>
        {visibleStepMetrics.map(({ label, value, helpText, formatted, dataTestSubj }) => {
          const prevVal = prevMetrics.find((prev) => prev.label === label);

          if (label)
            return (
              <EuiFlexItem key={label}>
                <ThresholdIndicator
                  asStat={true}
                  loading={loading}
                  description={label}
                  current={value ?? 0}
                  previous={prevVal?.value ?? 0}
                  helpText={helpText}
                  currentFormatted={formatted}
                  previousFormatted={prevVal?.formatted}
                  dataTestSubj={dataTestSubj}
                />
              </EuiFlexItem>
            );
        })}
      </EuiFlexGrid>
    </>
  );
};

const METRICS_LABEL = i18n.translate('xpack.synthetics.stepDetailsRoute.metrics', {
  defaultMessage: 'Metrics',
});
