/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { Chart, Metric, MetricTrendShape, Settings } from '@elastic/charts';
import type { EuiThemeComputed } from '@elastic/eui';
import { EuiPanel, EuiSpacer, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import moment from 'moment';
import React, { useState, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { OverviewTrend } from '../../../../../../../../common/types';
import { useMetricSubtitle } from '../../../../../hooks/use_metric_subtitle';
import { MetricItemExtra } from './metric_item_extra';
import type { OverviewStatusMetaData } from '../../../../../../../../common/runtime_types';
import type { ClientPluginsStart } from '../../../../../../../plugin';
import { useLocationName, useStatusByLocationOverview } from '../../../../../hooks';
import {
  selectErrorPopoverState,
  selectOverviewShowLastRun,
  selectOverviewTrends,
  toggleErrorPopoverOpen,
} from '../../../../../state';
import { resolveDisplayStatus } from '../../../../../state/overview_status';
import {
  hideTestNowFlyoutAction,
  manualTestRunInProgressSelector,
  toggleTestNowFlyoutAction,
} from '../../../../../state/manual_test_runs';
import { formatDuration } from '../../../../../utils/formatting';
import { ActionsPopover } from '../actions_popover';
import { MetricItemBody } from './metric_item_body';
import { MetricItemIcon } from './metric_item_icon';
import type { FlyoutParamProps } from '../types';
import { getTrendDuration } from '../../../../../utils/formatting/trend_duration';

export const METRIC_ITEM_HEIGHT = 180;

export const getColor = (euiTheme: EuiThemeComputed, isEnabled: boolean, status?: string) => {
  if (!isEnabled) {
    return euiTheme.colors.backgroundBaseDisabled;
  }

  // make sure these are synced with slo card colors while making changes
  switch (status) {
    case 'down':
      return euiTheme.colors.backgroundBaseDanger;
    case 'up':
      return euiTheme.colors.backgroundBaseSuccess;
    case 'unknown':
      return euiTheme.colors.backgroundBasePlain;
    case 'pending':
      return euiTheme.colors.backgroundBasePlain;
    case 'stale':
      // Amber, not neutral grey: a monitor that stopped reporting is a signal
      // worth investigating (it may be masking an incident).
      return euiTheme.colors.backgroundBaseWarning;
    default:
      return euiTheme.colors.backgroundBaseSuccess;
  }
};

const truncateText = (text: string) => {
  // truncate from middle if longer than maxLength
  const maxLength = 100;
  if (text.length <= maxLength) {
    return text;
  }
  const halfLength = Math.floor(maxLength / 2);
  return `${text.slice(0, halfLength)}…${text.slice(-halfLength)}`;
};

/**
 * Get metric value props for Metric component. The goal of this function is
 * to be able to handle the loading state of the trend data without disrupting
 * the type expectations of the Metric component.
 */
export const getMetricValueProps = (trendData: OverviewTrend | 'loading' | null | undefined) => {
  return getTrendDuration<
    | {
        value: string;
        extra: React.JSX.Element;
        valueFormatter?: undefined;
      }
    | {
        value: number;
        valueFormatter: (d: number) => string;
        extra: React.JSX.Element;
      }
  >({
    onLoading: (onLoadingComponent) => ({
      value: '',
      extra: onLoadingComponent,
    }),
    onNoData: (onNoDataComponent) => ({
      value: '',
      extra: onNoDataComponent,
    }),
    onData: ({ max, median, min, avg }) => ({
      value: median,
      valueFormatter: (d: number) => formatDuration(d),
      extra: (
        <MetricItemExtra
          stats={{
            medianDuration: median,
            minDuration: min,
            maxDuration: max,
            avgDuration: avg,
          }}
        />
      ),
    }),
    trendData,
  });
};

export const MetricItem = ({
  monitor,
  onClick,
  style,
}: {
  monitor: OverviewStatusMetaData;
  style?: React.CSSProperties;
  onClick: (params: FlyoutParamProps) => void;
}) => {
  const status = monitor.overallStatus;
  const showLastRun = useSelector(selectOverviewShowLastRun);
  // `stale` monitors stay in their bucket (count + filter intact); when the
  // user enables "Show last run" we only change what colour the card paints
  // with — surfacing the last-known up/down instead of the neutral amber.
  const displayStatus = resolveDisplayStatus(monitor, showLastRun);
  const locationId = monitor.locations[0]?.id ?? '';
  const { euiTheme } = useEuiTheme();
  const trendData = useSelector(selectOverviewTrends)[monitor.configId + locationId];
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const isErrorPopoverOpen = useSelector(selectErrorPopoverState);
  const metricSubtitle = useMetricSubtitle(monitor);
  const locationName = useLocationName(monitor);
  const { timestamp, configIdByLocation } = useStatusByLocationOverview({
    configId: monitor.configId,
    locationId,
  });

  const { charts } = useKibana<ClientPluginsStart>().services;
  const chartBaseTheme = charts.theme.useChartsBaseTheme();
  const testInProgress = useSelector(manualTestRunInProgressSelector(monitor.configId));

  const dispatch = useDispatch();

  const trendMessage = useMemo(() => {
    if (trendData === 'loading') {
      return i18n.translate('xpack.synthetics.overview.metricItem.trendMessage.loadingCase', {
        defaultMessage: 'Metrics are loading and have no value to display.',
      });
    }

    if (!trendData) {
      return i18n.translate('xpack.synthetics.overview.metricItem.trendMessage.noData', {
        defaultMessage: 'No data available for the selected time window.',
      });
    }

    return i18n.translate('xpack.synthetics.overview.metricItem.trendMessage', {
      defaultMessage:
        'The duration statistics currently shown by the chart are: average: {avg}, median: {median}, max: {max}, min: {min}.',
      values: {
        max: trendData.max,
        min: trendData.min,
        median: trendData.median,
        avg: trendData.avg,
      },
    });
  }, [trendData]);

  return (
    <div
      data-test-subj={`${monitor.name}-${locationId}-metric-item`}
      aria-label={i18n.translate('xpack.synthetics.overview.metricItem.label', {
        defaultMessage:
          'Monitor {name} in {location}. The background of this element also contains a sparkline chart indicating the status of test duration over the selected time window. {trendMessage}',
        values: {
          name: monitor.name,
          location: locationName,
          trendMessage,
        },
      })}
      // this is the ID the Chart child will expect in its `aria-labelledby` attribute
      id={`echMetric-${monitor.configId}-${locationId}-metric-chart-0-0-trend-title_echMetric-${monitor.configId}-${locationId}-metric-chart-0-0-trend-description`}
      style={style ?? { height: METRIC_ITEM_HEIGHT }}
    >
      <EuiPanel
        data-test-subj={`${monitor.name}-metric-item-${locationName}-${status}`}
        paddingSize="none"
        onMouseLeave={() => {
          if (isErrorPopoverOpen) {
            dispatch(toggleErrorPopoverOpen(null));
          }
        }}
        css={css`
          height: 100%;
          overflow: hidden;
          position: relative;

          & .cardItemActions_hover {
            pointer-events: none;
            opacity: 0;
            &:focus-within {
              pointer-events: auto;
              opacity: 1;
            }
          }
          &:hover .cardItemActions_hover {
            pointer-events: auto;
            opacity: 1;
          }
          .echMetricText__body {
            overflow: visible;
          }
        `}
        title={moment(timestamp).format('LLL')}
      >
        <Chart id={`${monitor.configId}-${locationId}-metric-chart`}>
          <Settings
            onElementClick={() => {
              if (testInProgress) {
                dispatch(toggleTestNowFlyoutAction(monitor.configId));
                dispatch(toggleErrorPopoverOpen(null));
              } else {
                dispatch(hideTestNowFlyoutAction());
                dispatch(toggleErrorPopoverOpen(null));
              }
              if (!testInProgress && locationName) {
                onClick({
                  locationId,
                  configId: monitor.configId,
                  id: monitor.configId,
                  location: locationName,
                  spaces: monitor.spaces,
                });
              }
            }}
            baseTheme={chartBaseTheme}
            locale={i18n.getLocale()}
          />
          <Metric
            id={configIdByLocation}
            data={[
              [
                {
                  title: truncateText(monitor.name),
                  subtitle: metricSubtitle,
                  body: (
                    <div
                      role="button"
                      tabIndex={0}
                      onMouseDown={(e) => e.stopPropagation()}
                      onMouseUp={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        const target = e.target as HTMLElement;
                        const closestInteractive = target.closest(
                          'a, button, [role="button"], .euiBadge'
                        );
                        if (!closestInteractive || closestInteractive === e.currentTarget) {
                          onClick({
                            locationId,
                            configId: monitor.configId,
                            id: monitor.configId,
                            location: locationName ?? '',
                            spaces: monitor.spaces,
                          });
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onClick({
                            locationId,
                            configId: monitor.configId,
                            id: monitor.configId,
                            location: locationName ?? '',
                            spaces: monitor.spaces,
                          });
                        }
                      }}
                    >
                      <MetricItemBody
                        monitor={monitor}
                        onLocationClick={(locId, locLabel) => {
                          onClick({
                            locationId: locId,
                            configId: monitor.configId,
                            id: monitor.configId,
                            location: locLabel,
                            spaces: monitor.spaces,
                          });
                        }}
                      />
                    </div>
                  ),
                  color: getColor(euiTheme, monitor.isEnabled, displayStatus),
                  trendShape: MetricTrendShape.Area,
                  trend: trendData !== 'loading' && !!trendData?.data ? trendData.data : [],
                  ...getMetricValueProps(trendData),
                },
              ],
            ]}
          />
        </Chart>
        <div className={isPopoverOpen ? '' : 'cardItemActions_hover'}>
          <ActionsPopover
            monitor={monitor}
            isPopoverOpen={isPopoverOpen}
            setIsPopoverOpen={setIsPopoverOpen}
            position="relative"
            locationId={locationId}
          />
        </div>
        {configIdByLocation && (
          <MetricItemIcon
            monitor={monitor}
            status={status}
            timestamp={timestamp}
            configIdByLocation={configIdByLocation}
          />
        )}
      </EuiPanel>
      <EuiSpacer size="s" />
    </div>
  );
};
