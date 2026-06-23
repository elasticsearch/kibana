/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useKibana } from '@kbn/kibana-react-plugin/public';
import React, { useMemo } from 'react';
import { useEuiTheme } from '@elastic/eui';
import { ERRORS_LABEL } from '../../../../monitor_details/monitor_summary/monitor_errors_count';
import type { ClientPluginsStart } from '../../../../../../../plugin';
import { useMonitorFilters } from '../../../hooks/use_monitor_filters';
import { useMonitorQueryFilters } from '../../../hooks/use_monitor_query_filters';
import { useOverviewDataViewIndexPatterns } from '../../../hooks/use_overview_data_view_index_patterns';

interface Props {
  from: string;
  to: string;
}
export const OverviewErrorsSparklines = ({ from, to }: Props) => {
  const {
    exploratoryView: { ExploratoryViewEmbeddable },
  } = useKibana<ClientPluginsStart>().services;

  const filters = useMonitorFilters({});
  const { euiTheme } = useEuiTheme();

  const time = useMemo(() => ({ from, to }), [from, to]);
  const queryFilters = useMonitorQueryFilters();
  const { dataTypesIndexPatterns, loading } = useOverviewDataViewIndexPatterns();

  // Wait for the CCS index pattern to resolve before mounting the embeddable;
  // it latches its first data view title (see useOverviewDataViewIndexPatterns).
  if (loading) {
    return null;
  }

  return (
    <ExploratoryViewEmbeddable
      id="overviewErrorsSparklines"
      dataTestSubj="overviewErrorsSparklines"
      reportType="kpi-over-time"
      axisTitlesVisibility={{ x: false, yRight: false, yLeft: false }}
      legendIsVisible={false}
      hideTicks={true}
      dslFilters={queryFilters}
      dataTypesIndexPatterns={dataTypesIndexPatterns}
      attributes={[
        {
          time,
          seriesType: 'area',
          reportDefinitions: {
            'monitor.type': ['http', 'tcp', 'browser', 'icmp'],
          },
          dataType: 'synthetics',
          selectedMetricField: 'monitor_errors',
          name: ERRORS_LABEL,
          color: euiTheme.colors.vis.euiColorVis6,
          operationType: 'unique_count',
          filters,
        },
      ]}
    />
  );
};
