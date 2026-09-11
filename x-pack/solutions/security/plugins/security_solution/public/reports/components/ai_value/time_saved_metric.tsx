/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';

import { css } from '@emotion/react';
import { useEuiTheme } from '@elastic/eui';
import { formatThousands } from './metrics';
import { PageScope } from '../../../data_view_manager/constants';
import { useSignalIndexWithDefault } from '../../hooks/use_signal_index_with_default';
import {
  type GetLensAttributes,
  VisualizationContextMenuActions,
} from '../../../common/components/visualization_actions/types';
import { getTimeSavedMetricLensAttributes } from '../../../common/components/visualization_actions/lens_attributes/ai/time_saved_metric';
import * as i18n from './translations';
import { VisualizationEmbeddable } from '../../../common/components/visualization_actions/visualization_embeddable';
import { useAIValueExportContext } from '../../providers/ai_value/export_provider';
import { SampleMetric } from './sample_metric';
import { SAMPLE_VALUE_METRICS } from './sample_data';

interface Props {
  isSample: boolean;
  from: string;
  to: string;
  minutesPerAlert: number;
}
const ID = 'TimeSavedMetricQuery';

const VISUALIZATION_ACTIONS = [
  VisualizationContextMenuActions.addToCase,
  VisualizationContextMenuActions.inspect,
];

interface LiveContentProps {
  from: string;
  to: string;
  minutesPerAlert: number;
}

const LiveTimeSavedMetricContent: React.FC<LiveContentProps> = ({ from, to, minutesPerAlert }) => {
  const timerange = useMemo(() => ({ from, to }), [from, to]);
  const signalIndexName = useSignalIndexWithDefault();

  const getLensAttributes = useCallback<GetLensAttributes>(
    (args) => getTimeSavedMetricLensAttributes({ ...args, minutesPerAlert, signalIndexName }),
    [minutesPerAlert, signalIndexName]
  );
  return (
    <VisualizationEmbeddable
      data-test-subj="time-saved-metric"
      getLensAttributes={getLensAttributes}
      timerange={timerange}
      id={`${ID}-metric`}
      inspectTitle={i18n.TIME_SAVED}
      scopeId={PageScope.alerts}
      withActions={VISUALIZATION_ACTIONS}
    />
  );
};

const SampleTimeSavedMetricContent: React.FC = () => (
  <SampleMetric
    id={`${ID}-sample`}
    title={i18n.TIME_SAVED}
    value={SAMPLE_VALUE_METRICS.hoursSaved}
    valueFormatter={formatThousands}
    icon="clock"
  />
);

/**
 * Renders a Lens embeddable metric visualization showing the estimated time saved
 * based on the number of AI filtered alerts and minutes saved per alert for a given time range.
 *
 * When `isSample` is true, renders a sample metric backed by `SAMPLE_VALUE_METRICS`.
 */
const TimeSavedMetricComponent: React.FC<Props> = ({ isSample, from, to, minutesPerAlert }) => {
  const {
    euiTheme: { colors },
  } = useEuiTheme();
  const aiValueExportContext = useAIValueExportContext();
  const isExportMode = aiValueExportContext?.isExportMode === true;

  return (
    <div
      data-test-subj="time-saved-metric-container"
      css={css`
        height: 100%;
        > * {
          height: 100% !important;
        }
        .echMetricText__icon .euiIcon {
          ${isExportMode ? 'display: none;' : `fill: ${colors.vis.euiColorVis2};`}
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
        <SampleTimeSavedMetricContent />
      ) : (
        <LiveTimeSavedMetricContent from={from} to={to} minutesPerAlert={minutesPerAlert} />
      )}
    </div>
  );
};

export const TimeSavedMetric = React.memo(TimeSavedMetricComponent);
