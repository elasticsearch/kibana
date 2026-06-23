/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from 'expect';

import type { MachineLearningRuleCreateProps } from '@kbn/security-solution-plugin/common/api/detection_engine';
import { RuleExecutionStatusEnum } from '@kbn/security-solution-plugin/common/api/detection_engine';
import type { Anomaly } from '@kbn/security-solution-plugin/server/lib/machine_learning';
import {
  ALERT_LAST_DETECTED,
  ALERT_START,
  ALERT_SUPPRESSION_DOCS_COUNT,
  ALERT_SUPPRESSION_END,
  ALERT_SUPPRESSION_START,
  ALERT_SUPPRESSION_TERMS,
  TIMESTAMP,
} from '@kbn/rule-data-utils';
import { ALERT_ORIGINAL_TIME } from '@kbn/security-solution-plugin/common/field_maps/field_names';
import { DETECTION_ENGINE_SIGNALS_STATUS_URL as DETECTION_ENGINE_ALERTS_STATUS_URL } from '@kbn/security-solution-plugin/common/constants';
import {
  createRule,
  deleteAllAlerts,
  deleteAllAnomalies,
  deleteAllRules,
} from '@kbn/detections-response-ftr-services';
import { EsArchivePathBuilder } from '../../../../../../es_archive_path_builder';
import type { FtrProviderContext } from '../../../../../../ftr_provider_context';
import {
  dataGeneratorFactory,
  forceStartDatafeeds,
  getAlerts,
  getOpenAlerts,
  getPreviewAlerts,
  patchRule,
  previewRule,
  previewRuleWithExceptionEntries,
  setAlertStatus,
  setupMlModulesWithRetry,
} from '../../../../utils';
import { deleteAllExceptions } from '../../../../../lists_and_exception_lists/utils';
import { EntityStoreV2EnrichmentSetup } from '../../entity_store_v2_enrichment_setup';

