/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiScreenReaderOnly } from '@elastic/eui';
import {
  AreaSeries,
  Axis,
  Chart,
  CurveType,
  Position,
  ScaleType,
  Settings,
  Tooltip,
  TooltipType,
} from '@elastic/charts';
import { useElasticChartsTheme } from '@kbn/charts-theme';
import { i18n } from '@kbn/i18n';
import { useKibanaTimeZone } from '../../hooks/use_kibana_time_zone';

export interface SparklinePoint {
  x: number;
  y: number;
}

interface ProposalSparklineProps {
  series: SparklinePoint[];
  /** Already resolved to a real colour value by the parent. */
  color: string;
  ariaLabel: string;
  /** Used as the @elastic/charts spec id, so it must not change with locale. */
  panelId: string;
  seriesName: string;
  /**
   * Renders the end of the bucket's time range in the tooltip header. Required
   * rather than defaulted: a default that silently disagrees with the window the
   * data was fetched for produces wrong tooltips with no type error.
   */
  bucketMinutes: number;
}

export const ProposalSparkline: React.FC<ProposalSparklineProps> = ({
  series,
  color,
  ariaLabel,
  panelId,
  seriesName,
  bucketMinutes,
}) => {
  const chartBaseTheme = useElasticChartsTheme();
  const locale = i18n.getLocale();
  const timeZone = useKibanaTimeZone();

  const yMax = Math.max(...series.map((p) => p.y), 0);
  const yDomainMax = yMax > 0 ? yMax * 1.25 : 1;

  const timeOpts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', timeZone };

  // `value` is the raw x, i.e. the bucket's start timestamp in ms.
  const headerFormatter = ({ value }: { value: number }) => {
    const start = new Date(value);
    const end = new Date(value + bucketMinutes * 60 * 1000);
    return `${start.toLocaleTimeString(locale, timeOpts)} – ${end.toLocaleTimeString(
      locale,
      timeOpts
    )}`;
  };

  // Goes on the series as `tickFormat`, which is where the tooltip reads the
  // value format from — `Tooltip` no longer takes a `valueFormatter`.
  const valueFormatter = (count: number) =>
    i18n.translate('xpack.alertzero.proposalStats.tooltipOpen', {
      defaultMessage: '{count} open',
      values: { count },
    });

  const partialTheme = {
    chartMargins: { top: 0, bottom: 0, left: 0, right: 0 },
    chartPaddings: { top: 0, bottom: 0, left: 0, right: 0 },
    background: { color: 'transparent' },
    areaSeriesStyle: {
      area: { opacity: 0.25 },
      line: { strokeWidth: 2 },
    },
  };

  return (
    <>
      <EuiScreenReaderOnly>
        <span>{ariaLabel}</span>
      </EuiScreenReaderOnly>
      <Chart
        size={{ height: 48, width: '100%' }}
        aria-hidden="true"
        data-test-subj="alertZeroProposalSparkline"
      >
        <Settings
          theme={[partialTheme]}
          baseTheme={chartBaseTheme}
          showLegend={false}
          locale={locale}
        />
        <Tooltip type={TooltipType.VerticalCursor} headerFormatter={headerFormatter} />
        <Axis
          id="y-axis"
          position={Position.Left}
          hide={true}
          gridLine={{ visible: false }}
          domain={{ min: 0, max: yDomainMax }}
        />
        <AreaSeries
          id={panelId}
          name={seriesName}
          xScaleType={ScaleType.Time}
          yScaleType={ScaleType.Linear}
          xAccessor="x"
          yAccessors={['y']}
          data={series}
          curve={CurveType.CURVE_MONOTONE_X}
          color={color}
          tickFormat={valueFormatter}
        />
      </Chart>
    </>
  );
};
