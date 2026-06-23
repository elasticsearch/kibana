/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState, useEffect } from 'react';

import type { DashboardApi, DashboardCreationOptions } from '@kbn/dashboard-plugin/public';
import { DashboardRenderer } from '@kbn/dashboard-plugin/public';
import type { DataView } from '@kbn/data-views-plugin/common';
import type { Filter } from '@kbn/es-query';
import { buildExistsFilter, buildPhraseFilter } from '@kbn/es-query';
import { i18n } from '@kbn/i18n';
import type { NotificationsStart } from '@kbn/core/public';
import { DEFAULT_DSL_OPTIONS_LIST_STATE, OPTIONS_LIST_CONTROL } from '@kbn/controls-constants';
import {
  ENVIRONMENT_ALL,
  ENVIRONMENT_NOT_DEFINED,
} from '../../../../../common/environment_filter_values';
import { useApmPluginContext } from '../../../../context/apm_plugin/use_apm_plugin_context';
import { useApmServiceContext } from '../../../../context/apm_service/use_apm_service_context';
import { useApmParams } from '../../../../hooks/use_apm_params';
import type { MetricsDashboardProps } from './helper';
import { convertSavedDashboardToPanels, getDashboardFileNameFromProps } from './helper';

export function JsonMetricsDashboard(dashboardProps: MetricsDashboardProps) {
  const [dashboard, setDashboard] = useState<DashboardApi | undefined>(undefined);
  const { dataView } = dashboardProps;
  const {
    query: { environment, kuery, rangeFrom, rangeTo },
  } = useApmParams('/services/{serviceName}/metrics');

  const {
    core: { notifications },
  } = useApmPluginContext();

  const { serviceName } = useApmServiceContext();

  useEffect(() => {
    if (!dashboard) return;
    dashboard.setTimeRange({ from: rangeFrom, to: rangeTo });
    dashboard.setQuery({ query: kuery, language: 'kuery' });
  }, [kuery, dashboard, rangeFrom, rangeTo]);

  useEffect(() => {
    if (!dashboard) return;

    dashboard.setFilters(dataView ? getFilters(serviceName, environment, dataView) : []);
  }, [dataView, serviceName, environment, dashboard]);

  const dashboardFileName = getDashboardFileNameFromProps(dashboardProps);

  return (
    <DashboardRenderer
      key={dashboardFileName}
      getCreationOptions={() => getCreationOptions(dashboardProps, notifications)}
      onApiAvailable={setDashboard}
    />
  );
}

async function getCreationOptions(
  dashboardProps: MetricsDashboardProps,
  notifications: NotificationsStart
): Promise<DashboardCreationOptions> {
  try {
    const { dataView } = dashboardProps;
    const panels = await convertSavedDashboardToPanels(dashboardProps);

    if (!panels) {
      throw new Error('Failed parsing dashboard panels.');
    }

    return {
      useControlsIntegration: true,
      getInitialInput: () => ({
        viewMode: 'view',
        panels,
        pinned_panels: [
          {
            type: OPTIONS_LIST_CONTROL,
            config: {
              ...DEFAULT_DSL_OPTIONS_LIST_STATE,
              data_view_id: dataView.id ?? '',
              title: 'Node name',
              field_name: 'service.node.name',
              esql_query: undefined as never,
            },
            width: 'medium',
            grow: true,
          },
        ],
      }),
    };
  } catch (error) {
    notifications.toasts.addDanger(getLoadFailureToastLabels(dashboardProps, error));
    return {};
  }
}

export function getFilters(serviceName: string, environment: string, dataView: DataView): Filter[] {
  const filters: Filter[] = [];

  const serviceNameField = dataView.getFieldByName('service.name');
  if (serviceNameField) {
    const serviceNameFilter = buildPhraseFilter(serviceNameField, serviceName, dataView);
    filters.push(serviceNameFilter);
  }

  const environmentField = dataView.getFieldByName('service.environment');
  if (environmentField && environment && environment !== ENVIRONMENT_ALL.value) {
    if (environment === ENVIRONMENT_NOT_DEFINED.value) {
      const envExistsFilter = buildExistsFilter(environmentField, dataView);
      envExistsFilter.meta.negate = true;
      filters.push(envExistsFilter);
    } else {
      const environmentFilter = buildPhraseFilter(environmentField, environment, dataView);
      filters.push(environmentFilter);
    }
  }

  return filters;
}

function getLoadFailureToastLabels(props: MetricsDashboardProps, error: Error) {
  return {
    title: i18n.translate('xpack.apm.runtimeMetricsJsonDashboards.loadFailure.toast.title', {
      defaultMessage:
        'Error while loading dashboard for agent "{agentName}" on runtime "{runtimeName}".',
      values: {
        agentName: props.agentName ?? 'unknown',
        runtimeName: props.runtimeName ?? 'unknown',
      },
    }),
    text: error.message,
  };
}
