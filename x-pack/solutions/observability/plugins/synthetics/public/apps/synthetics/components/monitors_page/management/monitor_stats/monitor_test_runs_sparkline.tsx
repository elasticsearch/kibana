/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEuiTheme } from '@elastic/eui';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import React from 'react';
import type { ClientPluginsStart } from '../../../../../../plugin';
import { useRefreshedRange } from '../../../../hooks';
import { useMonitorFilters } from '../../hooks/use_monitor_filters';
import { useMonitorQueryFilters } from '../../hooks/use_monitor_query_filters';
import * as labels from '../labels';

export const MonitorTestRunsSparkline = () => {
  const {
    exploratoryView: { ExploratoryViewEmbeddable },
  } = useKibana<ClientPluginsStart>().services;
  const { euiTheme } = useEuiTheme();

  const { from, to } = useRefreshedRange(30, 'days');
  const filters = useMonitorFilters({});
  const queryFilter = useMonitorQueryFilters();

  return (
    <ExploratoryViewEmbeddable
      id="monitor-test-runs-sparkline"
      reportType="kpi-over-time"
      axisTitlesVisibility={{ x: false, yRight: false, yLeft: false }}
      legendIsVisible={false}
      hideTicks={true}
      attributes={[
        {
          seriesType: 'area',
          time: { from, to },
          reportDefinitions: {
            'monitor.type': ['http', 'tcp', 'browser', 'icmp', 'api'],
          },
          dataType: 'synthetics',
          selectedMetricField: 'total_test_runs',
          filters,
          name: labels.TEST_RUNS_LABEL,
          color: euiTheme.colors.vis.euiColorVis0,
          operationType: 'count',
        },
      ]}
      customHeight={'68px'}
      dslFilters={queryFilter}
    />
  );
};
