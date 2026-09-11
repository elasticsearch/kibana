/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';

import { css } from '@emotion/react';
import { useEuiTheme } from '@elastic/eui';
import { PageScope } from '../../../data_view_manager/constants';
import { useSignalIndexWithDefault } from '../../hooks/use_signal_index_with_default';
import { getExcludeAlertsFilters } from './utils';
import type { GetLensAttributes } from '../../../common/components/visualization_actions/types';
import { VisualizationContextMenuActions } from '../../../common/components/visualization_actions/types';
import { getAlertFilteringMetricLensAttributes } from '../../../common/components/visualization_actions/lens_attributes/ai/alert_filtering_metric';
import * as i18n from './translations';
import { VisualizationEmbeddable } from '../../../common/components/visualization_actions/visualization_embeddable';
import { useAIValueExportContext } from '../../providers/ai_value/export_provider';
import { SampleMetric } from './sample_metric';
import { SAMPLE_VALUE_METRICS } from './sample_data';
import { formatPercent } from './metrics';

interface Props {
  isSample: boolean;
  attackAlertIds: string[];
  from: string;
  to: string;
  totalAlerts: number;
}
const ID = 'AlertFilteringMetricQuery';

const VISUALIZATION_ACTIONS = [
  VisualizationContextMenuActions.addToCase,
  VisualizationContextMenuActions.inspect,
];

interface LiveContentProps {
  attackAlertIds: string[];
  from: string;
  to: string;
  totalAlerts: number;
}

const LiveAlertFilteringMetricContent: React.FC<LiveContentProps> = ({
  attackAlertIds,
  from,
  to,
  totalAlerts,
}) => {
  const extraVisualizationOptions = useMemo(
    () => ({
      filters: getExcludeAlertsFilters(attackAlertIds),
    }),
    [attackAlertIds]
  );
  const signalIndexName = useSignalIndexWithDefault();
  const getLensAttributes = useCallback<GetLensAttributes>(
    (args) => getAlertFilteringMetricLensAttributes({ ...args, signalIndexName, totalAlerts }),
    [signalIndexName, totalAlerts]
  );
  return (
    <VisualizationEmbeddable
      data-test-subj="alert-filtering-metric"
      extraOptions={extraVisualizationOptions}
      getLensAttributes={getLensAttributes}
      timerange={{ from, to }}
      id={`${ID}-area-embeddable`}
      inspectTitle={i18n.FILTERING_RATE}
      scopeId={PageScope.alerts}
      withActions={VISUALIZATION_ACTIONS}
    />
  );
};

const SampleAlertFilteringMetricContent: React.FC = () => (
  <SampleMetric
    id={`${ID}-sample`}
    title={i18n.FILTERING_RATE}
    value={SAMPLE_VALUE_METRICS.filteredAlertsPerc}
    valueFormatter={formatPercent}
    icon="chartLine"
  />
);

const AlertFilteringMetricComponent: React.FC<Props> = ({
  isSample,
  attackAlertIds,
  from,
  to,
  totalAlerts,
}) => {
  const {
    euiTheme: { colors },
  } = useEuiTheme();
  const aiValueExportContext = useAIValueExportContext();
  const isExportMode = aiValueExportContext?.isExportMode === true;
  return (
    <div
      css={css`
        height: 100%;
        > * {
          height: 100% !important;
        }
        .echMetricText__icon .euiIcon {
          ${isExportMode ? 'display: none;' : `fill: ${colors.vis.euiColorVis4};`}
        }
        .echMetricText__valueBlock {
          grid-row-start: 3 !important;
        }
        .echMetricText {
          padding: 8px 16px 60px;
        }
        .echMetricText {
          display: grid !important;
          grid-template-columns: auto auto 1fr !important;
          gap: 8px !important;
          align-items: center !important;
        }
        .echMetricText__titlesBlock--left {
          grid-column: 1 !important;
        }
        .echMetricText__icon--right {
          grid-column: 2 !important;
        }
        .euiPanel,
        .embPanel,
        .echMetric,
        .echChartBackground,
        .embPanel__hoverActions > span {
          background-color: rgb(0, 0, 0, 0) !important;
        }
      `}
    >
      {isSample ? (
        <SampleAlertFilteringMetricContent />
      ) : (
        <LiveAlertFilteringMetricContent
          attackAlertIds={attackAlertIds}
          from={from}
          to={to}
          totalAlerts={totalAlerts}
        />
      )}
    </div>
  );
};

export const AlertFilteringMetric = React.memo(AlertFilteringMetricComponent);
