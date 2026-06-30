/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  EuiButtonEmpty,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingChart,
  EuiPanel,
  EuiSpacer,
  EuiSuperDatePicker,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import type { OnTimeChangeProps } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import moment from 'moment';
import { getRootEsqlQuery } from '@kbn/alerting-v2-schemas';
import { intervalToMs } from '@kbn/alerting-v2-episodes-ui/utils/histogram_utils';
import { CoreStart, useService } from '@kbn/core-di-browser';
import { PluginStart } from '@kbn/core-di';
import type { DataPublicPluginStart } from '@kbn/data-plugin/public';
import type { SharePluginStart } from '@kbn/share-plugin/public';
import { useRule } from '../rule_context';
import { useFetchSignalFirings } from '../../../hooks/use_fetch_signal_firings';
import { getDiscoverHrefForRuleQuery } from '../../../utils/discover_href_for_episode';
import { useAlertTimelineUrlState } from './alert_timeline/use_alert_timeline_url_state';
import { DEFAULT_ACTIVITY_TIME_RANGE, resolveGteLte } from './time_range';
import { StatsRow, type StatItem } from './stats_row';
import { SignalFiringsChart } from './signal_activity/signal_firings_chart';
import { deriveSignalFiringKpis } from './signal_activity/signal_firing_kpis';

const NO_VALUE = '—';

/**
 * Overview shown for `signal` rules. Signal firings are read-only point events
 * (no episodes/lifecycle), so instead of the episode Gantt we surface firing
 * KPIs and a firing-frequency histogram.
 */
