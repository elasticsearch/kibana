/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React, { useCallback } from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiLink, EuiLoadingChart, EuiText } from '@elastic/eui';
import { Axis, Chart, Position, Settings, AreaSeries, ScaleType } from '@elastic/charts';
import { useElasticChartsTheme } from '@kbn/charts-theme';
import { i18n } from '@kbn/i18n';

import type { AgentlessPolicyThroughput } from '../../../../../../../../../common/types/rest_spec/agentless_policy';

const formatRate = (value: number): string =>
  value >= 1000 ? `${(value / 1000).toFixed(2)}k/s` : `${value.toFixed(2)}/s`;

const ThroughputDash: React.FC<{ 'data-test-subj': string }> = ({ 'data-test-subj': testSubj }) => (
  <EuiText size="s" color="subdued" data-test-subj={testSubj}>
    {i18n.translate('xpack.fleet.epm.packageDetails.integrationList.throughputNoData', {
      defaultMessage: '—',
    })}
  </EuiText>
);

export const ThroughputCell: React.FC<{
  data?: AgentlessPolicyThroughput;
  isLoading: boolean;
  discover?: { href: string; navigate: () => void };
}> = ({ data, isLoading, discover }) => {
  const chartBaseTheme = useElasticChartsTheme();
  const locale = i18n.getLocale();
  const formatTimestamp = useCallback(
    (ms: number) =>
      new Date(ms).toLocaleString(locale, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [locale]
  );

  if (isLoading) {
    return <EuiLoadingChart size="m" data-test-subj="agentlessThroughputLoading" />;
  }

  if (!data || data.series.length === 0) {
    return <ThroughputDash data-test-subj="agentlessThroughputNoData" />;
  }

  const content = (
    <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
      <EuiFlexItem grow={false}>
        <EuiText size="s" className="eui-textNoWrap" data-test-subj="agentlessThroughputValue">
          {formatRate(data.averagePerSecond)}
        </EuiText>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <Chart size={{ height: 30, width: 100 }} data-test-subj="agentlessThroughputSparkline">
          <Settings showLegend={false} baseTheme={chartBaseTheme} locale={locale} />
          <Axis
            id="x"
            position={Position.Bottom}
            hide={true}
            gridLine={{ visible: false }}
            tickFormat={formatTimestamp}
          />
          <Axis
            id="y"
            gridLine={{ visible: false }}
            position={Position.Left}
            hide={true}
            tickFormat={formatRate}
          />
          <AreaSeries
            id="throughput"
            xScaleType={ScaleType.Time}
            yScaleType={ScaleType.Linear}
            xAccessor="x"
            yAccessors={['y']}
            data={data.series}
          />
        </Chart>
      </EuiFlexItem>
    </EuiFlexGroup>
  );

  if (!discover) {
    return content;
  }

  return (
    <EuiLink
      href={discover.href}
      onClick={(e: React.MouseEvent) => {
        // Allow modifier-key clicks (cmd/ctrl/shift) and middle-clicks to open
        // a new tab naturally; intercept plain left-clicks for SPA navigation.
        if (!e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
          e.preventDefault();
          discover.navigate();
        }
      }}
      data-test-subj="agentlessThroughputDiscoverLink"
      aria-label={i18n.translate(
        'xpack.fleet.epm.packageDetails.integrationList.throughputDiscoverLink',
        { defaultMessage: 'View throughput documents in Discover' }
      )}
    >
      {content}
    </EuiLink>
  );
};
