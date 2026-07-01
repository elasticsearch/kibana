/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { getSeverityType } from '@kbn/ml-anomaly-utils/get_severity_type';
import { getSeverityColor as mlGetSeverityColor } from '@kbn/ml-anomaly-utils/get_severity_color';
import { ML_ANOMALY_SEVERITY } from '@kbn/ml-anomaly-utils/anomaly_severity';
import { AnomalyDetectorType } from './apm_ml_detectors';
export type { ServiceAnomalyStats } from '@kbn/apm-types';

export function getSeverity(score: number | undefined) {
  if (score === undefined) {
    return ML_ANOMALY_SEVERITY.UNKNOWN;
  }

  return getSeverityType(score);
}

export function getSeverityColor(score: number) {
  return mlGetSeverityColor(score);
}

/**
 * Human-readable label for the APM ML detector that produced an anomaly, so
 * consumers can tell users which signal (latency, throughput, failure rate) is
 * anomalous.
 */
export function getApmMlDetectorLabel(detectorType: AnomalyDetectorType): string {
  switch (detectorType) {
    case AnomalyDetectorType.txLatency:
      return i18n.translate('xpack.apm.anomalyDetection.detectorLabel.latency', {
        defaultMessage: 'Latency',
      });
    case AnomalyDetectorType.txThroughput:
      return i18n.translate('xpack.apm.anomalyDetection.detectorLabel.throughput', {
        defaultMessage: 'Throughput',
      });
    case AnomalyDetectorType.txFailureRate:
      return i18n.translate('xpack.apm.anomalyDetection.detectorLabel.failedTransactionRate', {
        defaultMessage: 'Failed transaction rate',
      });
  }
}

export const ML_ERRORS = {
  INVALID_LICENSE: i18n.translate('xpack.apm.anomaly_detection.error.invalid_license', {
    defaultMessage: `To use anomaly detection, you must be subscribed to an Elastic Platinum license. With it, you'll be able to monitor your services with the aid of machine learning.`,
  }),
  MISSING_READ_PRIVILEGES: i18n.translate(
    'xpack.apm.anomaly_detection.error.missing_read_privileges',
    {
      defaultMessage:
        'You must have "read" privileges to Machine Learning and APM in order to view Anomaly Detection jobs',
    }
  ),
  MISSING_WRITE_PRIVILEGES: i18n.translate(
    'xpack.apm.anomaly_detection.error.missing_write_privileges',
    {
      defaultMessage:
        'You must have "write" privileges to Machine Learning and APM in order to create Anomaly Detection jobs',
    }
  ),
  ML_NOT_AVAILABLE: i18n.translate('xpack.apm.anomaly_detection.error.not_available', {
    defaultMessage: 'Machine learning is not available',
  }),
  ML_NOT_AVAILABLE_IN_SPACE: i18n.translate(
    'xpack.apm.anomaly_detection.error.not_available_in_space',
    {
      defaultMessage: 'Machine learning is not available in the selected space',
    }
  ),
};
