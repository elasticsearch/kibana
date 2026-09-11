/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiPanel, EuiText, EuiTitle } from '@elastic/eui';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { ReportTypes } from '@kbn/exploratory-view-plugin/public';
import { i18n } from '@kbn/i18n';

import type { Position } from '@elastic/charts/dist/utils/common';
import { useMonitorQueryFilters } from '../hooks/use_monitor_query_filters';
import { useSelectedMonitor } from '../hooks/use_selected_monitor';
import { useSyntheticsDataViewIndexPatterns } from '../hooks/use_synthetics_data_view_index_patterns';
import type { ClientPluginsStart } from '../../../../../plugin';
import { useAbsoluteDate } from '../../../hooks';

export const StepDurationPanel = ({
  legendPosition,
  doBreakdown = true,
}: {
  legendPosition?: Position;
  doBreakdown?: boolean;
}) => {
  const {
    exploratoryView: { ExploratoryViewEmbeddable },
  } = useKibana<ClientPluginsStart>().services;
  const time = useAbsoluteDate({ from: 'now-24h/h', to: 'now' });

  const { monitor } = useSelectedMonitor();

  const { queryIdFilter, locationFilter } = useMonitorQueryFilters();
  const dataTypesIndexPatterns = useSyntheticsDataViewIndexPatterns();

  // API journeys produce synthexec `step/end` events with
  // `synthetics.step.duration.us` and `synthetics.step.name`, so they share
  // the per-step breakdown with browser monitors. HTTP/TCP/ICMP have no step
  // concept and fall back to `monitor.duration.us` broken down by location.
  const isStepBased = monitor?.type === 'browser' || monitor?.type === 'api';

  if (!queryIdFilter) {
    return null;
  }

  const label = !doBreakdown
    ? MONITOR_DURATION
    : isStepBased
    ? DURATION_BY_STEP_LABEL
    : DURATION_BY_LOCATION;

  return (
    <EuiPanel hasShadow={false} hasBorder>
      <EuiFlexGroup alignItems="center" gutterSize="s">
        <EuiFlexItem grow={false}>
          <EuiTitle size="xs">
            <h3>{label}</h3>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiText size="s" color="subdued">
            {LAST_24H_LABEL}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>

      <ExploratoryViewEmbeddable
        id="stepDurationLines"
        axisTitlesVisibility={{ yLeft: false, yRight: false, x: false }}
        customHeight={'300px'}
        reportType={ReportTypes.KPI}
        legendPosition={legendPosition}
        legendIsVisible={doBreakdown}
        dataTypesIndexPatterns={dataTypesIndexPatterns}
        attributes={[
          {
            time,
            name: label,
            reportDefinitions: queryIdFilter,
            filters: locationFilter,
            selectedMetricField:
              isStepBased && doBreakdown ? 'synthetics.step.duration.us' : 'monitor.duration.us',
            dataType: 'synthetics',
            operationType: doBreakdown ? 'last_value' : 'average',
            seriesType: 'area_stacked',
            ...(doBreakdown
              ? { breakdown: isStepBased ? 'synthetics.step.name.keyword' : 'observer.geo.name' }
              : {}),
          },
        ]}
      />
    </EuiPanel>
  );
};

const DURATION_BY_STEP_LABEL = i18n.translate('xpack.synthetics.detailsPanel.durationByStep', {
  defaultMessage: 'Duration by step',
});

const DURATION_BY_LOCATION = i18n.translate('xpack.synthetics.detailsPanel.durationByLocation', {
  defaultMessage: 'Duration by location',
});

const MONITOR_DURATION = i18n.translate('xpack.synthetics.detailsPanel.monitorDuration', {
  defaultMessage: 'Monitor duration',
});

const LAST_24H_LABEL = i18n.translate('xpack.synthetics.detailsPanel.last24Hours', {
  defaultMessage: 'Last 24 hours',
});