export default ({ getService }: FtrProviderContext) => {
  const supertest = getService('supertest');
  const esArchiver = getService('esArchiver');
  const es = getService('es');
  const log = getService('log');
  const config = getService('config');
  const retry = getService('retry');
  const entityStoreV2 = EntityStoreV2EnrichmentSetup(getService);

  const isServerless = config.get('serverless');
  const dataPathBuilder = new EsArchivePathBuilder(isServerless);
  const auditbeatArchivePath = dataPathBuilder.getPath('auditbeat/hosts');

  const { indexListOfDocuments } = dataGeneratorFactory({
    es,
    index: '.ml-anomalies-custom-v3_linux_anomalous_network_activity_ea',
    log,
  });

  const mlModuleName = 'security_linux_v3';
  const mlJobId = 'v3_linux_anomalous_network_activity_ea';
  const baseRuleProps: MachineLearningRuleCreateProps = {
    name: 'Test ML rule',
    description: 'Test ML rule description',
    risk_score: 50,
    severity: 'critical',
    type: 'machine_learning',
    anomaly_threshold: 40,
    machine_learning_job_id: mlJobId,
    from: '1900-01-01T00:00:00.000Z',
    rule_id: 'ml-rule-id',
  };
  let ruleProps: MachineLearningRuleCreateProps;
  const baseAnomaly: Partial<Anomaly> = {
    is_interim: false,
    record_score: 43, // exceeds anomaly_threshold above
    result_type: 'record',
    job_id: mlJobId,
    'user.name': ['root'],
  };

  // NOTE: Add to second quality gate after feature is GA
  describe('@ess @serverless Machine Learning Detection Rule - Alert Suppression', () => {
    describe('with an active ML Job', () => {
      before(async () => {
        // Order is critical here: auditbeat data must be loaded before attempting to start the ML job,
        // as the job looks for certain indices on start
        await esArchiver.load(auditbeatArchivePath);
        await setupMlModulesWithRetry({ module: mlModuleName, retry, supertest });
        await forceStartDatafeeds({ jobId: mlJobId, rspCode: 200, supertest });
        await esArchiver.load(
          'x-pack/solutions/security/test/fixtures/es_archives/security_solution/anomalies'
        );
        await deleteAllAnomalies(log, es);
      });

      after(async () => {
        await esArchiver.load(auditbeatArchivePath);
        await esArchiver.unload(
          'x-pack/solutions/security/test/fixtures/es_archives/security_solution/anomalies'
        );
        await deleteAllAlerts(supertest, log, es);
        await deleteAllRules(supertest, log);
      });

      afterEach(async () => {
        await deleteAllAlerts(supertest, log, es);
        await deleteAllRules(supertest, log);
        await deleteAllAnomalies(log, es);
      });

      describe('with per-execution suppression duration', () => {
        beforeEach(() => {
          ruleProps = {
            ...baseRuleProps,
            alert_suppression: {
              group_by: ['user.name'],
              missing_fields_strategy: 'suppress',
            },
          };
        });

        it('performs no suppression if a single alert is generated', async () => {
          const timestamp = new Date().toISOString();
          const anomaly = {
            ...baseAnomaly,
            timestamp,
          };
          await indexListOfDocuments([anomaly]);
          const createdRule = await createRule(supertest, log, ruleProps);
          const alerts = await getAlerts(supertest, log, es, createdRule);

          expect(alerts.hits.hits).toHaveLength(1);
          expect(alerts.hits.hits[0]._source).toEqual(
            expect.objectContaining({
              [ALERT_SUPPRESSION_TERMS]: [{ field: 'user.name', value: ['root'] }],
              [ALERT_SUPPRESSION_DOCS_COUNT]: 0,
            })
          );
        });

        it('suppresses alerts within a single execution', async () => {
          const timestamp = new Date().toISOString();
          const anomaly = {
            ...baseAnomaly,
            timestamp,
          };
          await indexListOfDocuments([anomaly, anomaly]);

          const createdRule = await createRule(supertest, log, {
            ...ruleProps,
            from: timestamp,
          });

          const alerts = await getAlerts(supertest, log, es, createdRule);
          expect(alerts.hits.hits).toHaveLength(1);
          expect(alerts.hits.hits[0]._source).toEqual(
            expect.objectContaining({
              [ALERT_SUPPRESSION_TERMS]: [
                {
                  field: 'user.name',
                  value: ['root'],
                },
              ],
              [ALERT_SUPPRESSION_START]: timestamp,
              [ALERT_SUPPRESSION_END]: timestamp,
              [ALERT_ORIGINAL_TIME]: timestamp,
              [ALERT_SUPPRESSION_DOCS_COUNT]: 1,
            })
          );
        });

        it('deduplicates previously suppressed alerts if rule has overlapping execution windows', async () => {
          const firstTimestamp = new Date().toISOString();
          const firstAnomaly = {
            ...baseAnomaly,
            timestamp: firstTimestamp,
          };
          await indexListOfDocuments([firstAnomaly]);

          const createdRule = await createRule(supertest, log, {
            ...ruleProps,
            from: firstTimestamp,
          });
          const alerts = await getAlerts(supertest, log, es, createdRule);

          expect(alerts.hits.hits).toHaveLength(1);
          expect(alerts.hits.hits[0]._source).toEqual(
            expect.objectContaining({
              [ALERT_SUPPRESSION_TERMS]: [
                {
                  field: 'user.name',
                  value: ['root'],
                },
              ],
              // suppression boundaries equal to original event time, since no alert been suppressed
              [ALERT_SUPPRESSION_START]: firstTimestamp,
              [ALERT_SUPPRESSION_END]: firstTimestamp,
              [ALERT_ORIGINAL_TIME]: firstTimestamp,
              [ALERT_SUPPRESSION_DOCS_COUNT]: 0,
            })
          );

          const secondTimestamp = new Date().toISOString();
          const secondAnomaly = {
            ...baseAnomaly,
            timestamp: secondTimestamp,
          };

          // Add more anomalies, then disable and re-enable to trigger another
          // rule run. The second anomaly should trigger an update to the
          // existing alert without changing the timestamp
          await indexListOfDocuments([secondAnomaly, secondAnomaly]);
          await patchRule(supertest, log, { id: createdRule.id, enabled: false });
          await patchRule(supertest, log, { id: createdRule.id, enabled: true });
          const secondAlerts = await getOpenAlerts(
            supertest,
            log,
            es,
            createdRule,
            RuleExecutionStatusEnum.succeeded,
            undefined,
            new Date()
          );

          expect(secondAlerts.hits.hits).toHaveLength(2);
          expect(secondAlerts.hits.hits[1]._source).toEqual(
            expect.objectContaining({
              [ALERT_SUPPRESSION_TERMS]: [
                {
                  field: 'user.name',
                  value: ['root'],
                },
              ],
              [ALERT_ORIGINAL_TIME]: secondTimestamp,
              [ALERT_SUPPRESSION_START]: secondTimestamp,
              [ALERT_SUPPRESSION_END]: secondTimestamp,
              [ALERT_SUPPRESSION_DOCS_COUNT]: 1, // 1 of the two new anomalies was suppressed on this execution
            })
          );
        });
      });

      describe('with interval suppression duration', () => {
        beforeEach(() => {
          ruleProps = {
            ...baseRuleProps,
            alert_suppression: {
              duration: {
                value: 300,
                unit: 'm',
              },
              group_by: ['user.name'],
              missing_fields_strategy: 'suppress',
            },
          };
        });

        it('performs no suppression if a single alert is generated', async () => {
          const timestamp = new Date().toISOString();
          const anomaly = {
            ...baseAnomaly,
            timestamp,
          };
          await indexListOfDocuments([anomaly]);
          const createdRule = await createRule(supertest, log, ruleProps);
          const alerts = await getAlerts(supertest, log, es, createdRule);

          expect(alerts.hits.hits).toHaveLength(1);
          expect(alerts.hits.hits[0]._source).toEqual(
            expect.objectContaining({
              [ALERT_SUPPRESSION_TERMS]: [{ field: 'user.name', value: ['root'] }],
              [ALERT_SUPPRESSION_DOCS_COUNT]: 0,
            })
          );
        });

        it('suppresses alerts across two executions', async () => {
          const firstTimestamp = new Date().toISOString();
          const firstAnomaly = {
            ...baseAnomaly,
            timestamp: firstTimestamp,
          };
          await indexListOfDocuments([firstAnomaly]);

          const createdRule = await createRule(supertest, log, {
            ...ruleProps,
            from: firstTimestamp,
          });
          const alerts = await getAlerts(supertest, log, es, createdRule);

          expect(alerts.hits.hits).toHaveLength(1);
          expect(alerts.hits.hits[0]._source).toEqual(
            expect.objectContaining({
              [ALERT_SUPPRESSION_TERMS]: [
                {
                  field: 'user.name',
                  value: ['root'],
                },
              ],
              // suppression boundaries equal to original event time, since no alert been suppressed
              [ALERT_SUPPRESSION_START]: firstTimestamp,
              [ALERT_SUPPRESSION_END]: firstTimestamp,
              [ALERT_ORIGINAL_TIME]: firstTimestamp,
              [ALERT_SUPPRESSION_DOCS_COUNT]: 0,
            })
          );

          const secondTimestamp = new Date().toISOString();
          const secondAnomaly = {
            ...baseAnomaly,
            timestamp: secondTimestamp,
          };

          // Add more anomalies, then disable and re-enable to trigger another
          // rule run. The second anomaly should trigger an update to the
          // existing alert without changing the timestamp
          await indexListOfDocuments([secondAnomaly, secondAnomaly]);
          await patchRule(supertest, log, { id: createdRule.id, enabled: false });
          await patchRule(supertest, log, { id: createdRule.id, enabled: true });
          const secondAlerts = await getOpenAlerts(
            supertest,
            log,
            es,
            createdRule,
            RuleExecutionStatusEnum.succeeded,
            undefined,
            new Date()
          );

          expect(secondAlerts.hits.hits).toHaveLength(1);
          expect(secondAlerts.hits.hits[0]._source).toEqual(
            expect.objectContaining({
              [ALERT_SUPPRESSION_TERMS]: [
                {
                  field: 'user.name',
                  value: ['root'],
                },
              ],
              [ALERT_ORIGINAL_TIME]: firstTimestamp,
              [ALERT_SUPPRESSION_START]: firstTimestamp,
              [ALERT_SUPPRESSION_END]: secondTimestamp,
              [ALERT_SUPPRESSION_DOCS_COUNT]: 2, // 1 of the two new anomalies was suppressed on this execution
            })
          );
        });

        describe('with anomalies spanning multiple rule execution windows', () => {
          const firstTimestamp = '2020-10-28T05:45:00.000Z';
          const secondTimestamp = '2020-10-28T06:15:00.000Z';
          const thirdTimestamp = '2020-10-28T06:45:00.000Z';
          const afterThirdTimestamp = '2020-10-28T07:00:00.000Z';

          beforeEach(async () => {
            const firstAnomaly = {
              ...baseAnomaly,
              timestamp: firstTimestamp,
            };
            const secondAnomaly = {
              ...baseAnomaly,
              timestamp: secondTimestamp,
            };
            const thirdAnomaly = {
              ...baseAnomaly,
              timestamp: thirdTimestamp,
            };

            await indexListOfDocuments([
              firstAnomaly,
              firstAnomaly,
              secondAnomaly,
              secondAnomaly,
              thirdAnomaly,
            ]);
          });

          it('suppresses alerts across three executions', async () => {
            const rule = { ...ruleProps, interval: '30m' };
            const { previewId } = await previewRule({
              supertest,
              rule,
              timeframeEnd: new Date(afterThirdTimestamp),
              invocationCount: 3,
            });
            const previewAlerts = await getPreviewAlerts({
              es,
              previewId,
              sort: [ALERT_ORIGINAL_TIME],
            });

            expect(previewAlerts).toHaveLength(1);
            expect(previewAlerts[0]._source).toEqual(
              expect.objectContaining({
                [ALERT_SUPPRESSION_TERMS]: [
                  {
                    field: 'user.name',
                    value: ['root'],
                  },
                ],
                [TIMESTAMP]: '2020-10-28T06:00:00.000Z',
                [ALERT_LAST_DETECTED]: afterThirdTimestamp,
                [ALERT_START]: '2020-10-28T06:00:00.000Z',
                [ALERT_ORIGINAL_TIME]: firstTimestamp,
                [ALERT_SUPPRESSION_START]: firstTimestamp,
                [ALERT_SUPPRESSION_END]: thirdTimestamp,
                [ALERT_SUPPRESSION_DOCS_COUNT]: 4, // in total 4 alert got suppressed: 1 from the first run, 2 from the second, 1 from the third
              })
            );
          });

          it('suppresses alerts across multiple, sparse executions', async () => {
            const fifthTimestamp = '2020-10-28T07:45:00.000Z';
            const afterFifthTimestamp = '2020-10-28T08:00:00.000Z';
            const fifthAnomaly = { ...baseAnomaly, timestamp: fifthTimestamp };
            // no anomaly for fourth execution
            await indexListOfDocuments([fifthAnomaly]);

            const rule = { ...ruleProps, interval: '30m' };
            const { previewId } = await previewRule({
              supertest,
              rule,
              timeframeEnd: new Date(afterFifthTimestamp),
              invocationCount: 5,
            });
            const previewAlerts = await getPreviewAlerts({
              es,
              previewId,
              sort: [ALERT_ORIGINAL_TIME],
            });

            expect(previewAlerts).toHaveLength(1);
            expect(previewAlerts[0]._source).toEqual(
              expect.objectContaining({
                [ALERT_SUPPRESSION_TERMS]: [
                  {
                    field: 'user.name',
                    value: ['root'],
                  },
                ],
                [TIMESTAMP]: '2020-10-28T06:00:00.000Z',
                [ALERT_LAST_DETECTED]: afterFifthTimestamp,
                [ALERT_START]: '2020-10-28T06:00:00.000Z',
                [ALERT_ORIGINAL_TIME]: firstTimestamp,
                [ALERT_SUPPRESSION_START]: firstTimestamp,
                [ALERT_SUPPRESSION_END]: fifthTimestamp,
                [ALERT_SUPPRESSION_DOCS_COUNT]: 5, // in total 5 alerts were suppressed: 1 from the first run, 2 from the second, 1 from the third run, none from the fourth, and one from the fifth.
              })
            );
          });
        });

        it('suppresses alerts on multiple fields', async () => {
          const timestamp = new Date().toISOString();
          const anomaly = {
            ...baseAnomaly,
            timestamp,
            'process.name': ['auditbeat'],
          };
          await indexListOfDocuments([anomaly, anomaly]);

          const rule = {
            ...ruleProps,
            alert_suppression: {
              ...ruleProps.alert_suppression,
              group_by: ['user.name', 'process.name'],
            },
          };
          const { previewId } = await previewRule({
            supertest,
            rule,
            timeframeEnd: new Date(timestamp),
            invocationCount: 1,
          });
          const previewAlerts = await getPreviewAlerts({
            es,
            previewId,
            sort: [ALERT_ORIGINAL_TIME],
          });

          expect(previewAlerts).toHaveLength(1);
          expect(previewAlerts[0]._source).toEqual(
            expect.objectContaining({
              [ALERT_SUPPRESSION_TERMS]: [
                {
                  field: 'user.name',
                  value: ['root'],
                },
                {
                  field: 'process.name',
                  value: ['auditbeat'],
                },
              ],
              [TIMESTAMP]: timestamp,
              [ALERT_START]: timestamp,
              [ALERT_ORIGINAL_TIME]: timestamp,
              [ALERT_SUPPRESSION_START]: timestamp,
              [ALERT_SUPPRESSION_END]: timestamp,
              [ALERT_SUPPRESSION_DOCS_COUNT]: 1,
            })
          );
        });

        it('suppresses alerts with missing fields, if configured to do so', async () => {
          const timestamp = new Date().toISOString();
          const anomaly = {
            ...baseAnomaly,
            timestamp,
            'host.name': ['relevant'],
          };
          const anomalyWithoutSuppressionField = {
            ...baseAnomaly,
            timestamp,
          };
          await indexListOfDocuments([anomaly, anomaly, anomalyWithoutSuppressionField]);

          const rule = {
            ...ruleProps,
            alert_suppression: {
              ...ruleProps.alert_suppression,
              group_by: ['host.name'],
            },
          };
          const { previewId } = await previewRule({
            supertest,
            rule,
            timeframeEnd: new Date(timestamp),
            invocationCount: 1,
          });
          const previewAlerts = await getPreviewAlerts({
            es,
            previewId,
            sort: [ALERT_SUPPRESSION_DOCS_COUNT],
          });

          expect(previewAlerts).toHaveLength(2);
          expect(previewAlerts[0]._source).toEqual(
            expect.objectContaining({
              [ALERT_SUPPRESSION_TERMS]: [
                {
                  field: 'host.name',
                  value: null,
                },
              ],
              [TIMESTAMP]: timestamp,
              [ALERT_START]: timestamp,
              [ALERT_ORIGINAL_TIME]: timestamp,
              [ALERT_SUPPRESSION_START]: timestamp,
              [ALERT_SUPPRESSION_END]: timestamp,
              [ALERT_SUPPRESSION_DOCS_COUNT]: 0,
            })
          );

          expect(previewAlerts[1]._source).toEqual(
            expect.objectContaining({
              [ALERT_SUPPRESSION_TERMS]: [
                {
                  field: 'host.name',
                  value: ['relevant'],
                },
              ],
              [TIMESTAMP]: timestamp,
              [ALERT_START]: timestamp,
              [ALERT_ORIGINAL_TIME]: timestamp,
              [ALERT_SUPPRESSION_START]: timestamp,
              [ALERT_SUPPRESSION_END]: timestamp,
              [ALERT_SUPPRESSION_DOCS_COUNT]: 1, // the anomaly without `host.name` is not represented here
            })
          );
        });

        it('does not suppress alerts with missing fields, if not configured to do so', async () => {
          const rule = {
            ...ruleProps,
            alert_suppression: {
              ...ruleProps.alert_suppression,
              group_by: ['host.name'],
              missing_fields_strategy: 'doNotSuppress' as const,
            },
          };
          const timestamp = new Date().toISOString();
          const anomaly = {
            ...baseAnomaly,
            timestamp,
            'host.name': ['relevant'],
          };
          const anomalyWithoutSuppressionField = {
            ...baseAnomaly,
            timestamp,
            'user.name': ['irrelevant'],
          };
          await indexListOfDocuments([
            anomaly,
            anomaly,
            anomalyWithoutSuppressionField,
            anomalyWithoutSuppressionField,
          ]);

          const { previewId } = await previewRule({
            supertest,
            rule,
            timeframeEnd: new Date(timestamp),
            invocationCount: 1,
          });
          const previewAlerts = await getPreviewAlerts({
            es,
            previewId,
            sort: [ALERT_ORIGINAL_TIME],
          });

          expect(previewAlerts).toHaveLength(3);
          expect(previewAlerts[0]._source).toEqual(
            expect.objectContaining({
              'user.name': ['irrelevant'],
              [TIMESTAMP]: timestamp,
            })
          );

          expect(previewAlerts[0]._source).toEqual(
            expect.not.objectContaining({
              [ALERT_SUPPRESSION_TERMS]: expect.anything(),
              [ALERT_ORIGINAL_TIME]: expect.anything(),
              [ALERT_SUPPRESSION_START]: expect.anything(),
              [ALERT_SUPPRESSION_END]: expect.anything(),
              [ALERT_SUPPRESSION_DOCS_COUNT]: expect.anything(),
            })
          );

          expect(previewAlerts[1]._source).toEqual(
            expect.objectContaining({
              'user.name': ['irrelevant'],
              [TIMESTAMP]: timestamp,
            })
          );
          expect(previewAlerts[1]._source).toEqual(
            expect.not.objectContaining({
              [ALERT_SUPPRESSION_TERMS]: expect.anything(),
              [ALERT_ORIGINAL_TIME]: expect.anything(),
              [ALERT_SUPPRESSION_START]: expect.anything(),
              [ALERT_SUPPRESSION_END]: expect.anything(),
              [ALERT_SUPPRESSION_DOCS_COUNT]: expect.anything(),
            })
          );

          expect(previewAlerts[2]._source).toEqual(
            expect.objectContaining({
              [ALERT_SUPPRESSION_TERMS]: [
                {
                  field: 'host.name',
                  value: ['relevant'],
                },
              ],
              [TIMESTAMP]: timestamp,
              [ALERT_ORIGINAL_TIME]: timestamp,
              [ALERT_SUPPRESSION_START]: timestamp,
              [ALERT_SUPPRESSION_END]: timestamp,
              [ALERT_SUPPRESSION_DOCS_COUNT]: 1, // the anomaly without `host.name` is not represented here
            })
          );
        });

        it('does not suppress into a closed alert', async () => {
          const firstTimestamp = new Date().toISOString();
          const firstAnomaly = {
            ...baseAnomaly,
            timestamp: firstTimestamp,
          };
          await indexListOfDocuments([firstAnomaly]);

          const createdRule = await createRule(supertest, log, {
            ...ruleProps,
            from: firstTimestamp,
          });
          const alerts = await getAlerts(supertest, log, es, createdRule);

          expect(alerts.hits.hits).toHaveLength(1);
          const alertId = alerts.hits.hits[0]._id!;

          // close generated alert
          await supertest
            .post(DETECTION_ENGINE_ALERTS_STATUS_URL)
            .set('kbn-xsrf', 'true')
            .send(setAlertStatus({ alertIds: [alertId], status: 'closed' }))
            .expect(200);

          const secondTimestamp = new Date().toISOString();
          const secondAnomaly = {
            ...baseAnomaly,
            timestamp: secondTimestamp,
          };

          // Add more anomalies, then disable and re-enable to trigger another
          // rule run. The second anomalies should create a new alert, since the existing alert is closed.
          await indexListOfDocuments([secondAnomaly, secondAnomaly]);
          await patchRule(supertest, log, { id: createdRule.id, enabled: false });
          await patchRule(supertest, log, { id: createdRule.id, enabled: true });
          const secondAlerts = await getOpenAlerts(
            supertest,
            log,
            es,
            createdRule,
            RuleExecutionStatusEnum.succeeded,
            undefined,
            new Date()
          );

          expect(secondAlerts.hits.hits).toHaveLength(1);
          expect(secondAlerts.hits.hits[0]._source).toEqual(
            expect.objectContaining({
              [ALERT_SUPPRESSION_TERMS]: [
                {
                  field: 'user.name',
                  value: ['root'],
                },
              ],
              [ALERT_ORIGINAL_TIME]: secondTimestamp,
              [ALERT_SUPPRESSION_START]: secondTimestamp,
              [ALERT_SUPPRESSION_END]: secondTimestamp,
              [ALERT_SUPPRESSION_DOCS_COUNT]: 1,
            })
          );
        });

        it('does not suppress into an unsuppressed alert', async () => {
          const firstTimestamp = new Date().toISOString();
          const firstAnomaly = {
            ...baseAnomaly,
            timestamp: firstTimestamp,
          };
          await indexListOfDocuments([firstAnomaly]);

          const ruleWithoutSuppression = { ...ruleProps, alert_suppression: undefined };
          const createdRule = await createRule(supertest, log, {
            ...ruleWithoutSuppression,
            from: firstTimestamp,
          });
          const alerts = await getAlerts(supertest, log, es, createdRule);

          expect(alerts.hits.hits).toHaveLength(1);

          // update the rule to include suppression
          await patchRule(supertest, log, {
            id: createdRule.id,
            alert_suppression: ruleProps.alert_suppression,
          });

          const secondTimestamp = new Date().toISOString();
          const secondAnomaly = {
            ...baseAnomaly,
            timestamp: secondTimestamp,
          };

          // Add more anomalies, then disable and re-enable to trigger another
          // rule run. The second anomalies should create a new suppressed alert, since the original was not suppressed.
          await indexListOfDocuments([secondAnomaly, secondAnomaly, secondAnomaly]);
          await patchRule(supertest, log, { id: createdRule.id, enabled: false });
          await patchRule(supertest, log, { id: createdRule.id, enabled: true });
          const secondAlerts = await getOpenAlerts(
            supertest,
            log,
            es,
            createdRule,
            RuleExecutionStatusEnum.succeeded,
            undefined,
            new Date()
          );

          expect(secondAlerts.hits.hits).toHaveLength(2);
          // assert that the first alert does not have suppression fields
          expect(secondAlerts.hits.hits[0]._source).toEqual(
            expect.not.objectContaining({
              [ALERT_SUPPRESSION_TERMS]: expect.anything(),
              [ALERT_ORIGINAL_TIME]: expect.anything(),
              [ALERT_SUPPRESSION_START]: expect.anything(),
              [ALERT_SUPPRESSION_END]: expect.anything(),
              [ALERT_SUPPRESSION_DOCS_COUNT]: expect.anything(),
            })
          );

          expect(secondAlerts.hits.hits[1]._source).toEqual(
            expect.objectContaining({
              [ALERT_SUPPRESSION_TERMS]: [
                {
                  field: 'user.name',
                  value: ['root'],
                },
              ],
              [ALERT_ORIGINAL_TIME]: secondTimestamp,
              [ALERT_SUPPRESSION_START]: secondTimestamp,
              [ALERT_SUPPRESSION_END]: secondTimestamp,
              [ALERT_SUPPRESSION_DOCS_COUNT]: 2,
            })
          );
        });

        it('suppresses alerts that would be _created_ within the suppression duration window, even if the original anomalies were outside that suppression duration window', async () => {
          const rule = {
            ...ruleProps,
            interval: '30m',
            alert_suppression: {
              ...ruleProps.alert_suppression,
              duration: {
                value: 1,
                unit: 'm',
              },
            },
          } as MachineLearningRuleCreateProps;
          const firstTimestamp = '2020-10-28T06:00:00.000Z';
          const secondTimestamp = '2020-10-28T06:15:00.000Z';
          const firstAnomaly = { ...baseAnomaly, timestamp: firstTimestamp };
          const secondAnomaly = { ...baseAnomaly, timestamp: secondTimestamp };
          await indexListOfDocuments([firstAnomaly, secondAnomaly]);

          const { previewId } = await previewRule({
            supertest,
            rule,
            timeframeEnd: new Date(secondTimestamp),
            invocationCount: 1,
          });
          const previewAlerts = await getPreviewAlerts({
            es,
            previewId,
            sort: [ALERT_ORIGINAL_TIME],
          });

          expect(previewAlerts).toHaveLength(1);
          expect(previewAlerts[0]._source).toEqual(
            expect.objectContaining({
              [ALERT_SUPPRESSION_TERMS]: [
                {
                  field: 'user.name',
                  value: ['root'],
                },
              ],
              [TIMESTAMP]: secondTimestamp,
              [ALERT_LAST_DETECTED]: secondTimestamp,
              [ALERT_START]: secondTimestamp,
              [ALERT_ORIGINAL_TIME]: firstTimestamp,
              [ALERT_SUPPRESSION_START]: firstTimestamp,
              [ALERT_SUPPRESSION_END]: secondTimestamp,
              [ALERT_SUPPRESSION_DOCS_COUNT]: 1,
            })
          );
        });

        it('does not suppress across multiple runs if the suppression interval is less than the rule interval ', async () => {
          const rule = {
            ...ruleProps,
            interval: '5m',
            alert_suppression: {
              ...ruleProps.alert_suppression,
              duration: {
                value: 1,
                unit: 'm',
              },
            },
          } as MachineLearningRuleCreateProps;
          const firstTimestamp = '2020-10-28T06:00:00.000Z';
          const secondTimestamp = '2020-10-28T06:15:00.000Z';
          const firstAnomaly = { ...baseAnomaly, timestamp: firstTimestamp };
          const secondAnomaly = { ...baseAnomaly, timestamp: secondTimestamp };
          await indexListOfDocuments([firstAnomaly, secondAnomaly]);

          const { previewId } = await previewRule({
            supertest,
            rule,
            timeframeEnd: new Date(secondTimestamp),
            invocationCount: 3,
          });
          const previewAlerts = await getPreviewAlerts({
            es,
            previewId,
            sort: [ALERT_ORIGINAL_TIME],
          });

          expect(previewAlerts).toHaveLength(2);
          expect(previewAlerts[0]._source).toEqual(
            expect.objectContaining({
              [ALERT_SUPPRESSION_TERMS]: [
                {
                  field: 'user.name',
                  value: ['root'],
                },
              ],
              [ALERT_ORIGINAL_TIME]: firstTimestamp,
              [ALERT_SUPPRESSION_START]: firstTimestamp,
              [ALERT_SUPPRESSION_END]: firstTimestamp,
              [ALERT_SUPPRESSION_DOCS_COUNT]: 0,
            })
          );
          expect(previewAlerts[1]._source).toEqual(
            expect.objectContaining({
              [ALERT_SUPPRESSION_TERMS]: [
                {
                  field: 'user.name',
                  value: ['root'],
                },
              ],
              [ALERT_ORIGINAL_TIME]: secondTimestamp,
              [ALERT_SUPPRESSION_START]: secondTimestamp,
              [ALERT_SUPPRESSION_END]: secondTimestamp,
              [ALERT_SUPPRESSION_DOCS_COUNT]: 0,
            })
          );
        });

        it('suppresses alerts within a single execution', async () => {
          const timestamp = new Date().toISOString();
          const anomaly = {
            ...baseAnomaly,
            timestamp,
          };
          await indexListOfDocuments([anomaly, anomaly]);

          const createdRule = await createRule(supertest, log, {
            ...ruleProps,
            from: timestamp,
          });

          const alerts = await getAlerts(supertest, log, es, createdRule);
          expect(alerts.hits.hits).toHaveLength(1);
          expect(alerts.hits.hits[0]._source).toEqual(
            expect.objectContaining({
              [ALERT_SUPPRESSION_TERMS]: [
                {
                  field: 'user.name',
                  value: ['root'],
                },
              ],
              [ALERT_SUPPRESSION_START]: timestamp,
              [ALERT_SUPPRESSION_END]: timestamp,
              [ALERT_ORIGINAL_TIME]: timestamp,
              [ALERT_SUPPRESSION_DOCS_COUNT]: 1,
            })
          );
        });

        it('deduplicates previously suppressed alerts if rule has overlapping execution windows', async () => {
          const firstTimestamp = new Date().toISOString();
          const firstAnomaly = {
            ...baseAnomaly,
            timestamp: firstTimestamp,
          };
          await indexListOfDocuments([firstAnomaly]);

          const createdRule = await createRule(supertest, log, {
            ...ruleProps,
            from: firstTimestamp,
          });
          const alerts = await getAlerts(supertest, log, es, createdRule);

          expect(alerts.hits.hits).toHaveLength(1);
          expect(alerts.hits.hits[0]._source).toEqual(
            expect.objectContaining({
              [ALERT_SUPPRESSION_TERMS]: [
                {
                  field: 'user.name',
                  value: ['root'],
                },
              ],
              // suppression boundaries equal to original event time, since no alert been suppressed
              [ALERT_SUPPRESSION_START]: firstTimestamp,
              [ALERT_SUPPRESSION_END]: firstTimestamp,
              [ALERT_ORIGINAL_TIME]: firstTimestamp,
              [ALERT_SUPPRESSION_DOCS_COUNT]: 0,
            })
          );

          const secondTimestamp = new Date().toISOString();
          const secondAnomaly = {
            ...baseAnomaly,
            timestamp: secondTimestamp,
          };

          // Add more anomalies, then disable and re-enable to trigger another
          // rule run. The second anomaly should trigger an update to the
          // existing alert without changing the timestamp
          await indexListOfDocuments([secondAnomaly, secondAnomaly]);
          await patchRule(supertest, log, { id: createdRule.id, enabled: false });
          await patchRule(supertest, log, { id: createdRule.id, enabled: true });
          const secondAlerts = await getOpenAlerts(
            supertest,
            log,
            es,
            createdRule,
            RuleExecutionStatusEnum.succeeded,
            undefined,
            new Date()
          );

          expect(secondAlerts.hits.hits).toHaveLength(1);
          expect(secondAlerts.hits.hits[0]._source).toEqual(
            expect.objectContaining({
              [ALERT_SUPPRESSION_TERMS]: [
                {
                  field: 'user.name',
                  value: ['root'],
                },
              ],
              [ALERT_ORIGINAL_TIME]: firstTimestamp,
              [ALERT_SUPPRESSION_START]: firstTimestamp,
              [ALERT_SUPPRESSION_END]: secondTimestamp,
              [ALERT_SUPPRESSION_DOCS_COUNT]: 2, // both new anomalies were suppressed into the original
            })
          );
        });

        it('suppresses alerts with array field values', async () => {
          const timestamp = new Date().toISOString();
          const anomaly = {
            ...baseAnomaly,
            'user.name': ['host1', 'host2'],
            timestamp,
          };
          await indexListOfDocuments([anomaly, anomaly]);

          const createdRule = await createRule(supertest, log, {
            ...ruleProps,
            from: timestamp,
          });

          const alerts = await getAlerts(supertest, log, es, createdRule);
          expect(alerts.hits.hits).toHaveLength(1);
          expect(alerts.hits.hits[0]._source).toEqual(
            expect.objectContaining({
              [ALERT_SUPPRESSION_TERMS]: [
                {
                  field: 'user.name',
                  value: ['host1', 'host2'],
                },
              ],
              [ALERT_SUPPRESSION_START]: timestamp,
              [ALERT_SUPPRESSION_END]: timestamp,
              [ALERT_ORIGINAL_TIME]: timestamp,
              [ALERT_SUPPRESSION_DOCS_COUNT]: 1,
            })
          );
        });

        describe('with exceptions', () => {
          beforeEach(async () => {
            await deleteAllExceptions(supertest, log);
          });

          it('applies exceptions before suppression', async () => {
            const timestamp = new Date().toISOString();
            const anomaly = {
              ...baseAnomaly,
              timestamp,
            };
            const anomalyWithExceptionField = {
              ...anomaly,
              'process.name': ['auditbeat'],
            };
            await indexListOfDocuments([anomaly, anomalyWithExceptionField]);

            const { previewId } = await previewRuleWithExceptionEntries({
              supertest,
              rule: ruleProps,
              log,
              timeframeEnd: new Date(timestamp),
              entries: [
                [
                  {
                    field: 'process.name',
                    operator: 'included',
                    type: 'match',
                    value: 'auditbeat',
                  },
                ],
              ],
            });
            const previewAlerts = await getPreviewAlerts({
              es,
              previewId,
              sort: [ALERT_ORIGINAL_TIME],
            });

            expect(previewAlerts).toHaveLength(1);
            expect(previewAlerts[0]._source).toEqual(
              expect.objectContaining({
                [ALERT_SUPPRESSION_TERMS]: [
                  {
                    field: 'user.name',
                    value: ['root'],
                  },
                ],
                [TIMESTAMP]: timestamp,
                [ALERT_START]: timestamp,
                [ALERT_ORIGINAL_TIME]: timestamp,
                [ALERT_SUPPRESSION_START]: timestamp,
                [ALERT_SUPPRESSION_END]: timestamp,
                [ALERT_SUPPRESSION_DOCS_COUNT]: 0, // the anomaly with the exception field was not suppressed but omitted due to the exception
              })
            );
          });
        });
      });

      describe('with enrichments', () => {
        before(async () => {
          await entityStoreV2.setup({
            hosts: [
              {
                host: { name: 'zeek-newyork-sha-aa8df15' },
                entity: {
                  id: 'host:zeek-newyork-sha-aa8df15',
                  type: 'host',
                  risk: { calculated_level: 'Low', calculated_score_norm: 23 },
                },
                asset: { criticality: 'medium_impact' },
              },
            ],
          });
        });

        after(async () => {
          await entityStoreV2.teardown();
        });

        beforeEach(async () => {
          const timestamp = new Date().toISOString();
          const anomalyWithKnownEntities = {
            ...baseAnomaly,
            timestamp,
            host: { name: 'zeek-newyork-sha-aa8df15' },
          };
          await indexListOfDocuments([anomalyWithKnownEntities]);

          ruleProps = {
            ...baseRuleProps,
            from: timestamp,
            alert_suppression: {
              group_by: ['host.name'],
              missing_fields_strategy: 'suppress',
            },
          };
        });

        it('should be enriched with host risk score', async () => {
          const { previewId } = await previewRule({ supertest, rule: ruleProps });
          const previewAlerts = await getPreviewAlerts({ es, previewId });
          expect(previewAlerts).toHaveLength(1);
          const alertSource = previewAlerts[0]._source;

          expect(alertSource?.host?.risk?.calculated_level).toBe('Low');
          expect(alertSource?.host?.risk?.calculated_score_norm).toBe(23);
        });

        it('should be enriched alert with criticality_level', async () => {
          const { previewId } = await previewRule({ supertest, rule: ruleProps });
          const previewAlerts = await getPreviewAlerts({ es, previewId });
          expect(previewAlerts).toHaveLength(1);
          const fullAlert = previewAlerts[0]._source;

          expect(fullAlert?.['host.asset.criticality']).toBe('medium_impact');
        });
      });
    });
  });
};
