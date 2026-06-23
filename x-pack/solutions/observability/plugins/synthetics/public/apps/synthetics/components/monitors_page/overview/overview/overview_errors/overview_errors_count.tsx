/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEuiTheme } from '@elastic/eui';
import { ReportTypes } from '@kbn/exploratory-view-plugin/public';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import React, { useMemo } from 'react';
import type { ClientPluginsStart } from '../../../../../../../plugin';
import { ERRORS_LABEL } from '../../../../monitor_details/monitor_summary/monitor_errors_count';
import { useMonitorFilters } from '../../../hooks/use_monitor_filters';
import { useMonitorQueryFilters } from '../../../hooks/use_monitor_query_filters';
import { useOverviewDataViewIndexPatterns } from '../../../hooks/use_overview_data_view_index_patterns';

interface MonitorErrorsCountProps {
  from: string;
  to: string;
}

export const OverviewErrorsCount = ({ from, to }: MonitorErrorsCountProps) => {
  const {
    exploratoryView: { ExploratoryViewEmbeddable },
  } = useKibana<ClientPluginsStart>().services;
  const { euiTheme } = useEuiTheme();

  const filters = useMonitorFilters({});
  const queryFilters = useMonitorQueryFilters();
  const time = useMemo(() => ({ from, to }), [from, to]);
  const { dataTypesIndexPatterns, loading } = useOverviewDataViewIndexPatterns();

  // Wait for the CCS index pattern to resolve before mounting the embeddable;
  // it latches its first data view title (see useOverviewDataViewIndexPatterns).
  if (loading) {
    return null;
  }

  return (
    <ExploratoryViewEmbeddable
      id="overviewErrorsCount"
      align="left"
      customHeight="70px"
      dslFilters={queryFilters}
      dataTypesIndexPatterns={dataTypesIndexPatterns}
      reportType={ReportTypes.SINGLE_METRIC}
      attributes={[
        {
          time,
          reportDefinitions: {
            'monitor.type': ['http', 'tcp', 'browser', 'icmp'],
          },
          dataType: 'synthetics',
          selectedMetricField: 'monitor_errors',
          name: ERRORS_LABEL,
          filters,
          color: euiTheme.colors.vis.euiColorVis6,
        },
      ]}
    />
  );
};
