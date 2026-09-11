/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
  EuiTitle,
  useEuiTheme,
  useIsWithinMaxBreakpoint,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { Chart, Settings, Position, Tooltip, Axis, ScaleType, LineSeries } from '@elastic/charts';
import { i18n as i18nLib } from '@kbn/i18n';
import { PageScope } from '../../../data_view_manager/constants';
import { useSignalIndexWithDefault } from '../../hooks/use_signal_index_with_default';
import * as i18n from './translations';
import type {
  EmbeddableData,
  GetLensAttributes,
  VisualizationTablesWithMeta,
} from '../../../common/components/visualization_actions/types';
import { VisualizationContextMenuActions } from '../../../common/components/visualization_actions/types';
import { VisualizationEmbeddable } from '../../../common/components/visualization_actions/visualization_embeddable';
import { getCostSavingsTrendAreaLensAttributes } from '../../../common/components/visualization_actions/lens_attributes/ai/cost_savings_trend_area';
import { CostSavingsKeyInsight } from './cost_savings_key_insight';
import { formatDollars } from './metrics';
import { getSampleTrendData } from './sample_data';
import { useThemes } from '../../../common/components/charts/common';
import { COST_SAVINGS_TITLE } from './translations';

interface Props {
  isSample: boolean;
  from: string;
  to: string;
  minutesPerAlert: number;
  analystHourlyRate: number;
}
const formatTooltipHeader = ({ value }: { value: number }) => {
  const d = new Date(value);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hour = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${min}`;
};

const ID = 'CostSavingsTrendQuery';

const VISUALIZATION_ACTIONS = [
  VisualizationContextMenuActions.addToCase,
  VisualizationContextMenuActions.inspect,
];

const LiveTrendVisualization: React.FC<{
  from: string;
  to: string;
  minutesPerAlert: number;
  analystHourlyRate: number;
  onLoad: (data: EmbeddableData) => void;
}> = ({ from, to, minutesPerAlert, analystHourlyRate, onLoad }) => {
  const timerange = useMemo(() => ({ from, to }), [from, to]);
  const signalIndexName = useSignalIndexWithDefault();
  const getLensAttributes = useCallback<GetLensAttributes>(
    (args) =>
      getCostSavingsTrendAreaLensAttributes({
        ...args,
        minutesPerAlert,
        analystHourlyRate,
        signalIndexName,
      }),
    [analystHourlyRate, minutesPerAlert, signalIndexName]
  );

  return (
    <VisualizationEmbeddable
      data-test-subj="embeddable-area-chart"
      getLensAttributes={getLensAttributes}
      timerange={timerange}
      onLoad={onLoad}
      id={`${ID}-area-embeddable`}
      height={300}
      inspectTitle={i18n.COST_SAVINGS_TREND}
      scopeId={PageScope.alerts}
      withActions={VISUALIZATION_ACTIONS}
    />
  );
};

const SampleTrendVisualization: React.FC<{ from: string; to: string }> = ({ from, to }) => {
  const { baseTheme, theme } = useThemes();
  const data = useMemo(() => getSampleTrendData(from, to), [from, to]);

  return (
    <div data-test-subj="sample-cost-savings-trend">
      <Chart size={{ height: 300 }}>
        <Settings
          theme={[
            {
              background: { color: 'transparent' },
              legend: { spacingBuffer: 100 },
            },
            theme,
          ]}
          baseTheme={baseTheme}
          locale={i18nLib.getLocale()}
          showLegend={false}
          legendPosition={Position.Right}
        />
        <Tooltip headerFormatter={formatTooltipHeader} type="follow" />
        <Axis
          id="bottom"
          position={Position.Bottom}
          /* no title — matches axisTitlesVisibilitySettings.x: false */
        />
        <Axis
          id="left"
          position={Position.Left}
          tickFormat={formatDollars}
          /* no title — matches axisTitlesVisibilitySettings.yLeft: false */
        />
        <LineSeries
          id="cost-savings"
          name={COST_SAVINGS_TITLE}
          xScaleType={ScaleType.Time}
          yScaleType={ScaleType.Linear}
          xAccessor="timestamp"
          yAccessors={['costSavings']}
          data={data}
        />
      </Chart>
    </div>
  );
};

const CostSavingsTrendComponent: React.FC<Props> = ({
  from,
  to,
  minutesPerAlert,
  analystHourlyRate,
  isSample,
}) => {
  const isSmall = useIsWithinMaxBreakpoint('s');
  const {
    euiTheme: { size },
  } = useEuiTheme();

  const [lensResponse, setLensResponse] = useState<VisualizationTablesWithMeta | null>(null);

  const handleEmbeddableLoad = useCallback((data: EmbeddableData) => {
    if (data?.tables) {
      setLensResponse(data.tables);
    }
  }, []);
  useEffect(() => {
    // when timerange changes, reset lens response
    setLensResponse(null);
  }, [from, to]);

  return (
    <div
      css={css`
        padding: ${size.base} ${size.xl};
        .euiPanel,
        .embPanel,
        .echMetric,
        .echChartBackground,
        .embPanel__hoverActions > span {
          background-color: rgb(0, 0, 0, 0) !important;
        }
      `}
      data-test-subj="cost-savings-trend-panel"
    >
      <EuiTitle size="m">
        <h2>{i18n.COST_SAVINGS_TREND}</h2>
      </EuiTitle>
      <EuiSpacer size="l" />
      <EuiFlexGroup
        gutterSize="xl"
        css={css`
          gap: 48px;
        `}
      >
        <EuiFlexItem>
          {isSample ? (
            <SampleTrendVisualization from={from} to={to} />
          ) : (
            <LiveTrendVisualization
              from={from}
              to={to}
              minutesPerAlert={minutesPerAlert}
              analystHourlyRate={analystHourlyRate}
              onLoad={handleEmbeddableLoad}
            />
          )}
        </EuiFlexItem>
        <EuiFlexItem
          css={css`
            max-width: ${isSmall ? 'auto' : '600px'};
          `}
        >
          <CostSavingsKeyInsight
            isSample={isSample}
            from={from}
            to={to}
            lensResponse={lensResponse}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    </div>
  );
};

export const CostSavingsTrend = React.memo(CostSavingsTrendComponent);
