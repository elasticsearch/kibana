/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ML_ANOMALY_SEVERITY } from '@kbn/ml-anomaly-utils/anomaly_severity';
import { ML_ANOMALY_THRESHOLD } from '@kbn/ml-anomaly-utils/anomaly_threshold';
import { AnomalyDetectorType } from '../../../../../common/anomaly_detection/apm_ml_detectors';
import type { TopAlert } from '@kbn/observability-plugin/public';
import { ANOMALY_TIMESTAMP } from '../../../../../common/es_fields/apm';
import {
  formatAnomalyCalloutBody,
  formatAnomalyCalloutTitle,
  getAlertDetailsRangeStart,
  getAnomalyCalloutColor,
  getAnomalyTimestamp,
} from './helpers';

describe('alert details anomaly helpers', () => {
  describe('getAnomalyTimestamp', () => {
    const makeAlert = (anomalyTimestamp?: unknown): TopAlert =>
      ({ fields: { [ANOMALY_TIMESTAMP]: anomalyTimestamp } } as unknown as TopAlert);

    it('parses an ISO string into epoch millis', () => {
      expect(getAnomalyTimestamp(makeAlert('2026-07-16T09:00:00.000Z'))).toBe(
        new Date('2026-07-16T09:00:00.000Z').getTime()
      );
    });

    it('accepts an epoch millis number', () => {
      expect(getAnomalyTimestamp(makeAlert(1750000000000))).toBe(1750000000000);
    });

    it('returns undefined when the field is missing', () => {
      expect(getAnomalyTimestamp(makeAlert(undefined))).toBeUndefined();
      expect(getAnomalyTimestamp(makeAlert(null))).toBeUndefined();
    });

    it('returns undefined when the field is not a parseable date', () => {
      expect(getAnomalyTimestamp(makeAlert('not-a-date'))).toBeUndefined();
    });
  });

  describe('getAlertDetailsRangeStart', () => {
    const alertStart = '2026-07-16T10:00:00.000Z';

    it('returns alertStart for non-anomaly alerts', () => {
      expect(
        getAlertDetailsRangeStart({
          alertStart,
          isAnomaly: false,
          anomalyTimestamp: new Date('2026-07-16T09:00:00.000Z').getTime(),
        })
      ).toBe(alertStart);
    });

    it('returns alertStart when anomalyTimestamp is undefined', () => {
      expect(
        getAlertDetailsRangeStart({
          alertStart,
          isAnomaly: true,
        })
      ).toBe(alertStart);
    });

    it('uses the anomaly timestamp when isAnomaly and anomalyTimestamp are set', () => {
      expect(
        getAlertDetailsRangeStart({
          alertStart,
          isAnomaly: true,
          anomalyTimestamp: new Date('2026-07-16T09:30:00.000Z').getTime(),
        })
      ).toBe('2026-07-16T09:30:00.000Z');
    });
  });

  describe('getAnomalyCalloutColor', () => {
    it('maps critical severity to danger', () => {
      expect(getAnomalyCalloutColor(ML_ANOMALY_SEVERITY.CRITICAL)).toBe('danger');
    });

    it('maps major and minor severity to warning', () => {
      expect(getAnomalyCalloutColor(ML_ANOMALY_SEVERITY.MAJOR)).toBe('warning');
      expect(getAnomalyCalloutColor(ML_ANOMALY_SEVERITY.MINOR)).toBe('warning');
    });

    it('maps warning and low severity to primary', () => {
      expect(getAnomalyCalloutColor(ML_ANOMALY_SEVERITY.WARNING)).toBe('primary');
      expect(getAnomalyCalloutColor(ML_ANOMALY_SEVERITY.LOW)).toBe('primary');
    });
  });

  describe('formatAnomalyCalloutTitle', () => {
    it('includes severity and detector metric in the title', () => {
      expect(
        formatAnomalyCalloutTitle({
          alertSeverity: ML_ANOMALY_SEVERITY.CRITICAL,
          detectorType: AnomalyDetectorType.txFailureRate,
        })
      ).toBe('Critical APM anomaly detected - Failed transaction rate');
    });
  });

  describe('formatAnomalyCalloutBody', () => {
    it('describes the rule severity threshold', () => {
      expect(formatAnomalyCalloutBody(ML_ANOMALY_THRESHOLD.WARNING)).toBe(
        'Alert when an anomaly with severity warning or above is detected.'
      );
    });
  });
});
