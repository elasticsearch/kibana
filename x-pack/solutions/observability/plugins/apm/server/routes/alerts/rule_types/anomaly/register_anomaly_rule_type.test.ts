/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { registerAnomalyRuleType } from './register_anomaly_rule_type';
import { ML_ANOMALY_SEVERITY } from '@kbn/ml-anomaly-utils/anomaly_severity';
import type { MlPluginSetup } from '@kbn/ml-plugin/server';
import * as GetServiceAnomalies from '../../../service_map/get_service_anomalies';
import { createRuleTypeMocks } from '../../test_utils';
import type { ApmMlJob } from '../../../../../common/anomaly_detection/apm_ml_job';
import {
  AnomalyDetectorType,
  getAnomalyDetectorIndex,
} from '../../../../../common/anomaly_detection/apm_ml_detectors';

describe('Transaction duration anomaly alert', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });
  describe("doesn't send alert", () => {
    it('ml is not defined', async () => {
      const { services, dependencies, executor } = createRuleTypeMocks();

      registerAnomalyRuleType({
        ...dependencies,
        ml: undefined,
      });

      const params = {
        anomalySeverityType: ML_ANOMALY_SEVERITY.MINOR,
        anomalyDetectorTypes: [AnomalyDetectorType.txLatency],
      };

      await executor({ params });

      expect(services.scopedClusterClient.asCurrentUser.search).not.toHaveBeenCalled();

      expect(services.alertsClient.report).not.toHaveBeenCalled();
    });

    it('ml jobs are not available', async () => {
      jest.spyOn(GetServiceAnomalies, 'getMLJobs').mockReturnValue(Promise.resolve([]));

      const { services, dependencies, executor } = createRuleTypeMocks();

      const ml = {
        mlSystemProvider: () => ({ mlAnomalySearch: jest.fn() }),
        anomalyDetectorsProvider: jest.fn(),
      } as unknown as MlPluginSetup;

      registerAnomalyRuleType({
        ...dependencies,
        ml,
      });

      const params = {
        anomalySeverityType: ML_ANOMALY_SEVERITY.MINOR,
        anomalyDetectorTypes: [AnomalyDetectorType.txLatency],
      };

      await executor({ params });
      expect(services.scopedClusterClient.asCurrentUser.search).not.toHaveBeenCalled();

      expect(services.alertsClient.report).not.toHaveBeenCalled();
    });

    it('anomaly is less than threshold', async () => {
      jest.spyOn(GetServiceAnomalies, 'getMLJobs').mockReturnValue(
        Promise.resolve([
          {
            jobId: '1',
            environment: 'development',
          },
          {
            jobId: '2',
            environment: 'production',
          },
        ] as unknown as ApmMlJob[])
      );

      const { services, dependencies, executor } = createRuleTypeMocks();

      const ml = {
        mlSystemProvider: () => ({
          mlAnomalySearch: () => ({
            aggregations: {
              anomaly_groups: {
                buckets: [
                  {
                    doc_count: 1,
                    latest_score: {
                      top: [
                        {
                          metrics: {
                            record_score: 0,
                            job_id: '1',
                            detector_index: getAnomalyDetectorIndex(AnomalyDetectorType.txLatency),
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          }),
        }),
        anomalyDetectorsProvider: jest.fn(),
      } as unknown as MlPluginSetup;

      registerAnomalyRuleType({
        ...dependencies,
        ml,
      });

      const params = {
        anomalySeverityType: ML_ANOMALY_SEVERITY.MINOR,
        anomalyDetectorTypes: [AnomalyDetectorType.txLatency],
        windowSize: 5,
        windowUnit: 'm',
      };

      await executor({ params });

      expect(services.scopedClusterClient.asCurrentUser.search).not.toHaveBeenCalled();
      expect(services.alertsClient.report).not.toHaveBeenCalled();
    });
  });

  describe('anomaly query time filter', () => {
    function runWith(previousStartedAt?: Date | null) {
      jest
        .spyOn(GetServiceAnomalies, 'getMLJobs')
        .mockReturnValue(
          Promise.resolve([{ jobId: '1', environment: 'production' }] as unknown as ApmMlJob[])
        );

      const mlAnomalySearch = jest
        .fn()
        .mockReturnValue({ aggregations: { anomaly_groups: { buckets: [] } } });

      const { dependencies, executor } = createRuleTypeMocks();

      const ml = {
        mlSystemProvider: () => ({ mlAnomalySearch }),
        anomalyDetectorsProvider: jest.fn(),
      } as unknown as MlPluginSetup;

      registerAnomalyRuleType({ ...dependencies, ml });

      const params = {
        anomalySeverityType: ML_ANOMALY_SEVERITY.MINOR,
        anomalyDetectorTypes: [AnomalyDetectorType.txLatency],
        windowSize: 5,
        windowUnit: 'm',
      };

      return executor({ params, previousStartedAt }).then(() => {
        const { filter } = mlAnomalySearch.mock.calls[0][0].query.bool;
        const dualRange = filter.find((f: any) => f.bool?.should);
        const ingested = dualRange.bool.should.find((s: any) =>
          s.bool.filter?.some((x: any) => x.exists?.field === 'event.ingested')
        );
        const legacy = dualRange.bool.should.find((s: any) => s.bool.must_not);
        return {
          ingestedGte: ingested.bool.filter.find((x: any) => x.range)?.range['event.ingested'].gte,
          timestampGte: legacy.bool.filter[0].range.timestamp.gte,
        };
      });
    }

    it('filters event.ingested by the previous run time', async () => {
      const previousStartedAt = new Date('2024-01-01T00:00:00.000Z');
      const { ingestedGte } = await runWith(previousStartedAt);
      expect(ingestedGte).toBe('2024-01-01T00:00:00.000Z');
    });

    it('falls back to the lookback window start on the first run', async () => {
      const { ingestedGte, timestampGte } = await runWith(null);
      expect(ingestedGte).toBe(timestampGte);
    });
  });

  describe('sends alert', () => {
    it('for all services that exceeded the threshold', async () => {
      jest.spyOn(GetServiceAnomalies, 'getMLJobs').mockReturnValue(
        Promise.resolve([
          {
            jobId: '1',
            environment: 'development',
          },
          {
            jobId: '2',
            environment: 'production',
          },
        ] as unknown as ApmMlJob[])
      );

      const { services, dependencies, executor } = createRuleTypeMocks();

      services.alertsClient.report.mockReturnValue({ uuid: 'test-uuid' });

      const ml = {
        mlSystemProvider: () => ({
          mlAnomalySearch: () => ({
            aggregations: {
              anomaly_groups: {
                buckets: [
                  {
                    key: ['apm.anomaly', 'foo', 'development', 'type-foo'],
                    latest_score: {
                      top: [
                        {
                          metrics: {
                            record_score: 80,
                            job_id: '1',
                            partition_field_value: 'foo',
                            by_field_value: 'type-foo',
                            detector_index: getAnomalyDetectorIndex(AnomalyDetectorType.txLatency),
                          },
                        },
                      ],
                    },
                  },
                  {
                    key: ['apm.anomaly', 'bar', 'production', 'type-bar'],
                    latest_score: {
                      top: [
                        {
                          metrics: {
                            record_score: 20,
                            job_id: '2',
                            parttition_field_value: 'bar',
                            by_field_value: 'type-bar',
                            detector_index: getAnomalyDetectorIndex(AnomalyDetectorType.txLatency),
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          }),
        }),
        anomalyDetectorsProvider: jest.fn(),
      } as unknown as MlPluginSetup;

      registerAnomalyRuleType({
        ...dependencies,
        ml,
      });

      const params = {
        anomalySeverityType: ML_ANOMALY_SEVERITY.MINOR,
        anomalyDetectorTypes: [AnomalyDetectorType.txLatency],
        windowSize: 5,
        windowUnit: 'm',
      };

      await executor({ params });

      expect(services.alertsClient.report).toHaveBeenCalledTimes(1);

      expect(services.alertsClient.report).toHaveBeenCalledWith({
        actionGroup: 'threshold_met',
        id: 'apm.anomaly_foo_development_type-foo',
      });

      expect(services.alertsClient.setAlertData).toHaveBeenCalledWith({
        context: {
          alertDetailsUrl: 'http://localhost:5601/eyr/app/observability/alerts/test-uuid',
          environment: 'development',
          reason:
            'critical latency anomaly with a score of 80, was detected in the last 5 mins for foo.',
          serviceName: 'foo',
          threshold: 'minor',
          transactionType: 'type-foo',
          triggerValue: 'critical',
          viewInAppUrl:
            'http://localhost:5601/eyr/app/apm/services/foo?transactionType=type-foo&environment=development',
        },
        id: 'apm.anomaly_foo_development_type-foo',
        payload: {
          'anomaly.detector_type': 'txLatency',
          'kibana.alert.evaluation.threshold': 25,
          'kibana.alert.evaluation.value': 80,
          'kibana.alert.reason':
            'critical latency anomaly with a score of 80, was detected in the last 5 mins for foo.',
          'kibana.alert.severity': 'critical',
          'processor.event': 'transaction',
          'service.environment': 'development',
          'service.name': 'foo',
          'transaction.type': 'type-foo',
        },
      });
    });
  });
});

describe('recovered alerts', () => {
  it('should returns the recovered alerts', async () => {
    jest.spyOn(GetServiceAnomalies, 'getMLJobs').mockReturnValue(
      Promise.resolve([
        {
          jobId: '1',
          environment: 'development',
        },
        {
          jobId: '2',
          environment: 'production',
        },
      ] as unknown as ApmMlJob[])
    );

    const { services, dependencies, executor } = createRuleTypeMocks();

    services.alertsClient.report.mockReturnValue({ uuid: 'test-uuid' });
    services.alertsClient.getRecoveredAlerts.mockReturnValue([
      {
        alert: {
          getId: jest.fn().mockReturnValue('test-id'),
          getUuid: jest.fn().mockReturnValue('test-uuid'),
          scheduledExecutionOptions: undefined,
          meta: {},
          state: {},
          context: {},
          id: 'synthtrace-high-cardinality-0_Synthtrace: many_errors_request',
          alertAsData: undefined,
        },
        hit: {
          'service.name': 'packetbeat',
          'service.environment': 'production',
          'transaction.type': 'output',
          'processor.event': 'transaction',
          'kibana.alert.severity': 'minor',
          'kibana.alert.evaluation.value': 42.801142973792565,
          'kibana.alert.evaluation.threshold': 3,
          'kibana.alert.reason':
            'minor throughput anomaly with a score of 42.801142973792565, was detected in the last 30 mins for packetbeat.',
          'agent.name': 'go',
          labels: { worker: 'netclient' },
          'service.language.name': 'go',
          'kibana.alert.rule.category': 'APM Anomaly',
          'kibana.alert.rule.consumer': 'alerts',
          'kibana.alert.rule.execution.uuid': '46b2b08d-3373-48c1-9b93-00026b882042',
          'kibana.alert.rule.name': 'APM Anomaly rule',
          'kibana.alert.rule.parameters': {
            windowSize: 30,
            windowUnit: 'm',
            anomalySeverityType: 'warning',
            anomalyDetectorTypes: ['txLatency', 'txThroughput', 'txFailureRate'],
            environment: 'ENVIRONMENT_ALL',
          },
          'kibana.alert.rule.producer': 'apm',
          'kibana.alert.rule.revision': 12,
          'kibana.alert.rule.rule_type_id': 'apm.anomaly',
          'kibana.alert.rule.tags': [],
          'kibana.alert.rule.uuid': 'e3aa20a8-25cb-49b8-94c8-3d930bde1219',
          'kibana.space_ids': ['default'],
          '@timestamp': '2025-03-05T14:37:29.661Z',
          'event.action': 'active',
          'event.kind': 'signal',
          'kibana.alert.rule.execution.timestamp': '2025-03-05T14:37:29.661Z',
          'kibana.alert.action_group': 'threshold_met',
          'kibana.alert.flapping': false,
          'kibana.alert.flapping_history': [],
          'kibana.alert.instance.id': 'packetbeat_output_apm-production-3c88-apm_tx_metrics_1',
          'kibana.alert.maintenance_window_ids': [],
          'kibana.alert.consecutive_matches': 3,
          'kibana.alert.status': 'active',
          'kibana.alert.uuid': 'fe7fbfe4-4b26-4264-b0e7-28e69ce21376',
          'kibana.alert.workflow_status': 'open',
          'kibana.alert.duration.us': 120043000,
          'kibana.alert.start': '2025-03-05T14:35:29.618Z',
          'kibana.alert.time_range': { gte: '2025-03-05T14:35:29.618Z' },
          'kibana.version': '9.1.0',
          tags: [],
          'kibana.alert.previous_action_group': 'threshold_met',
        },
      },
    ]);
    const ml = {
      mlSystemProvider: () => ({
        mlAnomalySearch: () => ({
          aggregations: {
            anomaly_groups: {
              buckets: [],
            },
          },
        }),
      }),
      anomalyDetectorsProvider: jest.fn(),
    } as unknown as MlPluginSetup;

    registerAnomalyRuleType({
      ...dependencies,
      ml,
    });

    const params = {
      anomalySeverityType: ML_ANOMALY_SEVERITY.MINOR,
      anomalyDetectorTypes: [AnomalyDetectorType.txLatency],
      windowSize: 5,
      windowUnit: 'm',
    };

    await executor({ params });

    expect(services.alertsClient.setAlertData).toHaveBeenCalledWith({
      context: {
        alertDetailsUrl: 'http://localhost:5601/eyr/app/observability/alerts/test-uuid',
        environment: 'production',
        reason:
          'minor throughput anomaly with a score of 42.801142973792565, was detected in the last 30 mins for packetbeat.',
        serviceName: 'packetbeat',
        threshold: 'minor',
        transactionType: 'output',
        triggerValue: 'minor',
        viewInAppUrl:
          'http://localhost:5601/eyr/app/apm/services/packetbeat?transactionType=output&environment=production',
      },
      id: 'test-id',
    });
  });
});
