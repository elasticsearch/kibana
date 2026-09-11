/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as React from 'react';
import { getAlertsSingleMetricConfig } from './configurations/alerts_configs/single_metric_config';
import { getAlertsKPIConfig } from './configurations/alerts_configs/kpi_over_time_config';
import { DataTypes, DataTypesLabels } from './labels';
import { getSyntheticsHeatmapConfig } from './configurations/synthetics/heatmap_config';
import { getSyntheticsSingleMetricConfig } from './configurations/synthetics/single_metric_config';
import { ExploratoryViewPage } from '.';
import { ExploratoryViewContextProvider } from './contexts/exploratory_view_config';
import type { AppDataType, ReportViewType } from './types';

import {
  CORE_WEB_VITALS_LABEL,
  DEVICE_DISTRIBUTION_LABEL,
  HEATMAP_LABEL,
  KPI_OVER_TIME_LABEL,
  PERF_DIST_LABEL,
  SINGLE_METRIC_LABEL,
} from './configurations/constants/labels';
import type { SELECT_REPORT_TYPE } from './series_editor/series_editor';
import { getRumDistributionConfig } from './configurations/rum/data_distribution_config';
import { getKPITrendsLensConfig } from './configurations/rum/kpi_over_time_config';
import { getCoreWebVitalsConfig } from './configurations/rum/core_web_vitals_config';
import { getSyntheticsKPIConfig } from './configurations/synthetics/kpi_over_time_config';
import { getSyntheticsDistributionConfig } from './configurations/synthetics/data_distribution_config';
import { getMobileKPIDistributionConfig } from './configurations/mobile/distribution_config';
import { getMobileKPIConfig } from './configurations/mobile/kpi_over_time_config';
import { getMobileDeviceDistributionConfig } from './configurations/mobile/device_distribution_config';
import { getLogsKPIConfig } from './configurations/infra_logs/kpi_over_time_config';
import { getSingleMetricConfig } from './configurations/rum/single_metric_config';
import type { StartServices } from '../../../application';

export const dataTypes: Array<{ id: AppDataType; label: string }> = [
  {
    id: DataTypes.UPTIME,
    label: DataTypesLabels[DataTypes.UPTIME],
  },
  {
    id: DataTypes.SYNTHETICS,
    label: DataTypesLabels[DataTypes.SYNTHETICS],
  },
  {
    id: DataTypes.UPTIME,
    label: DataTypesLabels[DataTypes.UPTIME],
  },
  {
    id: DataTypes.UX,
    label: DataTypesLabels[DataTypes.UX],
  },
  {
    id: DataTypes.LOGS,
    label: DataTypesLabels[DataTypes.LOGS],
  },
  {
    id: DataTypes.MOBILE,
    label: DataTypesLabels[DataTypes.MOBILE],
  },
  {
    id: DataTypes.ALERTS,
    label: DataTypesLabels[DataTypes.ALERTS],
  },
];

export const reportTypesList: Array<{
  reportType: ReportViewType | typeof SELECT_REPORT_TYPE;
  label: string;
}> = [
  { reportType: 'kpi-over-time', label: KPI_OVER_TIME_LABEL },
  { reportType: 'data-distribution', label: PERF_DIST_LABEL },
  { reportType: 'core-web-vitals', label: CORE_WEB_VITALS_LABEL },
  { reportType: 'device-data-distribution', label: DEVICE_DISTRIBUTION_LABEL },
  { reportType: 'single-metric', label: SINGLE_METRIC_LABEL },
  { reportType: 'heatmap', label: HEATMAP_LABEL },
];

export const obsvReportConfigMap = {
  [DataTypes.UX]: [
    getKPITrendsLensConfig,
    getRumDistributionConfig,
    getCoreWebVitalsConfig,
    getSingleMetricConfig,
  ],
  [DataTypes.SYNTHETICS]: [
    getSyntheticsKPIConfig,
    getSyntheticsDistributionConfig,
    getSyntheticsSingleMetricConfig,
    getSyntheticsHeatmapConfig,
  ],
  [DataTypes.UPTIME]: [
    getSyntheticsKPIConfig,
    getSyntheticsDistributionConfig,
    getSyntheticsSingleMetricConfig,
    getSyntheticsHeatmapConfig,
  ],
  [DataTypes.MOBILE]: [
    getMobileKPIConfig,
    getMobileKPIDistributionConfig,
    getMobileDeviceDistributionConfig,
  ],
  [DataTypes.LOGS]: [getLogsKPIConfig],
  [DataTypes.ALERTS]: [getAlertsKPIConfig, getAlertsSingleMetricConfig],
};

export function ObservabilityExploratoryView(props: { startServices: StartServices }) {
  return (
    <ExploratoryViewContextProvider
      reportTypes={reportTypesList}
      dataTypes={dataTypes}
      reportConfigMap={obsvReportConfigMap}
      {...props.startServices}
    >
      <ExploratoryViewPage />
    </ExploratoryViewContextProvider>
  );
}
