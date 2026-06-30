/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEuiTheme } from '@elastic/eui';
import { useMemo } from 'react';
import { ML_ANOMALY_THRESHOLD, getThemeResolvedSeverityColor } from '@kbn/ml-anomaly-utils';
import { i18n } from '@kbn/i18n';
import type { SeverityThreshold } from '@kbn/ml-server-schemas/embeddables/anomaly_charts';
import { getSeverityRangeDisplay } from '../../../../common/util/severity_threshold';

const warningLabel: string = i18n.translate('xpack.ml.controls.selectSeverity.warningLabel', {
  defaultMessage: 'warning',
});
const minorLabel: string = i18n.translate('xpack.ml.controls.selectSeverity.minorLabel', {
  defaultMessage: 'minor',
});
const majorLabel: string = i18n.translate('xpack.ml.controls.selectSeverity.majorLabel', {
  defaultMessage: 'major',
});
const criticalLabel: string = i18n.translate('xpack.ml.controls.selectSeverity.criticalLabel', {
  defaultMessage: 'critical',
});

const lowLabel: string = i18n.translate('xpack.ml.controls.selectSeverity.lowLabel', {
  defaultMessage: 'low',
});

export interface SeverityOption {
  val: number;
  display: string;
  color: string;
  threshold: SeverityThreshold;
}

/**
 * React hook that returns severity options with their display values and colors
 */
export const useSeverityOptions = (): SeverityOption[] => {
  const { euiTheme } = useEuiTheme();

  return useMemo(
    () => [
      {
        val: ML_ANOMALY_THRESHOLD.LOW,
        display: lowLabel,
        rangeDisplay: getSeverityRangeDisplay(ML_ANOMALY_THRESHOLD.LOW),
        color: getThemeResolvedSeverityColor(ML_ANOMALY_THRESHOLD.LOW, euiTheme),
        threshold: {
          min: ML_ANOMALY_THRESHOLD.LOW,
          max: ML_ANOMALY_THRESHOLD.WARNING,
        },
      },
      {
        val: ML_ANOMALY_THRESHOLD.WARNING,
        display: warningLabel,
        rangeDisplay: getSeverityRangeDisplay(ML_ANOMALY_THRESHOLD.WARNING),
        color: getThemeResolvedSeverityColor(ML_ANOMALY_THRESHOLD.WARNING, euiTheme),
        threshold: {
          min: ML_ANOMALY_THRESHOLD.WARNING,
          max: ML_ANOMALY_THRESHOLD.MINOR,
        },
      },
      {
        val: ML_ANOMALY_THRESHOLD.MINOR,
        display: minorLabel,
        rangeDisplay: getSeverityRangeDisplay(ML_ANOMALY_THRESHOLD.MINOR),
        color: getThemeResolvedSeverityColor(ML_ANOMALY_THRESHOLD.MINOR, euiTheme),
        threshold: {
          min: ML_ANOMALY_THRESHOLD.MINOR,
          max: ML_ANOMALY_THRESHOLD.MAJOR,
        },
      },
      {
        val: ML_ANOMALY_THRESHOLD.MAJOR,
        display: majorLabel,
        rangeDisplay: getSeverityRangeDisplay(ML_ANOMALY_THRESHOLD.MAJOR),
        color: getThemeResolvedSeverityColor(ML_ANOMALY_THRESHOLD.MAJOR, euiTheme),
        threshold: {
          min: ML_ANOMALY_THRESHOLD.MAJOR,
          max: ML_ANOMALY_THRESHOLD.CRITICAL,
        },
      },
      {
        val: ML_ANOMALY_THRESHOLD.CRITICAL,
        display: criticalLabel,
        rangeDisplay: getSeverityRangeDisplay(ML_ANOMALY_THRESHOLD.CRITICAL),
        color: getThemeResolvedSeverityColor(ML_ANOMALY_THRESHOLD.CRITICAL, euiTheme),
        threshold: {
          min: ML_ANOMALY_THRESHOLD.CRITICAL,
        },
      },
    ],
    [euiTheme]
  );
};
