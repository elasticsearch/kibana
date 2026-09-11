/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useId, useMemo } from 'react';

import { css } from '@emotion/react';
import { useEuiTheme } from '@elastic/eui';
import {
  Chart,
  Partition,
  PartitionLayout,
  Settings,
  type Datum,
  type PartialTheme,
} from '@elastic/charts';
import { i18n as i18nLib } from '@kbn/i18n';
import { TOTAL_ALERTS_PROCESSED } from './translations';
import { PageScope } from '../../../data_view_manager/constants';
import { VisualizationContextMenuActions } from '../../../common/components/visualization_actions/types';
import { useSpaceId } from '../../../common/hooks/use_space_id';
import { getAlertProcessingDonutAttributes } from '../../../common/components/visualization_actions/lens_attributes/ai/alert_processing_donut';
import { VisualizationEmbeddable } from '../../../common/components/visualization_actions/visualization_embeddable';
import { DonutChartWrapper } from '../../../common/components/charts/donutchart';
import { useThemes } from '../../../common/components/charts/common';
import { ChartLabel } from '../../../overview/components/detection_response/alerts_by_status/chart_label';
import { SAMPLE_VALUE_METRICS } from './sample_data';
import * as i18n from './translations';

const ChartSize = 250;

const VISUALIZATION_ACTIONS = [
  VisualizationContextMenuActions.addToCase,
  VisualizationContextMenuActions.inspect,
];
const visualizationIdPrefix = 'aiValueAlertProcessingDonut';

const donutTheme: PartialTheme = {
  chartMargins: { top: 0, bottom: 0, left: 0, right: 0 },
  partition: {
    idealFontSizeJump: 1.1,
    outerSizeRatio: 1,
    emptySizeRatio: 0.8,
    circlePadding: 4,
  },
};

interface Props {
  isSample: boolean;
  attackAlertIds: string[];
  from: string;
  to: string;
}

const LiveAlertProcessingDonut: React.FC<{
  attackAlertIds: string[];
  from: string;
  to: string;
}> = ({ attackAlertIds, from, to }) => {
  const spaceId = useSpaceId();
  const instanceId = useId();
  const visualizationId = `${visualizationIdPrefix}-${instanceId}`;

  return (
    <VisualizationEmbeddable
      applyGlobalQueriesAndFilters={false}
      getLensAttributes={(args) =>
        getAlertProcessingDonutAttributes({
          ...args,
          attackAlertIds,
          spaceId: spaceId ?? 'default',
        })
      }
      height={ChartSize}
      width={'100%'}
      id={visualizationId}
      isDonut={true}
      donutTitleLabel={TOTAL_ALERTS_PROCESSED}
      donutTextWrapperClassName={'donutText'}
      scopeId={PageScope.alerts}
      timerange={{ from, to }}
      withActions={VISUALIZATION_ACTIONS}
    />
  );
};

const SampleAlertProcessingDonut: React.FC = () => {
  const { baseTheme, theme } = useThemes();
  const {
    euiTheme: { colors },
  } = useEuiTheme();

  const totalAlerts = SAMPLE_VALUE_METRICS.totalAlerts;
  const data = useMemo(
    () => [
      { key: i18n.AI_FILTERED, value: SAMPLE_VALUE_METRICS.filteredAlerts },
      {
        key: i18n.ESCALATED,
        value: SAMPLE_VALUE_METRICS.totalAlerts - SAMPLE_VALUE_METRICS.filteredAlerts,
      },
    ],
    []
  );
  const fillColor = (dataName: string) =>
    dataName === i18n.ESCALATED ? colors.vis.euiColorVis9 : colors.vis.euiColorVis0;

  return (
    <DonutChartWrapper
      isChartEmbeddablesEnabled={true}
      dataExists={true}
      title={
        <>
          <span className="donutTitleLabel">{TOTAL_ALERTS_PROCESSED}</span>
          <ChartLabel count={totalAlerts} />
        </>
      }
      donutTextWrapperClassName="donutText"
    >
      <Chart size={ChartSize}>
        <Settings
          theme={[donutTheme, { background: { color: 'transparent' } }, theme]}
          baseTheme={baseTheme}
          locale={i18nLib.getLocale()}
        />
        <Partition
          id="sample-donut-chart"
          data={data}
          layout={PartitionLayout.sunburst}
          valueAccessor={(d) => d.value}
          layers={[
            {
              groupByRollup: (d: Datum) => d.key,
              nodeLabel: (d) => `${d}`,
              shape: { fillColor },
            },
          ]}
        />
      </Chart>
    </DonutChartWrapper>
  );
};

export const AlertProcessingDonut: React.FC<Props> = ({ isSample, attackAlertIds, from, to }) => {
  const {
    euiTheme: { font },
  } = useEuiTheme();

  return (
    <div
      className="donutChart"
      css={css`
        // hide filtering actions in the legend
        .echLegendItem__action {
          display: none;
        }
        .donutText {
          text-align: center;
          top: 44% !important;
          max-width: 100% !important;
          .donutTitleLabel {
            font-size: ${font.scale.m}em;
          }
          b {
            font-size: ${font.scale.xl}em;
          }
        }
        .euiPanel,
        .embPanel,
        .echMetric,
        .echChartBackground,
        .embPanel__hoverActions > span {
          background-color: rgb(0, 0, 0, 0) !important;
        }
        .donutChart .euiPanel {
          background-color: rgb(255, 255, 255, 0);
        }
      `}
    >
      {isSample ? (
        <SampleAlertProcessingDonut />
      ) : (
        <LiveAlertProcessingDonut attackAlertIds={attackAlertIds} from={from} to={to} />
      )}
    </div>
  );
};
