/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiTitle,
  useEuiTheme,
} from '@elastic/eui';
import { RECORDS_FIELD } from '@kbn/exploratory-view-plugin/public';
import { i18n } from '@kbn/i18n';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import React, { useMemo } from 'react';
import { useSelector } from 'react-redux';
import {
  SYNTHETICS_STATUS_RULE,
  SYNTHETICS_TLS_RULE,
} from '../../../../../../../common/constants/synthetics_alerts';
import type { ClientPluginsStart } from '../../../../../../plugin';
import { useGetUrlParams } from '../../../../hooks';
import { selectOverviewStatus } from '../../../../state/overview_status';
import { useOverviewRefreshedRange } from '../../common/use_overview_date_range';
import { AlertsLink } from '../../../common/links/view_alerts';
import { useMonitorFilters } from '../../hooks/use_monitor_filters';
import { useMonitorQueryFilters } from '../../hooks/use_monitor_query_filters';

export const useMonitorQueryIds = () => {
  const { status } = useSelector(selectOverviewStatus);

  const { statusFilter } = useGetUrlParams();
  return useMemo(() => {
    let monitorIds = status?.enabledMonitorQueryIds ?? [];
    switch (statusFilter) {
      case 'up':
        monitorIds = status
          ? Object.entries(status.upConfigs).map(([id, config]) => config.monitorQueryId)
          : [];
        break;
      case 'down':
        monitorIds = status
          ? Object.entries(status.downConfigs).map(([id, config]) => config.monitorQueryId)
          : [];
        break;
      case 'disabled':
        monitorIds = status?.disabledMonitorQueryIds ?? [];
        break;
      case 'pending':
        monitorIds = status
          ? Object.entries(status.pendingConfigs).map(([id, config]) => config.monitorQueryId)
          : [];
        break;
      default:
        break;
    }
    return monitorIds.length > 0 ? monitorIds : ['false-id'];
  }, [status, statusFilter]);
};

export const OverviewAlerts = () => {
  // Follows the page-level date picker (URL params), defaulting to the overview's
  // own window when untouched so it stays in step with the status panel.
  const { from, to } = useOverviewRefreshedRange();

  const {
    exploratoryView: { ExploratoryViewEmbeddable },
  } = useKibana<ClientPluginsStart>().services;

  const { euiTheme } = useEuiTheme();
  const filters = useMonitorFilters({ forAlerts: true });

  const { locations } = useGetUrlParams();
  const queryFilters = useMonitorQueryFilters();

  return (
    <EuiPanel hasShadow={false} paddingSize="m" hasBorder>
      <EuiTitle size="xs">
        <h3>{headingText}</h3>
      </EuiTitle>
      <EuiSpacer size="s" />
      <EuiFlexGroup alignItems="center" gutterSize="m">
        <EuiFlexItem grow={false}>
          <ExploratoryViewEmbeddable
            id="monitorActiveAlertsCount"
            dataTestSubj="monitorActiveAlertsCount"
            reportType="single-metric"
            customHeight="70px"
            dslFilters={queryFilters}
            attributes={[
              {
                dataType: 'alerts',
                time: {
                  from,
                  to,
                },
                name: ALERTS_LABEL,
                selectedMetricField: RECORDS_FIELD,
                reportDefinitions: {
                  'kibana.alert.rule.rule_type_id': [SYNTHETICS_STATUS_RULE, SYNTHETICS_TLS_RULE],
                  ...(locations?.length ? { 'observer.geo.name': locations } : {}),
                },
                filters: [
                  { field: 'kibana.alert.status', values: ['active', 'recovered'] },
                  ...filters,
                ],
                color: euiTheme.colors.vis.euiColorVis6,
              },
            ]}
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <ExploratoryViewEmbeddable
            id="monitorActiveAlertsOverTime"
            sparklineMode
            customHeight="70px"
            reportType="kpi-over-time"
            dslFilters={queryFilters}
            attributes={[
              {
                seriesType: 'area',
                time: {
                  from,
                  to,
                },
                reportDefinitions: {
                  'kibana.alert.rule.rule_type_id': [SYNTHETICS_STATUS_RULE, SYNTHETICS_TLS_RULE],
                  ...(locations?.length ? { 'observer.geo.name': locations } : {}),
                },
                dataType: 'alerts',
                selectedMetricField: RECORDS_FIELD,
                name: ALERTS_LABEL,
                filters: [
                  { field: 'kibana.alert.status', values: ['active', 'recovered'] },
                  ...filters,
                ],
                color: euiTheme.colors.vis.euiColorVis6,
              },
            ]}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false} css={{ alignSelf: 'center' }}>
          <AlertsLink />
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
};

const ALERTS_LABEL = i18n.translate('xpack.synthetics.detailsPanel.alerts', {
  defaultMessage: 'Alerts',
});

const headingText = i18n.translate('xpack.synthetics.overview.alerts.headingText', {
  defaultMessage: 'Alerts',
});
