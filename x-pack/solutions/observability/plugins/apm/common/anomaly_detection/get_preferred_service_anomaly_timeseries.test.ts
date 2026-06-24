/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { v4 as uuidv4 } from 'uuid';
import { ENVIRONMENT_ALL } from '../environment_filter_values';
import type { Environment } from '../environment_rt';
import { AnomalyDetectorType } from './apm_ml_detectors';
import { getPreferredServiceAnomalyTimeseries } from './get_preferred_service_anomaly_timeseries';
import type { ServiceAnomalyTimeseries } from './service_anomaly_timeseries';

const PROD = 'production' as Environment;
const DEV = 'development' as Environment;

function createMockAnomalyTimeseries({
  type,
  environment = PROD,
  version = 3,
  jobId = uuidv4(),
  anomalies = [],
}: {
  type: AnomalyDetectorType;
  environment?: Environment;
  version?: number;
  jobId?: string;
  anomalies?: ServiceAnomalyTimeseries['anomalies'];
}): ServiceAnomalyTimeseries {
  return {
    anomalies,
    bounds: [],
    environment,
    jobId,
    type,
    serviceName: 'opbeans-java',
    transactionType: 'request',
    version,
  };
}

describe('getPreferredServiceAnomalyTimeseries', () => {
  describe('with a wide set of series', () => {
    const allAnomalyTimeseries = [
      createMockAnomalyTimeseries({
        type: AnomalyDetectorType.txLatency,
        environment: PROD,
      }),
      createMockAnomalyTimeseries({
        type: AnomalyDetectorType.txLatency,
        environment: DEV,
      }),
      createMockAnomalyTimeseries({
        type: AnomalyDetectorType.txThroughput,
        environment: PROD,
      }),
      createMockAnomalyTimeseries({
        type: AnomalyDetectorType.txFailureRate,
        environment: PROD,
      }),
      createMockAnomalyTimeseries({
        type: AnomalyDetectorType.txFailureRate,
        environment: PROD,
        version: 2,
      }),
    ];

    describe('with one environment', () => {
      describe('and all being selected', () => {
        const preferredEnvironment = PROD;
        it('returns the series for prod', () => {
          expect(
            getPreferredServiceAnomalyTimeseries({
              allAnomalyTimeseries,
              detectorType: AnomalyDetectorType.txLatency,
              preferredEnvironment,
              fallbackToTransactions: false,
            })?.environment
          ).toBe(PROD);
        });
      });
    });

    describe('with multiple environments', () => {
      describe('and all being selected', () => {
        const preferredEnvironment = ENVIRONMENT_ALL.value;

        it('returns a combined series across all environments', () => {
          const series = getPreferredServiceAnomalyTimeseries({
            allAnomalyTimeseries,
            detectorType: AnomalyDetectorType.txLatency,
            preferredEnvironment,
            fallbackToTransactions: false,
          });

          expect(series).toBeDefined();
          expect(series?.environment).toBe(ENVIRONMENT_ALL.value);
        });

        it('returns undefined when no matching series exist', () => {
          expect(
            getPreferredServiceAnomalyTimeseries({
              allAnomalyTimeseries,
              detectorType: AnomalyDetectorType.txLatency,
              preferredEnvironment,
              fallbackToTransactions: true,
            })
          ).toBeUndefined();
        });
      });

      describe('and production being selected', () => {
        const preferredEnvironment = PROD;

        it('returns the series for production', () => {
          const series = getPreferredServiceAnomalyTimeseries({
            allAnomalyTimeseries,
            detectorType: AnomalyDetectorType.txFailureRate,
            preferredEnvironment,
            fallbackToTransactions: false,
          });

          expect(series).toBeDefined();

          expect(series?.environment).toBe(PROD);
        });
      });
    });
  });

  describe('with multiple versions', () => {
    const allAnomalyTimeseries = [
      createMockAnomalyTimeseries({
        type: AnomalyDetectorType.txLatency,
        environment: PROD,
        version: 3,
      }),
      createMockAnomalyTimeseries({
        type: AnomalyDetectorType.txLatency,
        environment: PROD,
        version: 2,
      }),
    ];

    const preferredEnvironment = PROD;

    it('selects the most recent version when transaction metrics are being used', () => {
      const series = getPreferredServiceAnomalyTimeseries({
        allAnomalyTimeseries,
        detectorType: AnomalyDetectorType.txLatency,
        preferredEnvironment,
        fallbackToTransactions: false,
      });

      expect(series?.version).toBe(3);
    });

    it('selects the legacy version when transaction metrics are being used', () => {
      const series = getPreferredServiceAnomalyTimeseries({
        allAnomalyTimeseries,
        detectorType: AnomalyDetectorType.txLatency,
        preferredEnvironment,
        fallbackToTransactions: true,
      });

      expect(series?.version).toBe(2);
    });
  });

  describe('combined view when all environments are selected', () => {
    const allAnomalyTimeseries = [
      createMockAnomalyTimeseries({
        type: AnomalyDetectorType.txLatency,
        environment: PROD,
        jobId: 'prod-job',
        anomalies: [{ x: 1, y: 80, actual: 10 }],
      }),
      createMockAnomalyTimeseries({
        type: AnomalyDetectorType.txLatency,
        environment: DEV,
        jobId: 'dev-job',
        anomalies: [{ x: 1, y: 95, actual: 20 }],
      }),
    ];

    const preferredEnvironment = ENVIRONMENT_ALL.value;

    it('merges anomalies from all environments and tags each with its environment', () => {
      const series = getPreferredServiceAnomalyTimeseries({
        allAnomalyTimeseries,
        detectorType: AnomalyDetectorType.txLatency,
        preferredEnvironment,
        fallbackToTransactions: false,
      });

      expect(series?.anomalies).toEqual([
        { x: 1, y: 80, actual: 10, environment: PROD },
        { x: 1, y: 95, actual: 20, environment: DEV },
      ]);
    });

    it('uses the jobId of the highest scored anomaly', () => {
      const series = getPreferredServiceAnomalyTimeseries({
        allAnomalyTimeseries,
        detectorType: AnomalyDetectorType.txLatency,
        preferredEnvironment,
        fallbackToTransactions: false,
      });

      expect(series?.jobId).toBe('dev-job');
    });

    it('does not include expected bounds in the combined series', () => {
      const series = getPreferredServiceAnomalyTimeseries({
        allAnomalyTimeseries,
        detectorType: AnomalyDetectorType.txLatency,
        preferredEnvironment,
        fallbackToTransactions: false,
      });

      expect(series?.bounds).toEqual([]);
    });
  });
});
