/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingChart,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
  useEuiTheme,
} from '@elastic/eui';
import { ProposalSparkline } from './proposal_sparkline';
import { CHART_ARIA_LABEL, CHART_SERIES_NAME, HOURS_AGO, NOW } from './translations';
import type { ChartsSummaryPanelColor } from './constants';

interface ProposalChartsSummaryCardProps {
  id: string;
  label: string;
  color: ChartsSummaryPanelColor;
  count: number;
  /** Oldest-first. */
  series: Array<{ x: number; y: number }>;
  isLoading: boolean;
  /** The window the series was fetched for; labels and tooltips read from it. */
  windowHours: number;
  bucketMinutes: number;
}

export const ProposalChartsSummaryCard: React.FC<ProposalChartsSummaryCardProps> = ({
  id,
  label,
  color,
  count,
  series,
  isLoading,
  windowHours,
  bucketMinutes,
}) => {
  const { euiTheme } = useEuiTheme();

  // @elastic/charts needs a real colour value, not an EUI token name.
  const colorMap: Record<ChartsSummaryPanelColor, string> = {
    danger: euiTheme.colors.danger,
    warning: euiTheme.colors.warning,
    primary: euiTheme.colors.primary,
  };
  const resolvedColor = colorMap[color];

  return (
    <EuiPanel
      hasBorder
      paddingSize="m"
      css={{ borderRadius: euiTheme.size.s }}
      data-test-subj={`alertZeroProposalChartsSummaryCard-${id}`}
    >
      <EuiTitle size="xxs">
        <h3 style={{ fontWeight: euiTheme.font.weight.semiBold }}>{label}</h3>
      </EuiTitle>
      <EuiText size="s" style={{ fontWeight: euiTheme.font.weight.bold, fontSize: '1.75rem' }}>
        {isLoading ? <EuiLoadingChart size="m" /> : <span>{count}</span>}
      </EuiText>
      <EuiSpacer size="s" />
      {isLoading ? (
        <div style={{ height: 48 }} />
      ) : (
        <ProposalSparkline
          series={series}
          color={resolvedColor}
          ariaLabel={CHART_ARIA_LABEL(label, count, windowHours)}
          panelId={id}
          seriesName={CHART_SERIES_NAME(label)}
          bucketMinutes={bucketMinutes}
        />
      )}
      <EuiSpacer size="xs" />
      <EuiFlexGroup justifyContent="spaceBetween" gutterSize="none" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            {HOURS_AGO(windowHours)}
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            {NOW}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
};
