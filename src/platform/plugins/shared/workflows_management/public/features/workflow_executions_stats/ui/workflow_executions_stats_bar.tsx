/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Color } from '@elastic/charts';
import {
  Axis,
  BarSeries,
  Chart,
  niceTimeFormatter,
  Position,
  ScaleType,
  Settings,
  Tooltip,
} from '@elastic/charts';
import { timeFormatter } from '@elastic/charts/dist/utils/data/formatters';
import { EuiPageTemplate, useEuiTheme } from '@elastic/eui';
import React from 'react';
import { ExecutionStatus } from '@kbn/workflows';
import { useWorkflowStats } from '../../../entities/workflows/model/use_workflow_stats';

interface WorkflowExecutionStatsBarProps {
  height?: number;
}

export function WorkflowExecutionStatsBar({ height }: WorkflowExecutionStatsBarProps) {
  const { data, isLoading } = useWorkflowStats();

  const { euiTheme } = useEuiTheme();

  if (isLoading || data === undefined) {
    return <EuiPageTemplate offset={0} />;
  }

  if (!data.executions?.length) {
    return null;
  }

  const executionStats: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  data.executions.forEach((day, index) => {
    executionStats.push({
      timestamp: day.timestamp,
      count: day.completed,
      label: ExecutionStatus.COMPLETED,
    });
    executionStats.push({
      timestamp: day.timestamp,
      count: day.failed,
      label: ExecutionStatus.FAILED,
    });
    executionStats.push({
      timestamp: day.timestamp,
      count: day.cancelled,
      label: ExecutionStatus.CANCELLED,
    });
  });

  const timestamps: number[] = executionStats.map((d) => d.timestamp);
  const dateFormatter = niceTimeFormatter([Math.min(...timestamps), Math.max(...timestamps)]);
  const tooltipTimeFormatter = timeFormatter('HH:MM:SS');

  const colorMap: Record<ExecutionStatus, Color> = {
    [ExecutionStatus.COMPLETED]: euiTheme.colors.vis.euiColorVis0,
    [ExecutionStatus.FAILED]: euiTheme.colors.vis.euiColorVis6,
    [ExecutionStatus.CANCELLED]: euiTheme.colors.vis.euiColorVis8,
    [ExecutionStatus.TIMED_OUT]: euiTheme.colors.vis.euiColorVis6,
    [ExecutionStatus.PENDING]: euiTheme.colors.vis.euiColorVis1,
    [ExecutionStatus.QUEUED]: euiTheme.colors.vis.euiColorVis1,
    [ExecutionStatus.WAITING]: euiTheme.colors.vis.euiColorVis1,
    [ExecutionStatus.WAITING_FOR_INPUT]: euiTheme.colors.vis.euiColorVis1,
    [ExecutionStatus.WAITING_FOR_CHILD]: euiTheme.colors.vis.euiColorVis1,
    [ExecutionStatus.RUNNING]: euiTheme.colors.vis.euiColorVis1,
    [ExecutionStatus.SKIPPED]: euiTheme.colors.vis.euiColorVis1,
  };

  return (
    <Chart size={{ height: height || 200, width: '100%' }}>
      <Settings
        showLegend
        legendPosition={Position.Right}
        theme={{
          scales: {
            barsPadding: 0.2,
          },
        }}
      />
      <Tooltip headerFormatter={({ value }) => tooltipTimeFormatter(value)} type="follow" />
      <Axis
        id="bottom-axis"
        position={Position.Bottom}
        title="@timestamp"
        tickFormat={dateFormatter}
      />
      <Axis id="left-axis" position={Position.Left} title="Executions" />

      <BarSeries
        id="workflows-executions-stats"
        xScaleType={ScaleType.Time}
        yScaleType={ScaleType.Linear}
        xAccessor="timestamp"
        yAccessors={['count']}
        data={executionStats ?? []}
        splitSeriesAccessors={['label']}
        stackAccessors={['timestamp']}
        color={({ seriesKeys }) => {
          const status = seriesKeys[0] as ExecutionStatus;
          return colorMap[status] || euiTheme.colors.textParagraph;
        }}
        enableHistogramMode={true}
      />
    </Chart>
  );
}