export const SignalRuleOverview: React.FC = () => {
  const data = useService(PluginStart('data')) as DataPublicPluginStart;
  const share = useService(PluginStart('share')) as SharePluginStart;
  const application = useService(CoreStart('application'));
  const uiSettings = useService(CoreStart('uiSettings'));
  const rule = useRule();
  const timeZone = uiSettings.get<string>('dateFormat:tz', 'Browser');

  const [timeRange, setTimeRange] = useAlertTimelineUrlState(DEFAULT_ACTIVITY_TIME_RANGE);

  const handleTimeChange = useCallback(
    (next: OnTimeChangeProps) => setTimeRange({ from: next.start, to: next.end }),
    [setTimeRange]
  );

  const onBrushRange = useCallback(
    (fromMs: number, toMs: number) =>
      setTimeRange({ from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString() }),
    [setTimeRange]
  );

  const [refreshTick, setRefreshTick] = useState(0);

  const { windowStartMs: gteMs, windowEndMs: lteMs } = useMemo(() => {
    void refreshTick;
    return resolveGteLte(timeRange.from, timeRange.to);
  }, [timeRange.from, timeRange.to, refreshTick]);

  const { buckets, interval, lastFiringMs, isLoading, isHistogramError, isSummaryError, refetch } =
    useFetchSignalFirings({
      ruleId: rule.id,
      gteMs,
      lteMs,
      data,
    });

  const handleRefresh = useCallback(() => {
    setRefreshTick((n) => n + 1);
    refetch();
  }, [refetch]);

  const intervalMs = useMemo(() => intervalToMs(interval), [interval]);

  const kpis = useMemo(
    () => deriveSignalFiringKpis(buckets, gteMs, lteMs, interval),
    [buckets, gteMs, lteMs, interval]
  );

  const discoverHref = useMemo(
    () =>
      getDiscoverHrefForRuleQuery({
        share,
        capabilities: application.capabilities,
        uiSettings,
        timeRange: {
          from: new Date(gteMs).toISOString(),
          to: new Date(lteMs).toISOString(),
        },
        ruleEsql: getRootEsqlQuery(rule.query),
      }),
    [share, application.capabilities, uiSettings, gteMs, lteMs, rule.query]
  );

  const stats: StatItem[] = useMemo(() => {
    const averageDescription =
      kpis.averageUnit === 'hour'
        ? i18n.translate('xpack.alertingV2.signalOverview.statAveragePerHour', {
            defaultMessage: 'Average per hour',
          })
        : i18n.translate('xpack.alertingV2.signalOverview.statAveragePerDay', {
            defaultMessage: 'Average per day',
          });

    return [
      {
        title: kpis.totalFirings.toLocaleString(),
        description: i18n.translate('xpack.alertingV2.signalOverview.statTotalFirings', {
          defaultMessage: 'Total signals',
        }),
        dataTestSubj: 'signalStatTotalFirings',
      },
      {
        title: kpis.average.toLocaleString(undefined, { maximumFractionDigits: 1 }),
        description: averageDescription,
        dataTestSubj: 'signalStatAverage',
      },
      {
        title: lastFiringMs == null ? NO_VALUE : moment(lastFiringMs).fromNow(),
        description: i18n.translate('xpack.alertingV2.signalOverview.statLastFiring', {
          defaultMessage: 'Last signal',
        }),
        dataTestSubj: 'signalStatLastFiring',
      },
    ];
  }, [kpis, lastFiringMs]);

  const renderKpiBody = () => {
    if (isLoading) {
      return (
        <EuiFlexGroup
          justifyContent="center"
          alignItems="center"
          responsive={false}
          data-test-subj="signalOverviewKpiLoading"
        >
          <EuiFlexItem grow={false}>
            <EuiLoadingChart size="m" />
          </EuiFlexItem>
        </EuiFlexGroup>
      );
    }
    if (isSummaryError) {
      return (
        <EuiText size="s" color="danger" data-test-subj="signalOverviewKpiError">
          {i18n.translate('xpack.alertingV2.signalOverview.kpiErrorBody', {
            defaultMessage: 'Could not load signal counts.',
          })}
        </EuiText>
      );
    }
    return <StatsRow stats={stats} data-test-subj="signalOverviewStatsRow" />;
  };

  const renderChartBody = () => {
    if (isLoading) {
      return (
        <EuiFlexGroup
          justifyContent="center"
          alignItems="center"
          responsive={false}
          data-test-subj="signalOverviewLoading"
        >
          <EuiFlexItem grow={false}>
            <EuiSpacer size="l" />
            <EuiLoadingChart size="l" />
            <EuiSpacer size="l" />
          </EuiFlexItem>
        </EuiFlexGroup>
      );
    }
    if (isHistogramError) {
      return (
        <EuiEmptyPrompt
          color="danger"
          iconType="warning"
          data-test-subj="signalOverviewError"
          title={
            <h4>
              {i18n.translate('xpack.alertingV2.signalOverview.errorTitle', {
                defaultMessage: 'Could not load rule events',
              })}
            </h4>
          }
          body={
            <EuiText size="s">
              {i18n.translate('xpack.alertingV2.signalOverview.errorBody', {
                defaultMessage:
                  'Try a smaller time range or refresh the page. Check the rule events index is reachable.',
              })}
            </EuiText>
          }
        />
      );
    }
    if (buckets.length === 0) {
      return (
        <EuiEmptyPrompt
          iconType="visBarVerticalStacked"
          data-test-subj="signalOverviewEmpty"
          title={
            <h4>
              {i18n.translate('xpack.alertingV2.signalOverview.emptyTitle', {
                defaultMessage: 'No signals in this window',
              })}
            </h4>
          }
          body={
            <EuiText size="s">
              {i18n.translate('xpack.alertingV2.signalOverview.emptyBody', {
                defaultMessage: 'Signals appear here once the rule fires.',
              })}
            </EuiText>
          }
        />
      );
    }
    return (
      <SignalFiringsChart
        buckets={buckets}
        gteMs={gteMs}
        lteMs={lteMs}
        minIntervalMs={intervalMs}
        timeZone={timeZone}
        onBrushRange={onBrushRange}
      />
    );
  };

  return (
    <div data-test-subj="signalRuleOverview">
      {/* Section header — no panel */}
      <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiTitle size="xs">
            <h3>
              {i18n.translate('xpack.alertingV2.signalOverview.title', {
                defaultMessage: 'Rule events',
              })}
            </h3>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiSuperDatePicker
            compressed
            width="auto"
            start={timeRange.from}
            end={timeRange.to}
            onTimeChange={handleTimeChange}
            onRefresh={handleRefresh}
            isLoading={isLoading}
            showUpdateButton="iconOnly"
            updateButtonProps={{ fill: false }}
            data-test-subj="signalOverviewDatePicker"
          />
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      {/* KPI panel */}
      <EuiPanel hasBorder paddingSize="m" data-test-subj="signalOverviewKpiPanel">
        {renderKpiBody()}
      </EuiPanel>

      <EuiSpacer size="m" />

      {/* Chart panel */}
      <EuiPanel hasBorder paddingSize="m" data-test-subj="signalOverviewChartPanel">
        <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiTitle size="xxs">
              <h4>
                {i18n.translate('xpack.alertingV2.signalOverview.chartTitle', {
                  defaultMessage: 'Signal frequency',
                })}
              </h4>
            </EuiTitle>
          </EuiFlexItem>
          {discoverHref && (
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty
                size="s"
                iconType="discoverApp"
                href={discoverHref}
                color="text"
                data-test-subj="signalOverviewOpenInDiscover"
              >
                {i18n.translate('xpack.alertingV2.signalOverview.openInDiscover', {
                  defaultMessage: 'Open in Discover',
                })}
              </EuiButtonEmpty>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>

        <EuiSpacer size="m" />

        {renderChartBody()}
      </EuiPanel>
    </div>
  );
};
