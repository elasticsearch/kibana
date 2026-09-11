/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import { css } from '@emotion/react';
import { useEuiTheme } from '@elastic/eui';
import { VisualizationContextMenuActions } from '../../../common/components/visualization_actions/types';
import { useSpaceId } from '../../../common/hooks/use_space_id';
import * as i18n from './translations';
import { getThreatsDetectedMetricLensAttributes } from '../../../common/components/visualization_actions/lens_attributes/ai/threats_detected_metric';
import { VisualizationEmbeddable } from '../../../common/components/visualization_actions/visualization_embeddable';
import { useAIValueExportContext } from '../../providers/ai_value/export_provider';
import { SampleMetric } from './sample_metric';
import { SAMPLE_VALUE_METRICS } from './sample_data';
import { formatThousands } from './metrics';

interface Props {
  isSample: boolean;
  from: string;
  to: string;
}
const ID = 'ThreatsDetectedMetricQuery';

const VISUALIZATION_ACTIONS = [
  VisualizationContextMenuActions.addToCase,
  VisualizationContextMenuActions.inspect,
];

interface LiveContentProps {
  from: string;
  to: string;
}

const LiveThreatsDetectedMetricContent: React.FC<LiveContentProps> = ({ from, to }) => {
  const spaceId = useSpaceId();
  return (
    <VisualizationEmbeddable
      data-test-subj="threats-detected-metric"
      getLensAttributes={(args) =>
        getThreatsDetectedMetricLensAttributes({ ...args, spaceId: spaceId ?? 'default' })
      }
      timerange={{ from, to }}
      id={`${ID}-area-embeddable`}
      inspectTitle={i18n.THREATS_DETECTED}
      withActions={VISUALIZATION_ACTIONS}
    />
  );
};

const SampleThreatsDetectedMetricContent: React.FC = () => (
  <SampleMetric
    id={`${ID}-sample`}
    title={i18n.THREATS_DETECTED}
    value={SAMPLE_VALUE_METRICS.attackDiscoveryCount} // Lens is pulling the live data, but we have to pull the sample value
    valueFormatter={formatThousands}
    icon="crosshair"
  />
);

const ThreatsDetectedMetricComponent: React.FC<Props> = ({ isSample, from, to }) => {
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
          ${isExportMode ? 'display: none;' : `fill: ${colors.vis.euiColorVis6};`}
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
        <SampleThreatsDetectedMetricContent />
      ) : (
        <LiveThreatsDetectedMetricContent from={from} to={to} />
      )}
    </div>
  );
};

export const ThreatsDetectedMetric = React.memo(ThreatsDetectedMetricComponent);
