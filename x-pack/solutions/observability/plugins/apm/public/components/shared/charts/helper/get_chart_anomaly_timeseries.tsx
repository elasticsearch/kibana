/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { rgba } from 'polished';
import { getSeverity } from '@kbn/ml-anomaly-utils/get_severity';
import { ML_ANOMALY_SEVERITY } from '@kbn/ml-anomaly-utils/anomaly_severity';
import { ML_ANOMALY_THRESHOLD } from '@kbn/ml-anomaly-utils/anomaly_threshold';
import type { AreaSeriesStyle, RecursivePartial } from '@elastic/charts';
import type { EuiThemeComputed } from '@elastic/eui';
import { getSeverityColor } from '../../../../../common/anomaly_detection';
import type { ServiceAnomalyTimeseries } from '../../../../../common/anomaly_detection/service_anomaly_timeseries';
import type { APMChartSpec } from '../../../../../typings/timeseries';
import type { AnomalyThreshold } from '../../../../../common/anomaly_detection/anomaly_threshold';
import { DEFAULT_ANOMALY_THRESHOLD } from '../../../../../common/anomaly_detection/anomaly_threshold';

export const EXPECTED_BOUNDS_SERIES_ID = 'expected_bounds';

// All severity levels ordered low → critical so higher-severity series render on top.
const ALL_SEVERITIES = [
  { severity: ML_ANOMALY_SEVERITY.LOW, threshold: ML_ANOMALY_THRESHOLD.LOW },
  { severity: ML_ANOMALY_SEVERITY.WARNING, threshold: ML_ANOMALY_THRESHOLD.WARNING },
  { severity: ML_ANOMALY_SEVERITY.MINOR, threshold: ML_ANOMALY_THRESHOLD.MINOR },
  { severity: ML_ANOMALY_SEVERITY.MAJOR, threshold: ML_ANOMALY_THRESHOLD.MAJOR },
  { severity: ML_ANOMALY_SEVERITY.CRITICAL, threshold: ML_ANOMALY_THRESHOLD.CRITICAL },
] as const;

// Maps each severity string to its numeric lower bound for comparison.
const SEVERITY_NUMERIC_THRESHOLD: Partial<Record<string, number>> = Object.fromEntries(
  ALL_SEVERITIES.map(({ severity, threshold }) => [severity, threshold])
);

export function getChartAnomalyTimeseries({
  anomalyTimeseries,
  euiTheme,
  anomalyTimeseriesColor,
  anomalyThreshold = DEFAULT_ANOMALY_THRESHOLD,
}: {
  anomalyTimeseries?: ServiceAnomalyTimeseries;
  euiTheme: EuiThemeComputed;
  anomalyTimeseriesColor?: string;
  anomalyThreshold?: AnomalyThreshold;
}):
  | {
      boundaries: APMChartSpec[];
      scores: APMChartSpec[];
    }
  | undefined {
  if (!anomalyTimeseries) {
    return undefined;
  }

  const boundaries = [
    {
      title: i18n.translate('xpack.apm.comparison.expectedBoundsTitle', {
        defaultMessage: 'Expected bounds',
      }),
      type: 'area',
      hideLegend: false,
      hideTooltipValue: true,
      areaSeriesStyle: {
        point: {
          opacity: 0,
        },
      },
      color: anomalyTimeseriesColor ?? rgba(euiTheme.colors.vis.euiColorVis1, 0.5),
      yAccessors: ['y1'],
      y0Accessors: ['y0'],
      data: anomalyTimeseries.bounds,
      id: EXPECTED_BOUNDS_SERIES_ID,
    },
  ];

  if (anomalyThreshold === 'none') {
    return { boundaries, scores: [] };
  }

  const minNumericThreshold =
    SEVERITY_NUMERIC_THRESHOLD[anomalyThreshold] ?? ML_ANOMALY_THRESHOLD.MAJOR;

  const activeSeverities = ALL_SEVERITIES.filter(
    ({ threshold }) => threshold >= minNumericThreshold
  );

  const scores: APMChartSpec[] = activeSeverities.map(({ severity, threshold }) => {
    const color = getSeverityColor(threshold);

    const style: RecursivePartial<AreaSeriesStyle> = {
      line: {
        opacity: 0,
      },
      area: {
        fill: color,
      },
      point: {
        visible: 'always',
        opacity: 1,
        radius: 3,
        fill: color,
        shape: 'triangle',
      },
    };

    const data = anomalyTimeseries.anomalies
      .map((anomaly) => ({
        ...anomaly,
        y: getSeverity(anomaly.y ?? 0).id === severity ? anomaly.actual : null,
      }))
      .filter((datum) => datum.y !== null);

    // Only show the legend for a severity when this chart actually contains an
    // anomaly of that severity, otherwise the legend would advertise (e.g.)
    // "Critical anomaly" on a chart that has none.
    const hasAnomalies = data.length > 0;

    return {
      title: i18n.translate('xpack.apm.anomalyScore', {
        defaultMessage:
          '{severity, select, low {Low} warning {Warning} minor {Minor} major {Major} critical {Critical} other {Unknown severity}} anomaly',
        values: {
          severity,
        },
      }),
      type: 'line',
      hideLegend: !hasAnomalies,
      lineSeriesStyle: style,
      data,
      color,
      id: `anomaly_score_${severity}`,
    };
  });

  return { boundaries, scores };
}
