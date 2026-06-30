/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { useFetchEpisodeQuery } from '../../hooks/use_fetch_episode_query';
import { useFetchRule } from '../../hooks/use_fetch_rule';
import { useFetchEpisodeTrendQuery } from '../../hooks/use_fetch_episode_trend_query';
import { prepareTrendInputs } from './prepare_trend_inputs';
import { mapEventDataToSeries } from './trend_data';
import type { AlertEpisodeDetailsServices } from './types';
import type { TrendMetricGroup } from './trend_types';
import * as i18n from './translations';

const AlertEpisodeTrendChart = React.lazy(() =>
  import('./trend_chart').then((m) => ({ default: m.AlertEpisodeTrendChart }))
);

export interface AlertEpisodeTrendChartSectionProps {
  episodeId: string;
  services: Pick<AlertEpisodeDetailsServices, 'data' | 'http' | 'spaces'>;
}

interface MetricBadgesProps {
  groups: TrendMetricGroup[];
  selected: string;
  onSelect: (label: string) => void;
}

const MetricBadges = ({ groups, selected, onSelect }: MetricBadgesProps) => {
  const { euiTheme } = useEuiTheme();

  // EuiBadge has no "hollow with a specific color" variant — override the hardcoded
  // border/text color that `color="hollow"` sets.
  const selectedCss = css`
    background-color: transparent !important;
    border-color: ${euiTheme.colors.primary} !important;
    color: ${euiTheme.colors.primary} !important;
  `;

  return (
    <EuiFlexGroup gutterSize="xs" alignItems="center" wrap responsive={false}>
      {groups.map((g) => (
        <EuiFlexItem grow={false} key={g.metricLabel}>
          <EuiBadge
            color="hollow"
            css={g.metricLabel === selected ? selectedCss : undefined}
            onClick={() => onSelect(g.metricLabel)}
            onClickAriaLabel={g.metricLabel}
            aria-pressed={g.metricLabel === selected}
          >
            {g.metricLabel}
          </EuiBadge>
        </EuiFlexItem>
      ))}
    </EuiFlexGroup>
  );
};

export const AlertEpisodeTrendChartSection = ({
  episodeId,
  services,
}: AlertEpisodeTrendChartSectionProps) => {
  const { data, http, spaces } = services;

  const { data: episode } = useFetchEpisodeQuery({ episodeId, services: { data, spaces } });
  const { data: rule } = useFetchRule({ id: episode?.['rule.id'], http });

  const metricGroups = useMemo(() => prepareTrendInputs(rule), [rule]);
  const metricLabels = useMemo(() => metricGroups?.map((g) => g.metricLabel) ?? [], [metricGroups]);

  const [selectedMetricLabel, setSelectedMetricLabel] = useState<string | null>(null);

  const {
    data: rows,
    isLoading,
    isError,
  } = useFetchEpisodeTrendQuery({
    episodeId: metricGroups ? episodeId : undefined,
    metricLabels,
    services: { data, spaces },
  });

  // Default to the first group; if the user's selection is no longer valid, fall back.
  const effectiveSelected =
    selectedMetricLabel && metricGroups?.some((g) => g.metricLabel === selectedMetricLabel)
      ? selectedMetricLabel
      : metricGroups?.[0]?.metricLabel ?? null;

  const selectedGroup = metricGroups?.find((g) => g.metricLabel === effectiveSelected) ?? null;

  const series = useMemo(() => {
    if (!selectedGroup || !rows) return null;
    const [s] = mapEventDataToSeries(rows, [selectedGroup.metricLabel]);
    return s ?? null;
  }, [selectedGroup, rows]);

  // Not a parseable threshold rule — render nothing.
  if (!metricGroups) return null;

  return (
    <EuiPanel hasBorder paddingSize="m" data-test-subj="alertingV2EpisodeTrendChart">
      <EuiFlexGroup gutterSize="s" alignItems="flexStart" wrap={false} responsive={false}>
        <EuiFlexItem grow={false} css={{ flexShrink: 0 }}>
          <EuiTitle size="xxs">
            <h2>{i18n.TREND_CHART_TITLE}</h2>
          </EuiTitle>
        </EuiFlexItem>
        {effectiveSelected && (
          <EuiFlexItem grow={false}>
            <MetricBadges
              groups={metricGroups}
              selected={effectiveSelected}
              onSelect={setSelectedMetricLabel}
            />
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
      <EuiSpacer size="s" />

      {isError ? (
        <EuiText size="s" color="danger" data-test-subj="alertingV2EpisodeTrendChartSectionError">
          {i18n.TREND_CHART_LOAD_ERROR}
        </EuiText>
      ) : isLoading ? (
        <EuiLoadingSpinner size="m" data-test-subj="alertingV2EpisodeTrendChartSectionLoading" />
      ) : series ? (
        <React.Suspense fallback={<EuiLoadingSpinner size="m" />}>
          <AlertEpisodeTrendChart series={series} thresholds={selectedGroup!.thresholds} />
        </React.Suspense>
      ) : null}
    </EuiPanel>
  );
};
