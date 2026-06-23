/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from 'expect';
import { v4 as uuidv4 } from 'uuid';
import { sortBy, partition } from 'lodash';

import type {
  DetectionAlert,
  EqlRuleCreateProps,
} from '@kbn/security-solution-plugin/common/api/detection_engine';
import {
  ALERT_SUPPRESSION_START,
  ALERT_SUPPRESSION_END,
  ALERT_SUPPRESSION_DOCS_COUNT,
  ALERT_SUPPRESSION_TERMS,
  ALERT_LAST_DETECTED,
  TIMESTAMP,
  ALERT_START,
} from '@kbn/rule-data-utils';
import { DETECTION_ENGINE_SIGNALS_STATUS_URL as DETECTION_ENGINE_ALERTS_STATUS_URL } from '@kbn/security-solution-plugin/common/constants';
import { getSuppressionMaxSignalsWarning as getSuppressionMaxAlertsWarning } from '@kbn/security-solution-plugin/server/lib/detection_engine/rule_types/utils/utils';
import { RuleExecutionStatusEnum } from '@kbn/security-solution-plugin/common/api/detection_engine/rule_monitoring';
import { ALERT_ORIGINAL_TIME } from '@kbn/security-solution-plugin/common/field_maps/field_names';
import type { RiskEnrichmentFields } from '@kbn/security-solution-plugin/server/lib/detection_engine/rule_types/utils/enrichments/types';
import type { SearchHit } from '@elastic/elasticsearch/lib/api/types';
import {
  createRule,
  deleteAllRules,
  deleteAllAlerts,
  waitForRuleSuccess,
} from '@kbn/detections-response-ftr-services';
import {
  getEqlRuleForAlertTesting,
  getOpenAlerts,
  getPreviewAlerts,
  previewRule,
  dataGeneratorFactory,
  patchRule,
  setAlertStatus,
  fetchRule,
  previewRuleWithExceptionEntries,
} from '../../../../utils';
import type { FtrProviderContext } from '../../../../../../ftr_provider_context';
import { deleteAllExceptions } from '../../../../../lists_and_exception_lists/utils';
import { EntityStoreV2EnrichmentSetup } from '../../entity_store_v2_enrichment_setup';

const getQuery = (id: string) => `any where id == "${id}"`;
const getSequenceQuery = (id: string) =>
  `sequence [any where id == "${id}"] [any where id == "${id}"]`;

export default ({ getService }: FtrProviderContext) => {
  const supertest = getService('supertest');
  const esArchiver = getService('esArchiver');
  const esDeleteAllIndices = getService('esDeleteAllIndices');
  const entityStoreV2 = EntityStoreV2EnrichmentSetup(getService);

  const es = getService('es');
  const log = getService('log');
  const {
    indexListOfDocuments: indexListOfSourceDocuments,
    indexGeneratedDocuments: indexGeneratedSourceDocuments,
  } = dataGeneratorFactory({
    es,
    index: 'ecs_compliant',
    log,
  });

  const partitionSequenceBuildingBlocks = (
    alerts: Array<SearchHit<DetectionAlert & RiskEnrichmentFields>>
  ) => partition(alerts, (alert) => alert?._source?.['kibana.alert.group.index'] == null);

  // NOTE: Add to second quality gate after feature is GA
  describe('@ess @serverless Alert Suppression for EQL rules', () => {
    before(async () => {
      await esArchiver.load(
        'x-pack/solutions/security/test/fixtures/es_archives/security_solution/ecs_compliant'
      );
    });

    after(async () => {
      await esArchiver.unload(
        'x-pack/solutions/security/test/fixtures/es_archives/security_solution/ecs_compliant'
      );
      await esDeleteAllIndices('.preview.alerts*');
    });

    afterEach(async () => {
      await deleteAllAlerts(supertest, log, es, [
        '.preview.alerts-security.alerts-*',
        '.alerts-security.alerts-*',
      ]);
      await deleteAllRules(supertest, log);
    });

    describe('non-sequence queries', () => {
      describe('with "per time interval" suppression duration', () => {
        it('suppresses alerts across two rule executions when the suppression duration exceeds the rule interval', async () => {
          const id = uuidv4();
          const firstTimestamp = new Date().toISOString();

          const firstDocument = {
            id,
            '@timestamp': firstTimestamp,
            host: {
              name: 'host-a',
            },
          };
          await indexListOfSourceDocuments([firstDocument]);

          const rule: EqlRuleCreateProps = {
            ...getEqlRuleForAlertTesting(['ecs_compliant']),
            query: getQuery(id),
            alert_suppression: {
              group_by: ['host.name'],
              duration: {
                value: 300,
                unit: 'm',
              },
              missing_fields_strategy: 'suppress',
            },
            from: 'now-35m',
            interval: '30m',
          };
          const createdRule = await createRule(supertest, log, rule);
          const alerts = await getOpenAlerts(supertest, log, es, createdRule);
          expect(alerts.hits.hits).toHaveLength(1);

          // suppression start equal to alert timestamp
          const suppressionStart = alerts.hits.hits[0]._source?.[TIMESTAMP];

          expect(alerts.hits.hits[0]._source).toEqual(
            expect.objectContaining({
              [ALERT_SUPPRESSION_TERMS]: [
                {
                  field: 'host.name',
                  value: ['host-a'],
                },
              ],
              // suppression boundaries equal to original event time, since no alert been suppressed
              [ALERT_SUPPRESSION_START]: firstTimestamp,
              [ALERT_SUPPRESSION_END]: firstTimestamp,
              [ALERT_ORIGINAL_TIME]: firstTimestamp,
              [TIMESTAMP]: suppressionStart,
              [ALERT_SUPPRESSION_DOCS_COUNT]: 0,
            })
          );

          const secondTimestamp = new Date().toISOString();
          const secondDocument = {
            id,
            '@timestamp': secondTimestamp,
            host: {
              name: 'host-a',
            },
          };

          // Add a new document, then disable and re-enable to trigger another rule run. The second doc should
          // trigger an update to the existing alert without changing the timestamp
          await indexListOfSourceDocuments([secondDocument, secondDocument]);
          await patchRule(supertest, log, { id: createdRule.id, enabled: false });
          await patchRule(supertest, log, { id: createdRule.id, enabled: true });
          const afterTimestamp = new Date();
          const secondAlerts = await getOpenAlerts(
            supertest,
            log,
            es,
            createdRule,
            RuleExecutionStatusEnum.succeeded,
            undefined,
            afterTimestamp
          );
          expect(secondAlerts.hits.hits).toHaveLength(1);
          expect(secondAlerts.hits.hits[0]._source).toEqual(
            expect.objectContaining({
              [ALERT_SUPPRESSION_TERMS]: [
                {
                  field: 'host.name',
                  value: ['host-a'],
                },
              ],
              [ALERT_ORIGINAL_TIME]: firstTimestamp, // timestamp is the same
              [ALERT_SUPPRESSION_START]: firstTimestamp, // suppression start is the same
              [ALERT_SUPPRESSION_END]: secondTimestamp, // suppression end is updated
              [ALERT_SUPPRESSION_DOCS_COUNT]: 2, // 2 alerts from second rule run, that's why 2 suppressed
            })
          );
          // suppression end value should be greater than second document timestamp, but lesser than current time
          const suppressionEnd = new Date(
            secondAlerts.hits.hits[0]._source?.[ALERT_SUPPRESSION_END] as string
          ).getTime();
          expect(suppressionEnd).toBeLessThan(new Date().getTime());
          expect(suppressionEnd).toBeGreaterThan(new Date(secondTimestamp).getDate());
        });

        it('does not suppress a new alert and update the original alert if the original alert is closed', async () => {
          const id = uuidv4();
          const firstTimestamp = new Date().toISOString();

          const firstDocument = {
            id,
            '@timestamp': firstTimestamp,
            host: {
              name: 'host-a',
            },
          };
          await indexListOfSourceDocuments([firstDocument]);

          const rule: EqlRuleCreateProps = {
            ...getEqlRuleForAlertTesting(['ecs_compliant']),
            query: getQuery(id),
            alert_suppression: {
              group_by: ['host.name'],
              duration: {
                value: 300,
                unit: 'm',
              },
              missing_fields_strategy: 'suppress',
            },
            from: 'now-35m',
            interval: '30m',
          };
          const createdRule = await createRule(supertest, log, rule);
          const alerts = await getOpenAlerts(supertest, log, es, createdRule);

          // Close the alert. Subsequent rule executions should ignore this closed alert
          // for suppression purposes.
          const alertIds = alerts.hits.hits.map((alert) => alert._id!);

          await supertest
            .post(DETECTION_ENGINE_ALERTS_STATUS_URL)
            .set('kbn-xsrf', 'true')
            .send(setAlertStatus({ alertIds, status: 'closed' }))
            .expect(200);

          const secondTimestamp = new Date().toISOString();
          const secondDocument = {
            id,
            '@timestamp': secondTimestamp,
            agent: {
              name: 'agent-1',
            },
          };
          // Add new documents, then disable and re-enable to trigger another rule run. The second doc should
          // trigger a new alert since the first one is now closed.
          await indexListOfSourceDocuments([secondDocument]);

          await patchRule(supertest, log, { id: createdRule.id, enabled: false });
          await patchRule(supertest, log, { id: createdRule.id, enabled: true });
          const afterTimestamp = new Date();
          await getOpenAlerts(
            supertest,
            log,
            es,
            createdRule,
            RuleExecutionStatusEnum.succeeded,
            undefined,
            afterTimestamp
          );

          expect(alerts.hits.hits[0]._source).toEqual(
            expect.objectContaining({
              [ALERT_SUPPRESSION_TERMS]: [
                {
                  field: 'host.name',
                  value: ['host-a'],
                },
              ],
              [ALERT_ORIGINAL_TIME]: firstTimestamp,
              [ALERT_SUPPRESSION_DOCS_COUNT]: 0,
            })
          );
        });

        it('deduplicates new alerts if they were previously created without suppression', async () => {
          const id = uuidv4();
          const firstTimestamp = new Date().toISOString();

          const ruleWithoutSuppression: EqlRuleCreateProps = {
            ...getEqlRuleForAlertTesting(['ecs_compliant']),
            query: getQuery(id),
            from: 'now-35m',
            interval: '30m',
          };
          const alertSuppression = {
            group_by: ['host.name'],
            duration: {
              value: 300,
              unit: 'm' as const,
            },
            missing_fields_strategy: 'suppress',
          };

          const firstDocument = {
            id,
            '@timestamp': firstTimestamp,
            host: {
              name: 'host-a',
            },
          };
          await indexListOfSourceDocuments([firstDocument, firstDocument]);

          const createdRule = await createRule(supertest, log, ruleWithoutSuppression);
          const alerts = await getOpenAlerts(supertest, log, es, createdRule);
          expect(alerts.hits.hits).toHaveLength(2);
          // alert does not have suppression properties
          alerts.hits.hits.forEach((previewAlert) => {
            const source = previewAlert._source;
            expect(source).toHaveProperty('id', id);
            expect(source).not.toHaveProperty(ALERT_SUPPRESSION_DOCS_COUNT);
            expect(source).not.toHaveProperty(ALERT_SUPPRESSION_END);
            expect(source).not.toHaveProperty(ALERT_SUPPRESSION_TERMS);
            expect(source).not.toHaveProperty(ALERT_SUPPRESSION_DOCS_COUNT);
          });

          const secondTimestamp = new Date().toISOString();
          const secondDocument = {
            id,
            '@timestamp': secondTimestamp,
            host: {
              name: 'host-a',
            },
          };

          await indexListOfSourceDocuments([secondDocument, secondDocument]);

          // update the rule to include suppression
          await patchRule(supertest, log, {
            id: createdRule.id,
            alert_suppression: alertSuppression,
            enabled: false,
          });
          await patchRule(supertest, log, { id: createdRule.id, enabled: true });

          const afterTimestamp = new Date();
          const secondAlerts = await getOpenAlerts(
            supertest,
            log,
            es,
            createdRule,
            RuleExecutionStatusEnum.succeeded,
            undefined,
            afterTimestamp
          );

          expect(secondAlerts.hits.hits).toHaveLength(3);

          const sortedAlerts = sortBy(secondAlerts.hits.hits, ALERT_ORIGINAL_TIME);

          // third alert is generated with suppression
          expect(sortedAlerts[2]._source).toEqual(
            expect.objectContaining({
              [ALERT_SUPPRESSION_TERMS]: [
                {
                  field: 'host.name',
                  value: ['host-a'],
                },
              ],
              [ALERT_ORIGINAL_TIME]: secondTimestamp,
              [ALERT_SUPPRESSION_DOCS_COUNT]: 1,
            })
          );
        });

        it('does not suppress alerts when suppression duration is less than rule interval', async () => {
          const id = uuidv4();
          const firstTimestamp = '2020-10-28T05:45:00.000Z';
          const secondTimestamp = '2020-10-28T06:15:00.000Z';

          const firstRunDoc = {
            id,
            '@timestamp': firstTimestamp,
            host: {
              name: 'host-a',
            },
          };
          const secondRunDoc = {
            ...firstRunDoc,
            '@timestamp': secondTimestamp,
          };

          await indexListOfSourceDocuments([firstRunDoc, secondRunDoc]);

          const rule: EqlRuleCreateProps = {
            ...getEqlRuleForAlertTesting(['ecs_compliant']),
            query: getQuery(id),
            alert_suppression: {
              group_by: ['host.name'],
              duration: {
                value: 20,
                unit: 'm',
              },
              missing_fields_strategy: 'suppress',
            },
            from: 'now-35m',
            interval: '30m',
          };
          const { previewId } = await previewRule({
            supertest,
            rule,
            timeframeEnd: new Date('2020-10-28T06:30:00.000Z'),
            invocationCount: 2,
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
                  field: 'host.name',
                  value: ['host-a'],
                },
              ],
              [TIMESTAMP]: '2020-10-28T06:00:00.000Z',
              [ALERT_SUPPRESSION_START]: firstTimestamp,
              [ALERT_SUPPRESSION_END]: firstTimestamp,
              [ALERT_SUPPRESSION_DOCS_COUNT]: 0,
            })
          );

          expect(previewAlerts[1]._source).toEqual(
            expect.objectContaining({
              [ALERT_SUPPRESSION_TERMS]: [
                {
                  field: 'host.name',
                  value: ['host-a'],
                },
              ],
              [TIMESTAMP]: '2020-10-28T06:30:00.000Z',
              [ALERT_SUPPRESSION_START]: secondTimestamp,
              [ALERT_SUPPRESSION_END]: secondTimestamp,
              [ALERT_SUPPRESSION_DOCS_COUNT]: 0,
            })
          );
        });

        it('suppresses alerts across three rule executions', async () => {
          const id = uuidv4();
          const firstTimestamp = '2020-10-28T05:45:00.000Z';
          const secondTimestamp = '2020-10-28T06:15:00.000Z';
          const thirdTimestamp = '2020-10-28T06:45:00.000Z';
          const firstRunDoc = {
            id,
            '@timestamp': firstTimestamp,
            host: { name: 'host-a' },
          };
          const secondRunDoc = {
            ...firstRunDoc,
            '@timestamp': secondTimestamp,
          };
          const thirdRunDoc = {
            ...firstRunDoc,
            '@timestamp': thirdTimestamp,
          };

          await indexListOfSourceDocuments([
            firstRunDoc,
            firstRunDoc,
            secondRunDoc,
            secondRunDoc,
            thirdRunDoc,
          ]);

          const rule: EqlRuleCreateProps = {
            ...getEqlRuleForAlertTesting(['ecs_compliant']),
            query: getQuery(id),
            alert_suppression: {
              group_by: ['host.name'],
              duration: {
                value: 300,
                unit: 'm',
              },
              missing_fields_strategy: 'suppress',
            },
            from: 'now-35m',
            interval: '30m',
          };

          const { previewId } = await previewRule({
            supertest,
            rule,
            timeframeEnd: new Date('2020-10-28T07:00:00.000Z'),
            invocationCount: 3,
          });
          const previewAlerts = await getPreviewAlerts({
            es,
            previewId,
            sort: [ALERT_ORIGINAL_TIME],
          });
          expect(previewAlerts).toHaveLength(1);
          expect(previewAlerts[0]._source).toEqual({
            ...previewAlerts[0]._source,
            [ALERT_SUPPRESSION_TERMS]: [
              {
                field: 'host.name',
                value: ['host-a'],
              },
            ],
            [TIMESTAMP]: '2020-10-28T06:00:00.000Z',
            [ALERT_LAST_DETECTED]: '2020-10-28T07:00:00.000Z', // Note: ALERT_LAST_DETECTED gets updated, timestamp does not
            [ALERT_START]: '2020-10-28T06:00:00.000Z',
            [ALERT_ORIGINAL_TIME]: firstTimestamp,
            [ALERT_SUPPRESSION_START]: firstTimestamp,
            [ALERT_SUPPRESSION_END]: thirdTimestamp,
            [ALERT_SUPPRESSION_DOCS_COUNT]: 4, // in total 4 alert got suppressed: 1 from the first run, 2 from the second, 1 from the third
          });
        });

        it('suppresses alerts when using a timestamp override', async () => {
          const id = uuidv4();
          const firstTimestamp = '2020-10-28T05:45:00.000Z';
          const secondTimestamp = '2020-10-28T06:10:00.000Z';
          const docWithoutOverride = {
            id,
            '@timestamp': firstTimestamp,
            host: { name: 'host-a' },
            event: {
              ingested: firstTimestamp,
            },
          };
          const docWithOverride = {
            ...docWithoutOverride,
            // This doc simulates a very late arriving doc
            '@timestamp': '2020-10-28T03:00:00.000Z',
            event: {
              ingested: secondTimestamp,
            },
          };

          await indexListOfSourceDocuments([docWithoutOverride, docWithOverride]);

          const rule: EqlRuleCreateProps = {
            ...getEqlRuleForAlertTesting(['ecs_compliant']),
            query: getQuery(id),
            alert_suppression: {
              group_by: ['host.name'],
              duration: {
                value: 300,
                unit: 'm',
              },
              missing_fields_strategy: 'suppress',
            },
            from: 'now-35m',
            interval: '30m',
            timestamp_override: 'event.ingested',
          };
          // 1 alert should be suppressed, based on event.ingested value of a document
          const { previewId } = await previewRule({
            supertest,
            rule,
            timeframeEnd: new Date('2020-10-28T06:30:00.000Z'),
            invocationCount: 2,
          });
          const previewAlerts = await getPreviewAlerts({
            es,
            previewId,
            sort: ['host.name', ALERT_ORIGINAL_TIME],
          });

          expect(previewAlerts).toHaveLength(1);
          expect(previewAlerts[0]._source).toEqual({
            ...previewAlerts[0]._source,
            [ALERT_SUPPRESSION_TERMS]: [
              {
                field: 'host.name',
                value: ['host-a'],
              },
            ],
            [ALERT_ORIGINAL_TIME]: firstTimestamp,
            [ALERT_SUPPRESSION_START]: firstTimestamp,
            [ALERT_SUPPRESSION_END]: secondTimestamp,
            [ALERT_SUPPRESSION_DOCS_COUNT]: 1,
          });
        });

        it('ignores duplicate alerts while suppressing new ones', async () => {
          const id = uuidv4();
          const firstTimestamp = '2020-10-28T05:45:00.000Z';
          const secondTimestamp = '2020-10-28T06:10:00.000Z';
          const doc1 = {
            id,
            '@timestamp': firstTimestamp,
            host: { name: 'host-a' },
          };

          const doc2 = {
            ...doc1,
            '@timestamp': secondTimestamp,
          };

          // 4 alert should be suppressed
          await indexListOfSourceDocuments([doc1, doc1, doc2, doc2, doc2]);

          const rule: EqlRuleCreateProps = {
            ...getEqlRuleForAlertTesting(['ecs_compliant']),
            query: getQuery(id),
            alert_suppression: {
              group_by: ['host.name'],
              duration: {
                value: 300,
                unit: 'm',
              },
              missing_fields_strategy: 'suppress',
            },
            // large look-back time covers all docs
            from: 'now-1h',
            interval: '30m',
          };

          const { previewId } = await previewRule({
            supertest,
            rule,
            timeframeEnd: new Date('2020-10-28T06:30:00.000Z'),
            invocationCount: 2,
          });
          const previewAlerts = await getPreviewAlerts({
            es,
            previewId,
            sort: ['host.name', ALERT_ORIGINAL_TIME],
          });
          expect(previewAlerts).toHaveLength(1);
          expect(previewAlerts[0]._source).toEqual({
            ...previewAlerts[0]._source,
            [ALERT_SUPPRESSION_TERMS]: [
              {
                field: 'host.name',
                value: ['host-a'],
              },
            ],
            [ALERT_ORIGINAL_TIME]: firstTimestamp,
            [ALERT_SUPPRESSION_START]: firstTimestamp,
            [ALERT_SUPPRESSION_END]: secondTimestamp,
            [ALERT_SUPPRESSION_DOCS_COUNT]: 4,
          });
        });

        it('suppress alerts with missing fields when rule is configured to do so', async () => {
          const id = uuidv4();
          const firstTimestamp = '2020-10-28T05:45:00.000Z';
          const secondTimestamp = '2020-10-28T06:10:00.000Z';
          const docWithMissingField1 = {
            id,
            '@timestamp': firstTimestamp,
            host: { name: 'host-a' },
          };

          const doc1 = {
            ...docWithMissingField1,
            agent: { name: 'agent-1' },
          };

          const docWithMissingField2 = {
            ...docWithMissingField1,
            '@timestamp': secondTimestamp,
          };

          const doc2 = {
            ...doc1,
            '@timestamp': secondTimestamp,
          };

          // 4 alert should be suppressed: 2 for agent.name: 'agent-1' and 2 for missing agent.name
          await indexListOfSourceDocuments([
            doc1,
            doc1,
            docWithMissingField1,
            docWithMissingField1,
            docWithMissingField2,
            doc2,
          ]);

          const rule: EqlRuleCreateProps = {
            ...getEqlRuleForAlertTesting(['ecs_compliant']),
            query: getQuery(id),
            alert_suppression: {
              group_by: ['agent.name'],
              duration: {
                value: 300,
                unit: 'm',
              },
              missing_fields_strategy: 'suppress',
            },
            from: 'now-35m',
            interval: '30m',
          };

          const { previewId } = await previewRule({
            supertest,
            rule,
            timeframeEnd: new Date('2020-10-28T06:30:00.000Z'),
            invocationCount: 2,
          });
          const previewAlerts = await getPreviewAlerts({
            es,
            previewId,
            sort: ['agent.name', ALERT_ORIGINAL_TIME],
          });
          expect(previewAlerts).toHaveLength(2);
          expect(previewAlerts[0]._source).toEqual({
            ...previewAlerts[0]._source,
            [ALERT_SUPPRESSION_TERMS]: [
              {
                field: 'agent.name',
                value: ['agent-1'],
              },
            ],
            [ALERT_ORIGINAL_TIME]: firstTimestamp,
            [ALERT_SUPPRESSION_START]: firstTimestamp,
            [ALERT_SUPPRESSION_END]: secondTimestamp,
            [ALERT_SUPPRESSION_DOCS_COUNT]: 2,
          });

          expect(previewAlerts[1]._source).toEqual({
            ...previewAlerts[1]._source,
            [ALERT_SUPPRESSION_TERMS]: [
              {
                field: 'agent.name',
                value: null,
              },
            ],
            [ALERT_ORIGINAL_TIME]: firstTimestamp,
            [ALERT_SUPPRESSION_START]: firstTimestamp,
            [ALERT_SUPPRESSION_END]: secondTimestamp,
            [ALERT_SUPPRESSION_DOCS_COUNT]: 2,
          });
        });

        it('does not suppress alerts with missing fields if configured as such', async () => {
          const id = uuidv4();
          const firstTimestamp = '2020-10-28T05:45:00.000Z';
          const secondTimestamp = '2020-10-28T06:10:00.000Z';
          const docWithMissingField1 = {
            id,
            '@timestamp': firstTimestamp,
            host: { name: 'host-a' },
          };

          const doc1 = {
            ...docWithMissingField1,
            agent: { name: 'agent-1' },
          };

          const docWithMissingField2 = {
            ...docWithMissingField1,
            '@timestamp': secondTimestamp,
          };

          const doc2 = {
            ...doc1,
            '@timestamp': secondTimestamp,
          };

          // 2 alert should be suppressed: 2 for agent.name: 'agent-1' and not any for missing agent.name
          await indexListOfSourceDocuments([
            doc1,
            doc1,
            docWithMissingField1,
            docWithMissingField1,
            docWithMissingField2,
            doc2,
          ]);

          const rule: EqlRuleCreateProps = {
            ...getEqlRuleForAlertTesting(['ecs_compliant']),
            query: getQuery(id),
            alert_suppression: {
              group_by: ['agent.name'],
              duration: {
                value: 300,
                unit: 'm',
              },
              missing_fields_strategy: 'doNotSuppress',
            },
            from: 'now-35m',
            interval: '30m',
          };

          const { previewId } = await previewRule({
            supertest,
            rule,
            timeframeEnd: new Date('2020-10-28T06:30:00.000Z'),
            invocationCount: 2,
          });
          const previewAlerts = await getPreviewAlerts({
            es,
            previewId,
            sort: ['agent.name', ALERT_ORIGINAL_TIME],
          });
          expect(previewAlerts).toHaveLength(4);
          expect(previewAlerts[0]._source).toEqual({
            ...previewAlerts[0]._source,
            [ALERT_SUPPRESSION_TERMS]: [
              {
                field: 'agent.name',
                value: ['agent-1'],
              },
            ],
            [ALERT_ORIGINAL_TIME]: firstTimestamp,
            [ALERT_SUPPRESSION_START]: firstTimestamp,
            [ALERT_SUPPRESSION_END]: secondTimestamp,
            [ALERT_SUPPRESSION_DOCS_COUNT]: 2,
          });

          // rest of alerts are not suppressed and do not have suppress properties
          previewAlerts.slice(1).forEach((previewAlert) => {
            const source = previewAlert._source;
            expect(source).toHaveProperty('id', id);
            expect(source).not.toHaveProperty(ALERT_SUPPRESSION_DOCS_COUNT);
            expect(source).not.toHaveProperty(ALERT_SUPPRESSION_END);
            expect(source).not.toHaveProperty(ALERT_SUPPRESSION_TERMS);
            expect(source).not.toHaveProperty(ALERT_SUPPRESSION_DOCS_COUNT);
          });
        });
      });

      describe('with "per rule execution" suppression duration', () => {
        it('only suppresses alerts within the rule execution', async () => {
          const id = uuidv4();
          const timestamp = '2020-10-28T06:45:00.000Z';
          const laterTimestamp = '2020-10-28T06:50:00.000Z';
          const doc1 = {
            id,
            '@timestamp': timestamp,
            host: { name: 'host-a' },
          };
          const doc1WithLaterTimestamp = {
            ...doc1,
            '@timestamp': laterTimestamp,
          };

          await indexListOfSourceDocuments([doc1, doc1WithLaterTimestamp, doc1]);

          const rule: EqlRuleCreateProps = {
            ...getEqlRuleForAlertTesting(['ecs_compliant']),
            query: getQuery(id),
            alert_suppression: {
              group_by: ['host.name'],
              missing_fields_strategy: 'suppress',
            },
            from: 'now-35m',
            interval: '30m',
          };

          const { previewId } = await previewRule({
            supertest,
            rule,
            timeframeEnd: new Date('2020-10-28T07:00:00.000Z'),
            invocationCount: 1,
          });
          const previewAlerts = await getPreviewAlerts({
            es,
            previewId,
            sort: [ALERT_ORIGINAL_TIME],
          });
          expect(previewAlerts).toHaveLength(1);
          expect(previewAlerts[0]._source).toEqual({
            ...previewAlerts[0]._source,
            [ALERT_SUPPRESSION_TERMS]: [
              {
                field: 'host.name',
                value: ['host-a'],
              },
            ],
            [TIMESTAMP]: '2020-10-28T07:00:00.000Z',
            [ALERT_LAST_DETECTED]: '2020-10-28T07:00:00.000Z',
            [ALERT_ORIGINAL_TIME]: timestamp,
            [ALERT_SUPPRESSION_START]: timestamp,
            [ALERT_SUPPRESSION_END]: laterTimestamp, // suppression ends with later timestamp
            [ALERT_SUPPRESSION_DOCS_COUNT]: 2,
          });
        });

        it('suppresses alerts on a field with array values', async () => {
          const id = uuidv4();
          const timestamp = '2020-10-28T06:45:00.000Z';
          const doc1 = {
            id,
            '@timestamp': timestamp,
            host: { name: ['host-a', 'host-b'] },
          };

          await indexListOfSourceDocuments([doc1, doc1, doc1]);
          const rule: EqlRuleCreateProps = {
            ...getEqlRuleForAlertTesting(['ecs_compliant']),
            query: getQuery(id),
            alert_suppression: {
              group_by: ['host.name'],
              missing_fields_strategy: 'suppress',
            },
            from: 'now-35m',
            interval: '30m',
          };

          const { previewId } = await previewRule({
            supertest,
            rule,
            timeframeEnd: new Date('2020-10-28T07:00:00.000Z'),
            invocationCount: 1,
          });
          const previewAlerts = await getPreviewAlerts({
            es,
            previewId,
            sort: [ALERT_ORIGINAL_TIME],
          });
          expect(previewAlerts).toHaveLength(1);
          expect(previewAlerts[0]._source).toEqual({
            ...previewAlerts[0]._source,
            [ALERT_SUPPRESSION_TERMS]: [
              {
                field: 'host.name',
                value: ['host-a', 'host-b'],
              },
            ],
            [TIMESTAMP]: '2020-10-28T07:00:00.000Z',
            [ALERT_LAST_DETECTED]: '2020-10-28T07:00:00.000Z',
            [ALERT_ORIGINAL_TIME]: timestamp,
            [ALERT_SUPPRESSION_START]: timestamp,
            [ALERT_SUPPRESSION_END]: timestamp,
            [ALERT_SUPPRESSION_DOCS_COUNT]: 2,
          });
        });

        it('suppresses alerts with missing fields', async () => {
          const id = uuidv4();
          const timestamp = '2020-10-28T06:45:00.000Z';
          const doc1 = {
            id,
            '@timestamp': timestamp,
            host: { name: 'host-a' },
          };

          const doc2 = {
            ...doc1,
            agent: { name: 'agent-1' },
          };

          // 2 alert should be suppressed: 1 doc and 1 doc2
          await indexListOfSourceDocuments([doc1, doc1, doc2, doc2]);
          const rule: EqlRuleCreateProps = {
            ...getEqlRuleForAlertTesting(['ecs_compliant']),
            query: getQuery(id),
            alert_suppression: {
              group_by: ['agent.name'],
              missing_fields_strategy: 'suppress',
            },
            from: 'now-35m',
            interval: '30m',
          };

          const { previewId } = await previewRule({
            supertest,
            rule,
            timeframeEnd: new Date('2020-10-28T07:00:00.000Z'),
            invocationCount: 1,
          });
          const previewAlerts = await getPreviewAlerts({
            es,
            previewId,
            sort: ['agent.name', ALERT_ORIGINAL_TIME],
          });
          expect(previewAlerts).toHaveLength(2);
          expect(previewAlerts[0]._source).toEqual({
            ...previewAlerts[0]._source,
            [ALERT_SUPPRESSION_TERMS]: [
              {
                field: 'agent.name',
                value: ['agent-1'],
              },
            ],
            [TIMESTAMP]: '2020-10-28T07:00:00.000Z',
            [ALERT_LAST_DETECTED]: '2020-10-28T07:00:00.000Z',
            [ALERT_ORIGINAL_TIME]: timestamp,
            [ALERT_SUPPRESSION_START]: timestamp,
            [ALERT_SUPPRESSION_END]: timestamp,
            [ALERT_SUPPRESSION_DOCS_COUNT]: 1,
          });

          expect(previewAlerts[1]._source).toEqual({
            ...previewAlerts[1]._source,
            [ALERT_SUPPRESSION_TERMS]: [
              {
                field: 'agent.name',
                value: null,
              },
            ],
            [TIMESTAMP]: '2020-10-28T07:00:00.000Z',
            [ALERT_LAST_DETECTED]: '2020-10-28T07:00:00.000Z',
            [ALERT_ORIGINAL_TIME]: timestamp,
            [ALERT_SUPPRESSION_START]: timestamp,
            [ALERT_SUPPRESSION_END]: timestamp,
            [ALERT_SUPPRESSION_DOCS_COUNT]: 1,
          });
        });

        it('suppresses alerts with missing fields and multiple suppress by fields', async () => {
          const id = uuidv4();
          const timestamp = '2020-10-28T06:45:00.000Z';
          const noMissingFieldsDoc = {
            id,
            '@timestamp': timestamp,
            host: { name: 'host-a' },
            agent: { name: 'agent-a', version: 10 },
          };

          const missingNameFieldsDoc = {
            ...noMissingFieldsDoc,
            agent: { version: 10 },
          };

          const missingVersionFieldsDoc = {
            ...noMissingFieldsDoc,
            agent: { name: 'agent-a' },
          };

          const missingAgentFieldsDoc = {
            ...noMissingFieldsDoc,
            agent: undefined,
          };

          // 4 alerts should be suppressed: 1 for each pair of documents
          await indexListOfSourceDocuments([
            noMissingFieldsDoc,
            noMissingFieldsDoc,
            missingNameFieldsDoc,
            missingNameFieldsDoc,
            missingVersionFieldsDoc,
            missingVersionFieldsDoc,
            missingAgentFieldsDoc,
            missingAgentFieldsDoc,
          ]);

          const rule: EqlRuleCreateProps = {
            ...getEqlRuleForAlertTesting(['ecs_compliant']),
            query: getQuery(id),
            alert_suppression: {
              group_by: ['agent.name', 'agent.version'],
              missing_fields_strategy: 'suppress',
            },
            from: 'now-35m',
            interval: '30m',
          };

          const { previewId } = await previewRule({
            supertest,
            rule,
            timeframeEnd: new Date('2020-10-28T07:00:00.000Z'),
            invocationCount: 1,
          });
          const previewAlerts = await getPreviewAlerts({
            es,
            previewId,
            sort: ['agent.name', 'agent.version', ALERT_ORIGINAL_TIME],
          });
          expect(previewAlerts).toHaveLength(4);
          expect(previewAlerts[0]._source).toEqual({
            ...previewAlerts[0]._source,
            [ALERT_SUPPRESSION_TERMS]: [
              {
                field: 'agent.name',
                value: ['agent-a'],
              },
              {
                field: 'agent.version',
                value: ['10'],
              },
            ],
            [ALERT_SUPPRESSION_DOCS_COUNT]: 1,
          });

          expect(previewAlerts[1]._source).toEqual({
            ...previewAlerts[1]._source,
            [ALERT_SUPPRESSION_TERMS]: [
              {
                field: 'agent.name',
                value: ['agent-a'],
              },
              {
                field: 'agent.version',
                value: null,
              },
            ],
            [ALERT_SUPPRESSION_DOCS_COUNT]: 1,
          });

          expect(previewAlerts[2]._source).toEqual({
            ...previewAlerts[2]._source,
            [ALERT_SUPPRESSION_TERMS]: [
              {
                field: 'agent.name',
                value: null,
              },
              {
                field: 'agent.version',
                value: ['10'],
              },
            ],
            [ALERT_SUPPRESSION_DOCS_COUNT]: 1,
          });

          expect(previewAlerts[3]._source).toEqual({
            ...previewAlerts[3]._source,
            [ALERT_SUPPRESSION_TERMS]: [
              {
                field: 'agent.name',
                value: null,
              },
              {
                field: 'agent.version',
                value: null,
              },
            ],
            [ALERT_SUPPRESSION_DOCS_COUNT]: 1,
          });
        });

        it('does not suppress alerts with missing fields if configured as such', async () => {
          const id = uuidv4();
          const timestamp = '2020-10-28T06:45:00.000Z';
          const doc1 = {
            id,
            '@timestamp': timestamp,
            host: { name: 'host-a' },
          };

          const doc2 = {
            ...doc1,
            agent: { name: 'agent-1' },
          };

          // 1 alert should be suppressed: 1 doc only
          await indexListOfSourceDocuments([doc1, doc1, doc2, doc2]);
          const rule: EqlRuleCreateProps = {
            ...getEqlRuleForAlertTesting(['ecs_compliant']),
            query: getQuery(id),
            alert_suppression: {
              group_by: ['agent.name'],
              missing_fields_strategy: 'doNotSuppress',
            },
            from: 'now-35m',
            interval: '30m',
          };

          const { previewId } = await previewRule({
            supertest,
            rule,
            timeframeEnd: new Date('2020-10-28T07:00:00.000Z'),
            invocationCount: 1,
          });
          const previewAlerts = await getPreviewAlerts({
            es,
            previewId,
            sort: ['agent.name', ALERT_ORIGINAL_TIME],
          });
          expect(previewAlerts).toHaveLength(3);
          expect(previewAlerts[0]._source).toEqual({
            ...previewAlerts[0]._source,
            [ALERT_SUPPRESSION_TERMS]: [
              {
                field: 'agent.name',
                value: ['agent-1'],
              },
            ],
            [TIMESTAMP]: '2020-10-28T07:00:00.000Z',
            [ALERT_LAST_DETECTED]: '2020-10-28T07:00:00.000Z',
            [ALERT_ORIGINAL_TIME]: timestamp,
            [ALERT_SUPPRESSION_START]: timestamp,
            [ALERT_SUPPRESSION_END]: timestamp,
            [ALERT_SUPPRESSION_DOCS_COUNT]: 1,
          });

          // rest of alerts are not suppressed and do not have suppress properties
          previewAlerts.slice(1).forEach((previewAlert) => {
            const source = previewAlert._source;
            expect(source).toHaveProperty('id', id);
            expect(source).not.toHaveProperty(ALERT_SUPPRESSION_DOCS_COUNT);
            expect(source).not.toHaveProperty(ALERT_SUPPRESSION_END);
            expect(source).not.toHaveProperty(ALERT_SUPPRESSION_TERMS);
            expect(source).not.toHaveProperty(ALERT_SUPPRESSION_DOCS_COUNT);
          });
        });

        it('does not suppress alerts with missing fields and multiple suppress by fields if configured as such', async () => {
          const id = uuidv4();
          const timestamp = '2020-10-28T06:45:00.000Z';
          const noMissingFieldsDoc = {
            id,
            '@timestamp': timestamp,
            host: { name: 'host-a' },
            agent: { name: 'agent-a', version: 10 },
          };

          const missingNameFieldsDoc = {
            ...noMissingFieldsDoc,
            agent: { version: 10 },
          };

          const missingVersionFieldsDoc = {
            ...noMissingFieldsDoc,
            agent: { name: 'agent-a' },
          };

          const missingAgentFieldsDoc = {
            ...noMissingFieldsDoc,
            agent: undefined,
          };

          // 1 alert should be suppressed: 1 doc only
          await indexListOfSourceDocuments([
            noMissingFieldsDoc,
            noMissingFieldsDoc,
            missingNameFieldsDoc,
            missingNameFieldsDoc,
            missingVersionFieldsDoc,
            missingVersionFieldsDoc,
            missingAgentFieldsDoc,
          ]);

          const rule: EqlRuleCreateProps = {
            ...getEqlRuleForAlertTesting(['ecs_compliant']),
            query: getQuery(id),
            alert_suppression: {
              group_by: ['agent.name', 'agent.version'],

              missing_fields_strategy: 'doNotSuppress',
            },
            from: 'now-35m',
            interval: '30m',
          };

          const { previewId } = await previewRule({
            supertest,
            rule,
            timeframeEnd: new Date('2020-10-28T07:00:00.000Z'),
            invocationCount: 1,
          });
          const previewAlerts = await getPreviewAlerts({
            es,
            previewId,
            sort: ['agent.name', 'agent.version', ALERT_ORIGINAL_TIME],
          });
          // from 7 injected, only one should be suppressed
          expect(previewAlerts).toHaveLength(6);
          expect(previewAlerts[0]._source).toEqual({
            ...previewAlerts[0]._source,
            [ALERT_SUPPRESSION_TERMS]: [
              {
                field: 'agent.name',
                value: ['agent-a'],
              },
              {
                field: 'agent.version',
                value: ['10'],
              },
            ],
            [ALERT_SUPPRESSION_DOCS_COUNT]: 1,
          });

          // rest of alerts are not suppressed and do not have suppress properties
          previewAlerts.slice(1).forEach((previewAlert) => {
            const source = previewAlert._source;
            expect(source).toHaveProperty('id', id);
            expect(source).not.toHaveProperty(ALERT_SUPPRESSION_DOCS_COUNT);
            expect(source).not.toHaveProperty(ALERT_SUPPRESSION_END);
            expect(source).not.toHaveProperty(ALERT_SUPPRESSION_TERMS);
            expect(source).not.toHaveProperty(ALERT_SUPPRESSION_DOCS_COUNT);
          });
        });

        it('deduplicates multiple alerts while suppressing on rule interval only', async () => {
          const id = uuidv4();
          const firstTimestamp = '2020-10-28T05:45:00.000Z';
          const secondTimestamp = '2020-10-28T06:10:00.000Z';
          const doc1 = {
            id,
            '@timestamp': firstTimestamp,
            host: { name: 'host-a' },
          };

          const doc2 = {
            ...doc1,
            '@timestamp': secondTimestamp,
          };

          // 4 alert should be suppressed
          await indexListOfSourceDocuments([doc1, doc1, doc2, doc2, doc2]);

          const rule: EqlRuleCreateProps = {
            ...getEqlRuleForAlertTesting(['ecs_compliant']),
            query: getQuery(id),
            alert_suppression: {
              group_by: ['host.name'],
              missing_fields_strategy: 'suppress',
            },
            // large look-back time covers all docs
            from: 'now-50m',
            interval: '30m',
          };

          const { previewId } = await previewRule({
            supertest,
            rule,
            timeframeEnd: new Date('2020-10-28T06:30:00.000Z'),
            invocationCount: 2,
          });
          const previewAlerts = await getPreviewAlerts({
            es,
            previewId,
            sort: ['host.name', ALERT_ORIGINAL_TIME],
          });
          expect(previewAlerts).toHaveLength(2);
          expect(previewAlerts[0]._source).toEqual({
            ...previewAlerts[0]._source,
            [ALERT_SUPPRESSION_TERMS]: [
              {
                field: 'host.name',
                value: ['host-a'],
              },
            ],
            [ALERT_ORIGINAL_TIME]: firstTimestamp,
            [ALERT_SUPPRESSION_START]: firstTimestamp,
            [ALERT_SUPPRESSION_END]: firstTimestamp,
            [ALERT_SUPPRESSION_DOCS_COUNT]: 1,
          });

          expect(previewAlerts[1]._source).toEqual({
            ...previewAlerts[1]._source,
            [ALERT_SUPPRESSION_TERMS]: [
              {
                field: 'host.name',
                value: ['host-a'],
              },
            ],
            [ALERT_ORIGINAL_TIME]: secondTimestamp,
            [ALERT_SUPPRESSION_START]: secondTimestamp,
            [ALERT_SUPPRESSION_END]: secondTimestamp,
            [ALERT_SUPPRESSION_DOCS_COUNT]: 2,
          });
        });

        it('deduplicates a single alert while suppressing new ones', async () => {
          const id = uuidv4();
          const firstTimestamp = '2020-10-28T05:45:00.000Z';
          const secondTimestamp = '2020-10-28T06:10:00.000Z';
          const doc1 = {
            id,
            '@timestamp': firstTimestamp,
            host: { name: 'host-a' },
          };

          const doc2 = {
            ...doc1,
            '@timestamp': secondTimestamp,
          };

          // 3 alerts should be suppressed
          await indexListOfSourceDocuments([doc1, doc2, doc2, doc2]);

          const rule: EqlRuleCreateProps = {
            ...getEqlRuleForAlertTesting(['ecs_compliant']),
            query: getQuery(id),
            alert_suppression: {
              group_by: ['host.name'],
              missing_fields_strategy: 'suppress',
            },
            // large look-back time covers all docs
            from: 'now-1h',
            interval: '30m',
          };

          const { previewId } = await previewRule({
            supertest,
            rule,
            timeframeEnd: new Date('2020-10-28T06:30:00.000Z'),
            invocationCount: 2,
          });
          const previewAlerts = await getPreviewAlerts({
            es,
            previewId,
            sort: ['host.name', ALERT_ORIGINAL_TIME],
          });
          expect(previewAlerts).toHaveLength(2);
          expect(previewAlerts[0]._source).toEqual({
            ...previewAlerts[0]._source,
            [ALERT_SUPPRESSION_TERMS]: [
              {
                field: 'host.name',
                value: ['host-a'],
              },
            ],
            [ALERT_ORIGINAL_TIME]: firstTimestamp,
            [ALERT_SUPPRESSION_START]: firstTimestamp,
            [ALERT_SUPPRESSION_END]: firstTimestamp,
            [ALERT_SUPPRESSION_DOCS_COUNT]: 0,
          });
          expect(previewAlerts[1]._source).toEqual({
            ...previewAlerts[1]._source,
            [ALERT_SUPPRESSION_TERMS]: [
              {
                field: 'host.name',
                value: ['host-a'],
              },
            ],
            [ALERT_ORIGINAL_TIME]: secondTimestamp,
            [ALERT_SUPPRESSION_START]: secondTimestamp,
            [ALERT_SUPPRESSION_END]: secondTimestamp,
            [ALERT_SUPPRESSION_DOCS_COUNT]: 2,
          });
        });

        it('creates and suppresses an alert into alert created on previous execution', async () => {
          const id = uuidv4();
          const firstTimestamp = '2020-10-28T05:45:00.000Z';
          const secondTimestamp = '2020-10-28T06:10:00.000Z';
          const doc1 = {
            id,
            '@timestamp': firstTimestamp,
            host: { name: 'host-a' },
          };

          const doc2 = {
            ...doc1,
            '@timestamp': secondTimestamp,
          };

          // 1 created + 1 suppressed on first run
          // 1 created + 2 suppressed on second run
          await indexListOfSourceDocuments([doc1, doc1, doc2, doc2, doc2]);

          const rule: EqlRuleCreateProps = {
            ...getEqlRuleForAlertTesting(['ecs_compliant']),
            query: getQuery(id),
            alert_suppression: {
              group_by: ['host.name'],
              missing_fields_strategy: 'suppress',
            },
            from: 'now-35m',
            interval: '30m',
          };

          const { previewId } = await previewRule({
            supertest,
            rule,
            timeframeEnd: new Date('2020-10-28T06:30:00.000Z'),
            invocationCount: 2,
          });
          const previewAlerts = await getPreviewAlerts({
            es,
            previewId,
            sort: ['host.name', ALERT_ORIGINAL_TIME],
          });
          expect(previewAlerts).toHaveLength(2);
          expect(previewAlerts[0]._source).toEqual({
            ...previewAlerts[0]._source,
            [ALERT_SUPPRESSION_TERMS]: [
              {
                field: 'host.name',
                value: ['host-a'],
              },
            ],
            [ALERT_ORIGINAL_TIME]: firstTimestamp,
            [ALERT_SUPPRESSION_START]: firstTimestamp,
            [ALERT_SUPPRESSION_END]: firstTimestamp,
            [ALERT_SUPPRESSION_DOCS_COUNT]: 1,
          });
          expect(previewAlerts[1]._source).toEqual({
            ...previewAlerts[1]._source,
            [ALERT_SUPPRESSION_TERMS]: [
              {
                field: 'host.name',
                value: ['host-a'],
              },
            ],
            [ALERT_ORIGINAL_TIME]: secondTimestamp,
            [ALERT_SUPPRESSION_START]: secondTimestamp,
            [ALERT_SUPPRESSION_END]: secondTimestamp,
            [ALERT_SUPPRESSION_DOCS_COUNT]: 2,
          });
        });
      });

      // Given that EQL rules have a maximum size for querying documents up to 100,
      // even increasing the suppressed alerts limit by five times
      // the suppression max signals won't have an effect
      it('does not suppress more than the EQL query size limit of 100', async () => {
        const id = uuidv4();

        await indexGeneratedSourceDocuments({
          docsCount: 150, // the eql query max size is 100
          seed: (index) => ({
            id,
            '@timestamp': `2020-10-28T06:50:00.${index}Z`,
            host: {
              name: `host-a`,
            },
            agent: { name: 'agent-a' },
          }),
        });

        const rule: EqlRuleCreateProps = {
          ...getEqlRuleForAlertTesting(['ecs_compliant']),
          query: getQuery(id),
          alert_suppression: {
            group_by: ['agent.name'],
            missing_fields_strategy: 'suppress',
          },
          from: 'now-35m',
          interval: '30m',
        };

        const { previewId, logs } = await previewRule({
          supertest,
          rule,
          timeframeEnd: new Date('2020-10-28T07:00:00.000Z'),
          invocationCount: 1,
        });

        expect(logs[0].warnings).toEqual(
          expect.arrayContaining([getSuppressionMaxAlertsWarning()])
        );

        const previewAlerts = await getPreviewAlerts({
          es,
          previewId,
          sort: ['agent.name', ALERT_ORIGINAL_TIME],
        });
        expect(previewAlerts).toHaveLength(1);
        expect(previewAlerts[0]._source).toEqual({
          ...previewAlerts[0]._source,
          [ALERT_SUPPRESSION_TERMS]: [
            {
              field: 'agent.name',
              value: ['agent-a'],
            },
          ],
          [ALERT_SUPPRESSION_DOCS_COUNT]: 99,
        });
      });

      it('generates up to max_signals alerts', async () => {
        const id = uuidv4();
        const firstTimestamp = '2020-10-28T06:05:00.000Z';
        const secondTimestamp = '2020-10-28T06:10:00.000Z';
        await Promise.all(
          [firstTimestamp, secondTimestamp].map((t) =>
            indexGeneratedSourceDocuments({
              docsCount: 115,
              seed: (index) => ({
                id,
                '@timestamp': t,
                host: {
                  name: `host-a`,
                },
                'agent.name': `agent-${index}`,
              }),
            })
          )
        );

        const rule: EqlRuleCreateProps = {
          ...getEqlRuleForAlertTesting(['ecs_compliant']),
          query: getQuery(id),
          alert_suppression: {
            group_by: ['agent.name'],
            duration: {
              value: 300,
              unit: 'm',
            },
            missing_fields_strategy: 'suppress',
          },
          from: 'now-35m',
          interval: '30m',
        };

        const { previewId, logs } = await previewRule({
          supertest,
          rule,
          timeframeEnd: new Date('2020-10-28T06:30:00.000Z'),
          invocationCount: 1,
        });

        expect(logs[0].warnings).toEqual(
          expect.arrayContaining([getSuppressionMaxAlertsWarning()])
        );

        const previewAlerts = await getPreviewAlerts({
          es,
          previewId,
          size: 1000,
          sort: ['agent.name', ALERT_ORIGINAL_TIME],
        });
        expect(previewAlerts).toHaveLength(100);
      });

      it('adds execution values to rule execution state', async () => {
        const eventId = uuidv4();
        await indexGeneratedSourceDocuments({
          docsCount: 10,
          seed: (_index, _id, timestamp) => ({
            id: eventId,
            '@timestamp': timestamp,
            agent: { name: 'group_me' },
          }),
        });

        const ruleParams: EqlRuleCreateProps = {
          ...getEqlRuleForAlertTesting(['ecs_compliant']),
          query: getQuery(eventId),
          alert_suppression: {
            group_by: ['agent.name'],
            duration: {
              value: 300,
              unit: 'm',
            },
            missing_fields_strategy: 'suppress',
          },
          from: 'now-35m',
        };

        const { id } = await createRule(supertest, log, ruleParams);
        await waitForRuleSuccess({ supertest, log, id });
        const rule = await fetchRule(supertest, { id });

        const lastExecution = rule?.execution_summary?.last_execution!;
        expect(lastExecution.status).toEqual('succeeded');
        expect(lastExecution.metrics).toEqual(
          expect.objectContaining({
            total_indexing_duration_ms: expect.any(Number),
            total_search_duration_ms: expect.any(Number),
          })
        );
      });

      describe('with exceptions', () => {
        beforeEach(async () => {
          await deleteAllExceptions(supertest, log);
        });

        it('applies exceptions to what would otherwise be suppressed alerts', async () => {
          const id = uuidv4();
          const timestamp = '2020-10-28T06:45:00.000Z';
          const laterTimestamp = '2020-10-28T06:50:00.000Z';

          const firstExecutionDocuments = [
            {
              host: { name: 'host-a', ip: '127.0.0.3' },
              id,
              '@timestamp': timestamp,
            },
            {
              host: { name: 'host-a', ip: '127.0.0.4' },
              id,
              '@timestamp': timestamp,
            },
            {
              host: { name: 'host-a', ip: '127.0.0.5' },
              id,
              '@timestamp': laterTimestamp,
            },
          ];

          await indexListOfSourceDocuments([...firstExecutionDocuments]);

          const rule: EqlRuleCreateProps = {
            ...getEqlRuleForAlertTesting(['ecs_compliant']),
            query: getQuery(id),
            alert_suppression: {
              group_by: ['host.name'],
              missing_fields_strategy: 'suppress',
            },
            from: 'now-35m',
            interval: '30m',
          };

          const { previewId } = await previewRuleWithExceptionEntries({
            supertest,
            rule,
            log,
            timeframeEnd: new Date('2020-10-28T07:00:00.000Z'),
            entries: [
              [
                {
                  field: 'host.ip',
                  operator: 'included',
                  type: 'match',
                  value: '127.0.0.4',
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
          expect(previewAlerts[0]._source).toEqual({
            ...previewAlerts[0]._source,
            [ALERT_SUPPRESSION_TERMS]: [
              {
                field: 'host.name',
                value: ['host-a'],
              },
            ],
            [TIMESTAMP]: '2020-10-28T07:00:00.000Z',
            [ALERT_LAST_DETECTED]: '2020-10-28T07:00:00.000Z',
            [ALERT_ORIGINAL_TIME]: timestamp,
            [ALERT_SUPPRESSION_START]: timestamp,
            [ALERT_SUPPRESSION_END]: laterTimestamp, // suppression ends with later timestamp
            [ALERT_SUPPRESSION_DOCS_COUNT]: 1, // one of the three events was excluded by the exception
          });
        });
      });

      describe('alert enrichment', () => {
        before(async () => {
          await entityStoreV2.setup({
            hosts: [
              {
                host: { name: 'suricata-zeek-sensor-toronto' },
                entity: {
                  id: 'host:suricata-zeek-sensor-toronto',
                  type: 'host',
                  risk: { calculated_level: 'Critical', calculated_score_norm: 96 },
                },
              },
              {
                host: { name: 'zeek-newyork-sha-aa8df15' },
                entity: { id: 'host:zeek-newyork-sha-aa8df15', type: 'host' },
                asset: { criticality: 'medium_impact' },
              },
            ],
          });
        });

        after(async () => {
          await entityStoreV2.teardown();
        });

        it('suppressed alerts are enriched with host risk score', async () => {
          const eventId = uuidv4();
          await indexGeneratedSourceDocuments({
            docsCount: 1,
            seed: (_index, _id, timestamp) => ({
              id: eventId,
              '@timestamp': timestamp,
              host: { name: 'suricata-zeek-sensor-toronto' },
            }),
          });

          const rule: EqlRuleCreateProps = {
            ...getEqlRuleForAlertTesting(['ecs_compliant']),
            query: getQuery(eventId),
            alert_suppression: {
              group_by: ['host.name'],
              missing_fields_strategy: 'suppress',
            },
            from: 'now-35m',
            to: 'now',
          };

          const { previewId } = await previewRule({ supertest, rule });
          const previewAlerts = await getPreviewAlerts({ es, previewId });

          expect(previewAlerts[0]?._source?.host?.risk?.calculated_level).toBe('Critical');
          expect(previewAlerts[0]?._source?.host?.risk?.calculated_score_norm).toBe(96);
        });

        it('suppressed alerts are enriched with criticality_level', async () => {
          const id = uuidv4();
          const timestamp = '2020-10-28T06:45:00.000Z';

          const firstExecutionDocuments = [
            {
              host: { name: 'zeek-newyork-sha-aa8df15', ip: '127.0.0.5' },
              id,
              '@timestamp': timestamp,
            },
          ];

          await indexListOfSourceDocuments([...firstExecutionDocuments]);

          const rule: EqlRuleCreateProps = {
            ...getEqlRuleForAlertTesting(['ecs_compliant']),
            query: getQuery(id),
            alert_suppression: {
              group_by: ['host.name'],
              missing_fields_strategy: 'suppress',
            },
            from: 'now-35m',
            interval: '30m',
          };

          const { previewId } = await previewRule({
            supertest,
            rule,
            timeframeEnd: new Date('2020-10-28T07:00:00.000Z'),
          });
          const previewAlerts = await getPreviewAlerts({ es, previewId });
          const fullAlert = previewAlerts[0]._source;

          expect(fullAlert?.['host.asset.criticality']).toBe('medium_impact');
        });
      });
    });

    describe('sequence queries with suppression "per rule execution"', () => {
      it('suppresses alerts in a given rule execution', async () => {
        const id = uuidv4();
        const timestamp = '2020-10-28T06:50:00.000Z';
        const laterTimestamp = '2020-10-28T06:51:00.000Z';
        const laterTimestamp2 = '2020-10-28T06:53:00.000Z';
        const doc1 = {
          id,
          '@timestamp': timestamp,
          host: { name: 'host-a' },
        };
        const doc1WithLaterTimestamp = {
          ...doc1,
          '@timestamp': laterTimestamp,
        };

        const doc2WithLaterTimestamp = {
          ...doc1,
          '@timestamp': laterTimestamp2,
        };

        // sequence alert 1 is made up of doc1 and doc1WithLaterTimestamp,
        // sequence alert 2 is made up of doc1WithLaterTimestamp and doc2WithLaterTimestamp
        // sequence alert 2 is suppressed because it shares the same
        // host.name value as sequence alert 1

        await indexListOfSourceDocuments([doc1, doc1WithLaterTimestamp, doc2WithLaterTimestamp]);

        const rule: EqlRuleCreateProps = {
          ...getEqlRuleForAlertTesting(['ecs_compliant']),
          query: getSequenceQuery(id),
          alert_suppression: {
            group_by: ['host.name'],
            missing_fields_strategy: 'suppress',
          },
          from: 'now-35m',
          interval: '30m',
        };

        const { previewId } = await previewRule({
          supertest,
          rule,
          timeframeEnd: new Date('2020-10-28T07:00:00.000Z'),
          invocationCount: 1,
        });
        const previewAlerts = await getPreviewAlerts({
          es,
          previewId,
          sort: [ALERT_ORIGINAL_TIME],
        });
        // we expect one created alert and one suppressed alert
        // and two building block alerts, let's confirm that
        expect(previewAlerts).toHaveLength(3);
        const [sequenceAlert, buildingBlockAlerts] = partitionSequenceBuildingBlocks(previewAlerts);
        expect(buildingBlockAlerts).toHaveLength(2);
        expect(sequenceAlert).toHaveLength(1);

        expect(sequenceAlert[0]?._source).toEqual({
          ...sequenceAlert[0]?._source,
          [ALERT_SUPPRESSION_TERMS]: [
            {
              field: 'host.name',
              value: 'host-a',
            },
          ],
          [TIMESTAMP]: '2020-10-28T07:00:00.000Z',
          [ALERT_LAST_DETECTED]: '2020-10-28T07:00:00.000Z',
          [ALERT_SUPPRESSION_DOCS_COUNT]: 1,
        });
      });

      it('suppresses alerts when the rule is a building block type rule', async () => {
        const id = uuidv4();
        const timestamp = '2020-10-28T06:50:00.000Z';
        const laterTimestamp = '2020-10-28T06:51:00.000Z';
        const laterTimestamp2 = '2020-10-28T06:53:00.000Z';
        const doc1 = {
          id,
          '@timestamp': timestamp,
          host: { name: 'host-a' },
        };
        const doc1WithLaterTimestamp = {
          ...doc1,
          '@timestamp': laterTimestamp,
        };

        const doc2WithLaterTimestamp = {
          ...doc1,
          '@timestamp': laterTimestamp2,
        };

        // sequence alert 1 is made up of doc1 and doc1WithLaterTimestamp,
        // sequence alert 2 is made up of doc1WithLaterTimestamp and doc2WithLaterTimestamp
        // sequence alert 2 is suppressed because it shares the same
        // host.name value as sequence alert 1

        await indexListOfSourceDocuments([doc1, doc1WithLaterTimestamp, doc2WithLaterTimestamp]);

        const buildingBlockRuleType: EqlRuleCreateProps = {
          ...getEqlRuleForAlertTesting(['ecs_compliant']),
          building_block_type: 'default',
          query: getSequenceQuery(id),
          alert_suppression: {
            group_by: ['host.name'],
            missing_fields_strategy: 'suppress',
          },
          from: 'now-35m',
          interval: '30m',
        };

        const { previewId } = await previewRule({
          supertest,
          rule: buildingBlockRuleType,
          timeframeEnd: new Date('2020-10-28T07:00:00.000Z'),
          invocationCount: 1,
        });
        const previewAlerts = await getPreviewAlerts({
          es,
          previewId,
          sort: [ALERT_ORIGINAL_TIME],
        });
        // we expect one created alert and one suppressed alert
        // and two building block alerts, let's confirm that
        expect(previewAlerts).toHaveLength(3);
        const [sequenceAlert, buildingBlockAlerts] = partition(
          previewAlerts,
          (alert) => alert?._source?.[ALERT_SUPPRESSION_DOCS_COUNT] != null
        );
        expect(buildingBlockAlerts).toHaveLength(2);
        expect(sequenceAlert).toHaveLength(1);

        expect(sequenceAlert[0]?._source).toEqual({
          ...sequenceAlert[0]?._source,
          [ALERT_SUPPRESSION_TERMS]: [
            {
              field: 'host.name',
              value: 'host-a',
            },
          ],
          [TIMESTAMP]: '2020-10-28T07:00:00.000Z',
          [ALERT_LAST_DETECTED]: '2020-10-28T07:00:00.000Z',
          [ALERT_SUPPRESSION_DOCS_COUNT]: 1,
        });
      });

      it('suppresses alerts in a given rule execution when a subsequent event for a sequence has the suppression field undefined', async () => {
        const id = uuidv4();
        const timestamp = '2020-10-28T06:50:00.000Z';
        const laterTimestamp = '2020-10-28T06:51:00.000Z';
        const laterTimestamp2 = '2020-10-28T06:53:00.000Z';
        const doc1 = {
          id,
          '@timestamp': timestamp,
          host: { name: 'host-a' },
        };
        const doc1WithLaterTimestamp = {
          ...doc1,
          '@timestamp': laterTimestamp,
        };

        const doc2WithNoHost = {
          ...doc1,
          '@timestamp': laterTimestamp2,
          host: undefined,
        };

        // sequence alert 1 will be doc1 and doc1WithLaterTimestamp
        // sequence alert 2 will be doc1WithLaterTimestamp and doc2WithNoHost
        // the second sequence alert will have null as the value for
        // suppression field host.name because of logic defined in the
        // objectPairIntersection function defined in
        // x-pack/solutions/security/plugins/security_solution/server/lib/detection_engine/rule_types/eql/build_alert_group_from_sequence.ts

        await indexListOfSourceDocuments([
          doc1,
          doc1WithLaterTimestamp,
          doc2WithNoHost,
          { ...doc2WithNoHost, '@timestamp': '2020-10-28T06:53:01.000Z' },
        ]);

        const rule: EqlRuleCreateProps = {
          ...getEqlRuleForAlertTesting(['ecs_compliant']),
          query: getSequenceQuery(id),
          alert_suppression: {
            group_by: ['host.name'],
            missing_fields_strategy: 'suppress',
          },
          from: 'now-35m',
          interval: '30m',
        };

        const { previewId } = await previewRule({
          supertest,
          rule,
          timeframeEnd: new Date('2020-10-28T07:00:00.000Z'),
          invocationCount: 1,
        });
        const previewAlerts = await getPreviewAlerts({
          es,
          previewId,
          sort: [ALERT_ORIGINAL_TIME],
        });
        // we expect two sequence alerts
        // each sequence alert having two building block alerts
        expect(previewAlerts).toHaveLength(6);
        const [sequenceAlerts, buildingBlockAlerts] =
          partitionSequenceBuildingBlocks(previewAlerts);
        expect(buildingBlockAlerts).toHaveLength(4);
        expect(sequenceAlerts).toHaveLength(2);

        expect(sequenceAlerts[0]?._source).toEqual({
          ...sequenceAlerts[0]?._source,
          [ALERT_SUPPRESSION_TERMS]: [
            {
              field: 'host.name',
              value: 'host-a',
            },
          ],
          [TIMESTAMP]: '2020-10-28T07:00:00.000Z',
          [ALERT_LAST_DETECTED]: '2020-10-28T07:00:00.000Z',
          [ALERT_SUPPRESSION_DOCS_COUNT]: 0,
        });
        expect(sequenceAlerts[1]?._source).toEqual({
          ...sequenceAlerts[1]?._source,
          [ALERT_SUPPRESSION_TERMS]: [
            {
              field: 'host.name',
              value: null,
            },
          ],
          [TIMESTAMP]: '2020-10-28T07:00:00.000Z',
          [ALERT_LAST_DETECTED]: '2020-10-28T07:00:00.000Z',
          [ALERT_SUPPRESSION_DOCS_COUNT]: 1,
        });
      });

      it('does not suppress alerts in a given rule execution when doNotSuppress is set and more than one sequence has the suppression field undefined', async () => {
        const id = uuidv4();
        const timestamp = '2020-10-28T06:50:00.000Z';
        const laterTimestamp = '2020-10-28T06:51:00.000Z';
        const laterTimestamp2 = '2020-10-28T06:53:00.000Z';
        const laterTimestamp3 = '2020-10-28T06:53:01.000Z';

        const doc1 = {
          id,
          '@timestamp': timestamp,
          host: { name: 'host-a' },
        };
        const doc1WithLaterTimestamp = {
          ...doc1,
          '@timestamp': laterTimestamp,
        };

        const doc2WithNoHost = {
          ...doc1,
          '@timestamp': laterTimestamp2,
          host: undefined,
        };

        const doc3WithNoHost = {
          ...doc1,
          '@timestamp': laterTimestamp3,
          host: undefined,
        };

        // this should generate three sequence alerts
        // sequence alert 1 will be doc1 and doc1WithLaterTimestamp
        // sequence alert 2 will be doc1WithLaterTimestamp and doc2WithNoHost
        // sequence alert 3 will be doc2WithNoHost and doc3WithNoHost
        // This logic is defined in objectPairIntersection
        // x-pack/solutions/security/plugins/security_solution/server/lib/detection_engine/rule_types/eql/build_alert_group_from_sequence.ts
        // Any sequence comprised of events where one field contains a value, followed by any number of
        // events in the sequence where the value is null or undefined will have that field
        // stripped from the sequence alert. So given that, we expect three alerts here
        // The sequence comprised of [doc1, doc1WithLaterTimestamp] will have
        // host.name and 'host-a' as the suppression values
        // the other two sequence alerts comprised of [doc1WithLaterTimestamp, doc2WithNoHost]
        // and [doc2WithNoHost, doc3WithNoHost] will have no suppression values set because
        // of the logic outlined above
        await indexListOfSourceDocuments([
          doc1,
          doc1WithLaterTimestamp,
          doc2WithNoHost,
          doc3WithNoHost,
        ]);

        const rule: EqlRuleCreateProps = {
          ...getEqlRuleForAlertTesting(['ecs_compliant']),
          query: getSequenceQuery(id),
          alert_suppression: {
            group_by: ['host.name'],
            missing_fields_strategy: 'doNotSuppress',
          },
          from: 'now-35m',
          interval: '30m',
        };

        const { previewId } = await previewRule({
          supertest,
          rule,
          timeframeEnd: new Date('2020-10-28T07:00:00.000Z'),
          invocationCount: 1,
        });
        const previewAlerts = await getPreviewAlerts({
          es,
          previewId,
          sort: [TIMESTAMP],
        });
        // we expect one alert and one suppressed alert
        // and two building block alerts per shell alert, let's confirm that
        const [sequenceAlerts, buildingBlockAlerts] =
          partitionSequenceBuildingBlocks(previewAlerts);
        expect(buildingBlockAlerts).toHaveLength(6);
        expect(sequenceAlerts).toHaveLength(3);
        const [suppressedSequenceAlerts] = partition(
          sequenceAlerts,
          (alert) => (alert?._source?.['kibana.alert.suppression.docs_count'] as number) >= 0
        );
        expect(suppressedSequenceAlerts).toHaveLength(1);

        expect(suppressedSequenceAlerts[0]._source).toEqual({
          ...suppressedSequenceAlerts[0]._source,
          [ALERT_SUPPRESSION_TERMS]: [
            {
              field: 'host.name',
              value: 'host-a',
            },
          ],
          [TIMESTAMP]: '2020-10-28T07:00:00.000Z',
          [ALERT_SUPPRESSION_DOCS_COUNT]: 0,
        });
      });

      it('does not suppress alerts when suppression field value is undefined for a sequence alert in a given rule execution', async () => {
        const id = uuidv4();
        const timestamp = '2020-10-28T06:50:00.000Z';
        const laterTimestamp = '2020-10-28T06:51:00.000Z';
        const laterTimestamp2 = '2020-10-28T06:53:00.000Z';
        const doc1 = {
          id,
          '@timestamp': timestamp,
          host: { name: 'host-a' },
        };
        const doc1WithNoHost = {
          ...doc1,
          '@timestamp': laterTimestamp,
          host: undefined,
        };

        const doc2WithNoHost = {
          ...doc1,
          '@timestamp': laterTimestamp2,
          host: undefined,
        };

        await indexListOfSourceDocuments([doc1, doc1WithNoHost, doc2WithNoHost]);

        const rule: EqlRuleCreateProps = {
          ...getEqlRuleForAlertTesting(['ecs_compliant']),
          query: getSequenceQuery(id),
          alert_suppression: {
            group_by: ['host.name'],
            missing_fields_strategy: 'doNotSuppress',
          },
          from: 'now-35m',
          interval: '30m',
        };

        const { previewId } = await previewRule({
          supertest,
          rule,
          timeframeEnd: new Date('2020-10-28T07:00:00.000Z'),
          invocationCount: 1,
        });
        const previewAlerts = await getPreviewAlerts({
          es,
          previewId,
          sort: [ALERT_SUPPRESSION_START], // sorting on null fields was preventing the alerts from yielding
        });
        // we expect one alert and two suppressed alerts
        // and two building block alerts, let's confirm that
        expect(previewAlerts).toHaveLength(6);
        const [sequenceAlert, buildingBlockAlerts] = partitionSequenceBuildingBlocks(previewAlerts);
        const [suppressedSequenceAlerts] = partition(
          sequenceAlert,
          (alert) => (alert?._source?.['kibana.alert.suppression.docs_count'] as number) >= 0
        );
        expect(buildingBlockAlerts).toHaveLength(4);
        expect(sequenceAlert).toHaveLength(2);
        expect(suppressedSequenceAlerts).toHaveLength(0);
        expect(sequenceAlert[0]?._source).toEqual({
          ...sequenceAlert[0]?._source,
          [ALERT_SUPPRESSION_TERMS]: undefined,
          [TIMESTAMP]: '2020-10-28T07:00:00.000Z',
          [ALERT_SUPPRESSION_DOCS_COUNT]: undefined,
        });
      });

      it('suppresses alerts when suppression field value is undefined for a sequence alert in a given rule execution', async () => {
        const id = uuidv4();
        const timestamp = '2020-10-28T06:50:00.000Z';
        const laterTimestamp = '2020-10-28T06:51:00.000Z';
        const laterTimestamp2 = '2020-10-28T06:53:00.000Z';
        const laterTimestamp3 = '2020-10-28T06:53:01.000Z';

        const doc1 = {
          id,
          '@timestamp': timestamp,
          host: { name: 'host-a' },
        };
        const doc1WithNoHost = {
          ...doc1,
          '@timestamp': laterTimestamp,
          host: undefined,
        };

        const doc2WithNoHost = {
          ...doc1,
          '@timestamp': laterTimestamp2,
          host: undefined,
        };

        const doc3WithNoHost = {
          ...doc1,
          '@timestamp': laterTimestamp3,
          host: undefined,
        };

        await indexListOfSourceDocuments([doc1, doc1WithNoHost, doc2WithNoHost, doc3WithNoHost]);

        const rule: EqlRuleCreateProps = {
          ...getEqlRuleForAlertTesting(['ecs_compliant']),
          query: getSequenceQuery(id),
          alert_suppression: {
            group_by: ['host.name'],
            missing_fields_strategy: 'suppress',
          },
          from: 'now-35m',
          interval: '30m',
        };

        const { previewId } = await previewRule({
          supertest,
          rule,
          timeframeEnd: new Date('2020-10-28T07:00:00.000Z'),
          invocationCount: 1,
        });
        const previewAlerts = await getPreviewAlerts({
          es,
          previewId,
          sort: [ALERT_ORIGINAL_TIME],
        });
        // we expect one alert and two suppressed alerts
        // and two building block alerts, let's confirm that
        expect(previewAlerts).toHaveLength(3);
        const [sequenceAlert, buildingBlockAlerts] = partitionSequenceBuildingBlocks(previewAlerts);
        const [suppressedSequenceAlerts] = partition(
          sequenceAlert,
          (alert) => (alert?._source?.['kibana.alert.suppression.docs_count'] as number) >= 0
        );
        expect(suppressedSequenceAlerts).toHaveLength(1);
        expect(buildingBlockAlerts).toHaveLength(2);
        expect(sequenceAlert).toHaveLength(1);

        expect(sequenceAlert[0]?._source).toEqual({
          ...sequenceAlert[0]?._source,
          [ALERT_SUPPRESSION_TERMS]: [
            {
              field: 'host.name',
              value: null,
            },
          ],
          [TIMESTAMP]: '2020-10-28T07:00:00.000Z',
          [ALERT_LAST_DETECTED]: '2020-10-28T07:00:00.000Z',
          [ALERT_SUPPRESSION_DOCS_COUNT]: 2,
        });
      });

      it('does not suppress alerts when "doNotSuppress" is set and suppression field value is undefined for a sequence alert in a given rule execution', async () => {
        // This logic should be understood within the confines of the
        // objectPairIntersection function defined in
        // x-pack/solutions/security/plugins/security_solution/server/lib/detection_engine/rule_types/eql/build_alert_group_from_sequence.ts
        // Any sequence comprised of events where one field contains a value, followed by any number of
        // events in the sequence where the value is null or undefined will have that field
        // stripped from the sequence alert. So given that, we expect three alerts here
        // all with the suppression value as undefined
        const id = uuidv4();
        const timestamp = '2020-10-28T06:50:00.000Z';
        const laterTimestamp = '2020-10-28T06:51:00.000Z';
        const laterTimestamp2 = '2020-10-28T06:53:00.000Z';
        const laterTimestamp3 = '2020-10-28T06:53:01.000Z';

        const doc1 = {
          id,
          '@timestamp': timestamp,
          host: { name: 'host-a' },
        };
        const doc1WithNoHost = {
          ...doc1,
          '@timestamp': laterTimestamp,
          host: { name: undefined },
        };

        const doc2WithNoHost = {
          ...doc1,
          '@timestamp': laterTimestamp2,
          host: { name: undefined },
        };

        const doc3WithNoHost = {
          ...doc1,
          '@timestamp': laterTimestamp3,
          host: { name: undefined },
        };

        await indexListOfSourceDocuments([doc1, doc1WithNoHost, doc2WithNoHost, doc3WithNoHost]);

        const rule: EqlRuleCreateProps = {
          ...getEqlRuleForAlertTesting(['ecs_compliant']),
          query: getSequenceQuery(id),
          alert_suppression: {
            group_by: ['host.name'],
            missing_fields_strategy: 'doNotSuppress',
          },
          from: 'now-35m',
          interval: '30m',
        };

        const { previewId } = await previewRule({
          supertest,
          rule,
          timeframeEnd: new Date('2020-10-28T07:00:00.000Z'),
          invocationCount: 1,
        });
        const previewAlerts = await getPreviewAlerts({
          es,
          previewId,
          sort: [ALERT_ORIGINAL_TIME],
        });

        expect(previewAlerts).toHaveLength(9);
        const [sequenceAlert, buildingBlockAlerts] = partitionSequenceBuildingBlocks(previewAlerts);
        const [suppressedSequenceAlerts] = partition(
          sequenceAlert,
          (alert) => (alert?._source?.['kibana.alert.suppression.docs_count'] as number) >= 0
        );
        // no alerts should be suppressed because doNotSuppress is set
        expect(suppressedSequenceAlerts).toHaveLength(0);
        expect(buildingBlockAlerts).toHaveLength(6);
        // 3 sequence alerts comprised of
        // (doc1 + doc1WithNoHost), (doc1WithNoHost + doc2WithNoHost), (doc2WithNoHost + doc3WithNoHost)
        expect(sequenceAlert).toHaveLength(3);

        expect(sequenceAlert[0]?._source).toEqual({
          ...sequenceAlert[0]?._source,
          [ALERT_SUPPRESSION_TERMS]: undefined,
          [ALERT_SUPPRESSION_DOCS_COUNT]: undefined,
        });
      });

      it('does not suppress alerts outside of the current rule execution search range', async () => {
        const id = uuidv4();
        const timestamp = '2020-10-28T06:05:00.000Z'; // this should not count towards events
        const laterTimestamp = '2020-10-28T06:50:00.000Z';
        const laterTimestamp2 = '2020-10-28T06:51:00.000Z';
        const laterTimestamp3 = '2020-10-28T06:53:00.000Z';
        const doc1 = {
          id,
          '@timestamp': timestamp,
          host: { name: 'host-a' },
        };
        const doc1WithLaterTimestamp = {
          ...doc1,
          '@timestamp': laterTimestamp,
        };
        const doc2WithLaterTimestamp = { ...doc1WithLaterTimestamp, '@timestamp': laterTimestamp2 };
        const doc3WithLaterTimestamp = { ...doc2WithLaterTimestamp, '@timestamp': laterTimestamp3 };

        await indexListOfSourceDocuments([
          doc1,
          doc1WithLaterTimestamp,
          doc2WithLaterTimestamp,
          doc3WithLaterTimestamp,
        ]);

        const rule: EqlRuleCreateProps = {
          ...getEqlRuleForAlertTesting(['ecs_compliant']),
          query: getSequenceQuery(id),
          alert_suppression: {
            group_by: ['host.name'],
            missing_fields_strategy: 'suppress',
          },
          from: 'now-35m',
          interval: '30m',
        };

        const { previewId } = await previewRule({
          supertest,
          rule,
          timeframeEnd: new Date('2020-10-28T07:00:00.000Z'),
          invocationCount: 1,
        });
        const previewAlerts = await getPreviewAlerts({
          es,
          previewId,
          sort: [ALERT_ORIGINAL_TIME],
        });
        // we expect one alert and two suppressed alerts
        // and two building block alerts, let's confirm that
        expect(previewAlerts).toHaveLength(3);
        const [sequenceAlert, buildingBlockAlerts] = partitionSequenceBuildingBlocks(previewAlerts);
        expect(buildingBlockAlerts).toHaveLength(2);
        expect(sequenceAlert).toHaveLength(1);

        expect(sequenceAlert[0]?._source).toEqual({
          ...sequenceAlert[0]?._source,
          [ALERT_SUPPRESSION_TERMS]: [
            {
              field: 'host.name',
              value: 'host-a',
            },
          ],
          [TIMESTAMP]: '2020-10-28T07:00:00.000Z',
          [ALERT_LAST_DETECTED]: '2020-10-28T07:00:00.000Z',
          [ALERT_SUPPRESSION_DOCS_COUNT]: 1,
        });
      });

      it('suppresses sequence alert with suppression value of "null" when all events have unique values for suppression field', async () => {
        /*
        Sequence alerts only contain values which make up the intersection of
        a given field in all events for that sequence.

        So for a sequence alert where the two events contain host name values of
        host-a and host-b, the sequence alert will have 'null' for that value and will
        suppress on null values if missing_fields_strategy is set to 'suppress'
        */
        const id = uuidv4();
        const timestamp = '2020-10-28T06:50:00.000Z';
        const laterTimestamp = '2020-10-28T06:50:01.000Z';
        const laterTimestamp2 = '2020-10-28T06:51:00.000Z';
        const laterTimestamp3 = '2020-10-28T06:53:00.000Z';
        const doc1 = {
          id,
          '@timestamp': timestamp,
          host: { name: 'host-a' },
        };
        const doc1WithLaterTimestamp = {
          ...doc1,
          '@timestamp': laterTimestamp,
          host: { name: 'host-b' },
        };
        const doc2WithLaterTimestamp = {
          ...doc1WithLaterTimestamp,
          '@timestamp': laterTimestamp2,
          host: { name: 'host-c' },
        };
        const doc3WithLaterTimestamp = {
          ...doc2WithLaterTimestamp,
          '@timestamp': laterTimestamp3,
          host: { name: 'host-d' },
        };
        await indexListOfSourceDocuments([
          doc1,
          doc1WithLaterTimestamp,
          doc2WithLaterTimestamp,
          doc3WithLaterTimestamp,
        ]);

        const rule: EqlRuleCreateProps = {
          ...getEqlRuleForAlertTesting(['ecs_compliant']),
          query: getSequenceQuery(id),
          alert_suppression: {
            group_by: ['host.name'],
            missing_fields_strategy: 'suppress',
          },
          from: 'now-35m',
          interval: '30m',
        };

        const { previewId } = await previewRule({
          supertest,
          rule,
          timeframeEnd: new Date('2020-10-28T07:00:00.000Z'),
          invocationCount: 1,
        });
        const previewAlerts = await getPreviewAlerts({
          es,
          previewId,
          sort: [ALERT_ORIGINAL_TIME],
        });
        // we expect one alert and two suppressed alerts
        // and two building block alerts, let's confirm that
        expect(previewAlerts).toHaveLength(3);
        const [sequenceAlert, buildingBlockAlerts] = partitionSequenceBuildingBlocks(previewAlerts);
        expect(buildingBlockAlerts).toHaveLength(2);
        expect(sequenceAlert).toHaveLength(1);

        expect(sequenceAlert[0]._source).toEqual({
          ...sequenceAlert[0]._source,
          [ALERT_SUPPRESSION_TERMS]: [
            {
              field: 'host.name',
              value: null,
            },
          ],
          [TIMESTAMP]: '2020-10-28T07:00:00.000Z',
          [ALERT_LAST_DETECTED]: '2020-10-28T07:00:00.000Z',
          [ALERT_SUPPRESSION_DOCS_COUNT]: 2,
        });
      });

      it('suppresses alerts on a field with array values', async () => {
        const id = uuidv4();

        const timestamp = '2020-10-28T06:45:00.000Z';
        const timestamp2 = '2020-10-28T06:46:00.000Z';
        const timestamp3 = '2020-10-28T06:47:00.000Z';

        const doc1 = {
          id,
          '@timestamp': timestamp,
          host: { name: ['host-a', 'host-b'] },
        };

        await indexListOfSourceDocuments([
          doc1,
          { ...doc1, '@timestamp': timestamp2 },
          { ...doc1, '@timestamp': timestamp3 },
        ]);
        const rule: EqlRuleCreateProps = {
          ...getEqlRuleForAlertTesting(['ecs_compliant']),
          query: getSequenceQuery(id),
          alert_suppression: {
            group_by: ['host.name'],
            missing_fields_strategy: 'suppress',
          },
          from: 'now-35m',
          interval: '30m',
        };

        const { previewId } = await previewRule({
          supertest,
          rule,
          timeframeEnd: new Date('2020-10-28T07:00:00.000Z'),
          invocationCount: 1,
        });
        const previewAlerts = await getPreviewAlerts({
          es,
          previewId,
          sort: [ALERT_ORIGINAL_TIME],
        });
        const [sequenceAlert] = partitionSequenceBuildingBlocks(previewAlerts);
        expect(previewAlerts).toHaveLength(3); // one sequence, two building block
        expect(sequenceAlert[0]._source).toEqual({
          ...sequenceAlert[0]._source,
          [ALERT_SUPPRESSION_TERMS]: [
            {
              field: 'host.name',
              value: ['host-a', 'host-b'],
            },
          ],
          [TIMESTAMP]: '2020-10-28T07:00:00.000Z',
          [ALERT_LAST_DETECTED]: '2020-10-28T07:00:00.000Z',
          [ALERT_SUPPRESSION_DOCS_COUNT]: 1,
        });
      });

      it('suppresses alerts with missing fields and multiple suppress by fields', async () => {
        const id = uuidv4();
        const timestamp = '2020-10-28T06:45:00.000Z';
        const timestamp2 = '2020-10-28T06:45:01.000Z';
        const timestamp3 = '2020-10-28T06:45:02.000Z';
        const timestamp4 = '2020-10-28T06:45:03.000Z';
        const timestamp5 = '2020-10-28T06:45:04.000Z';
        const timestamp6 = '2020-10-28T06:45:05.000Z';
        const timestamp7 = '2020-10-28T06:45:06.000Z';
        const timestamp8 = '2020-10-28T06:45:07.000Z';
        const timestamp9 = '2020-10-28T06:45:08.000Z';
        const timestamp10 = '2020-10-28T06:45:09.000Z';
        const timestamp11 = '2020-10-28T06:45:10.000Z';
        const timestamp12 = '2020-10-28T06:45:11.000Z';

        const noMissingFieldsDoc = {
          id,
          '@timestamp': timestamp,
          host: { name: 'host-a' },
          agent: { name: 'agent-a', version: 10 },
        };

        const missingNameFieldsDoc = {
          ...noMissingFieldsDoc,
          agent: { version: 10 },
        };

        const missingVersionFieldsDoc = {
          ...noMissingFieldsDoc,
          agent: { name: 'agent-a' },
        };

        const missingAgentFieldsDoc = {
          ...noMissingFieldsDoc,
          agent: undefined,
        };

        // 4 alerts should be suppressed: 1 for each pair of documents
        await indexListOfSourceDocuments([
          noMissingFieldsDoc,
          { ...noMissingFieldsDoc, '@timestamp': timestamp2 },
          { ...noMissingFieldsDoc, '@timestamp': timestamp3 },

          { ...missingNameFieldsDoc, '@timestamp': timestamp4 },
          { ...missingNameFieldsDoc, '@timestamp': timestamp5 },
          { ...missingNameFieldsDoc, '@timestamp': timestamp6 },

          { ...missingVersionFieldsDoc, '@timestamp': timestamp7 },
          { ...missingVersionFieldsDoc, '@timestamp': timestamp8 },
          { ...missingVersionFieldsDoc, '@timestamp': timestamp9 },

          { ...missingAgentFieldsDoc, '@timestamp': timestamp10 },
          { ...missingAgentFieldsDoc, '@timestamp': timestamp11 },
          { ...missingAgentFieldsDoc, '@timestamp': timestamp12 },
        ]);

        const rule: EqlRuleCreateProps = {
          ...getEqlRuleForAlertTesting(['ecs_compliant']),
          query: getSequenceQuery(id),
          alert_suppression: {
            group_by: ['agent.name', 'agent.version'],
            missing_fields_strategy: 'suppress',
          },
          from: 'now-35m',
          interval: '30m',
        };

        const { previewId } = await previewRule({
          supertest,
          rule,
          timeframeEnd: new Date('2020-10-28T07:00:00.000Z'),
          invocationCount: 1,
        });
        const previewAlerts = await getPreviewAlerts({
          es,
          previewId,
          size: 100,
          sort: [ALERT_SUPPRESSION_START], // sorting on null fields was preventing the alerts from yielding
        });
        const [sequenceAlert] = partitionSequenceBuildingBlocks(previewAlerts);

        // for sequence alerts if neither of the fields are there, we cannot suppress
        expect(sequenceAlert).toHaveLength(4);
        expect(sequenceAlert[0]._source).toEqual({
          ...sequenceAlert[0]._source,
          [ALERT_SUPPRESSION_TERMS]: [
            {
              field: 'agent.name',
              value: 'agent-a',
            },
            {
              field: 'agent.version',
              value: 10,
            },
          ],
          [ALERT_SUPPRESSION_DOCS_COUNT]: 1,
        });

        expect(sequenceAlert[1]._source).toEqual({
          ...sequenceAlert[1]._source,
          [ALERT_SUPPRESSION_TERMS]: [
            {
              field: 'agent.name',
              value: null,
            },
            {
              field: 'agent.version',
              value: 10,
            },
          ],
          [ALERT_SUPPRESSION_DOCS_COUNT]: 2,
        });

        expect(sequenceAlert[2]._source).toEqual({
          ...sequenceAlert[2]._source,
          [ALERT_SUPPRESSION_TERMS]: [
            {
              field: 'agent.name',
              value: null,
            },
            {
              field: 'agent.version',
              value: null,
            },
          ],
          [ALERT_SUPPRESSION_DOCS_COUNT]: 3,
        });

        expect(sequenceAlert[3]._source).toEqual({
          ...sequenceAlert[3]._source,
          [ALERT_SUPPRESSION_TERMS]: [
            {
              field: 'agent.name',
              value: 'agent-a',
            },
            {
              field: 'agent.version',
              value: null,
            },
          ],
          [ALERT_SUPPRESSION_DOCS_COUNT]: 1,
        });
      });

      it('does not suppress alerts when "doNotSuppress" is set and we have alerts with missing fields and multiple suppress by fields', async () => {
        const id = uuidv4();
        const timestamp = '2020-10-28T06:45:00.000Z';
        const timestamp2 = '2020-10-28T06:45:01.000Z';
        const timestamp3 = '2020-10-28T06:45:02.000Z';
        const timestamp4 = '2020-10-28T06:45:03.000Z';
        const timestamp5 = '2020-10-28T06:45:04.000Z';
        const timestamp6 = '2020-10-28T06:45:05.000Z';
        const timestamp7 = '2020-10-28T06:45:06.000Z';
        const timestamp8 = '2020-10-28T06:45:07.000Z';
        const timestamp9 = '2020-10-28T06:45:08.000Z';
        const timestamp10 = '2020-10-28T06:45:09.000Z';
        const timestamp11 = '2020-10-28T06:45:10.000Z';
        const timestamp12 = '2020-10-28T06:45:11.000Z';

        const noMissingFieldsDoc = {
          id,
          '@timestamp': timestamp,
          host: { name: 'host-a' },
          agent: { name: 'agent-a', version: 10 },
        };

        const missingNameFieldsDoc = {
          ...noMissingFieldsDoc,
          agent: { version: 10 },
        };

        const missingVersionFieldsDoc = {
          ...noMissingFieldsDoc,
          agent: { name: 'agent-a' },
        };

        const missingAgentFieldsDoc = {
          ...noMissingFieldsDoc,
          agent: undefined,
        };

        // 4 alerts should be suppressed: 1 for each pair of documents
        await indexListOfSourceDocuments([
          noMissingFieldsDoc,
          { ...noMissingFieldsDoc, '@timestamp': timestamp2 },
          { ...noMissingFieldsDoc, '@timestamp': timestamp3 },

          { ...missingNameFieldsDoc, '@timestamp': timestamp4 },
          { ...missingNameFieldsDoc, '@timestamp': timestamp5 },
          { ...missingNameFieldsDoc, '@timestamp': timestamp6 },

          { ...missingVersionFieldsDoc, '@timestamp': timestamp7 },
          { ...missingVersionFieldsDoc, '@timestamp': timestamp8 },
          { ...missingVersionFieldsDoc, '@timestamp': timestamp9 },

          { ...missingAgentFieldsDoc, '@timestamp': timestamp10 },
          { ...missingAgentFieldsDoc, '@timestamp': timestamp11 },
          { ...missingAgentFieldsDoc, '@timestamp': timestamp12 },
        ]);

        const rule: EqlRuleCreateProps = {
          ...getEqlRuleForAlertTesting(['ecs_compliant']),
          query: getSequenceQuery(id),
          alert_suppression: {
            group_by: ['agent.name', 'agent.version'],
            missing_fields_strategy: 'doNotSuppress',
          },
          from: 'now-35m',
          interval: '30m',
        };

        const { previewId } = await previewRule({
          supertest,
          rule,
          timeframeEnd: new Date('2020-10-28T07:00:00.000Z'),
          invocationCount: 1,
        });
        const previewAlerts = await getPreviewAlerts({
          es,
          previewId,
          size: 100,
        });
        const [sequenceAlert] = partitionSequenceBuildingBlocks(previewAlerts);

        // for sequence alerts if neither of the fields are there, we cannot suppress
        const [suppressedSequenceAlerts] = partition(
          sequenceAlert,
          (alert) => (alert?._source?.['kibana.alert.suppression.docs_count'] as number) >= 0
        );
        expect(suppressedSequenceAlerts).toHaveLength(1);
        expect(suppressedSequenceAlerts[0]._source).toEqual({
          ...suppressedSequenceAlerts[0]._source,
          [ALERT_SUPPRESSION_TERMS]: [
            {
              field: 'agent.name',
              value: 'agent-a',
            },
            {
              field: 'agent.version',
              value: 10,
            },
          ],
          [ALERT_SUPPRESSION_DOCS_COUNT]: 1,
        });
      });

      it('deduplicates multiple alerts while suppressing on rule interval only', async () => {
        const id = uuidv4();
        const firstTimestamp = '2020-10-28T05:45:00.000Z';
        const secondTimestamp = '2020-10-28T06:10:00.000Z';
        const secondTimestamp2 = '2020-10-28T06:10:01.000Z';
        const secondTimestamp3 = '2020-10-28T06:10:02.000Z';
        const secondTimestamp4 = '2020-10-28T06:10:03.000Z';
        const secondTimestamp5 = '2020-10-28T06:10:04.000Z';
        const secondTimestamp6 = '2020-10-28T06:10:05.000Z';

        const doc1 = {
          id,
          '@timestamp': firstTimestamp,
          host: { name: 'host-a' },
        };

        // 4 alert should be suppressed
        await indexListOfSourceDocuments([
          doc1,
          { ...doc1, '@timestamp': secondTimestamp },
          { ...doc1, '@timestamp': secondTimestamp2 },
          { ...doc1, '@timestamp': secondTimestamp3 },
          { ...doc1, '@timestamp': secondTimestamp4 },
          { ...doc1, '@timestamp': secondTimestamp5 },
          { ...doc1, '@timestamp': secondTimestamp6 },
        ]);

        const rule: EqlRuleCreateProps = {
          ...getEqlRuleForAlertTesting(['ecs_compliant']),
          query: getSequenceQuery(id),
          alert_suppression: {
            group_by: ['host.name'],
            missing_fields_strategy: 'suppress',
          },
          // large look-back time covers all docs
          from: 'now-50m',
          interval: '30m',
        };

        const { previewId } = await previewRule({
          supertest,
          rule,
          timeframeEnd: new Date('2020-10-28T06:30:00.000Z'),
          invocationCount: 2, // 2 invocations so we can see that the same sequences are not generated / suppressed again.
        });
        const previewAlerts = await getPreviewAlerts({
          es,
          previewId,
          sort: ['host.name', ALERT_ORIGINAL_TIME],
        });
        const [sequenceAlert, buildingBlockAlerts] = partitionSequenceBuildingBlocks(previewAlerts);

        expect(buildingBlockAlerts).toHaveLength(2);
        expect(sequenceAlert).toHaveLength(1);
        expect(sequenceAlert[0]._source).toEqual({
          ...sequenceAlert[0]._source,
          [ALERT_SUPPRESSION_TERMS]: [
            {
              field: 'host.name',
              value: 'host-a',
            },
          ],
          [ALERT_SUPPRESSION_DOCS_COUNT]: 5, // if deduplication failed this would 12, or the previewAlerts count would be double
        });
      });
    });

    // FLAKY: https://github.com/elastic/kibana/issues/241398
    describe.skip('sequence queries with suppression duration', () => {
      it('suppresses alerts across two rule executions when the suppression duration exceeds the rule interval', async () => {
        const id = uuidv4();
        const firstTimestamp = new Date(Date.now() - 1000).toISOString();
        const firstTimestamp2 = new Date().toISOString();

        const firstDocument = {
          id,
          '@timestamp': firstTimestamp,
          host: {
            name: 'host-a',
          },
        };
        await indexListOfSourceDocuments([
          firstDocument,
          { ...firstDocument, '@timestamp': firstTimestamp2 },
        ]);

        const rule: EqlRuleCreateProps = {
          ...getEqlRuleForAlertTesting(['ecs_compliant']),
          query: getSequenceQuery(id),
          alert_suppression: {
            group_by: ['host.name'],
            duration: {
              value: 300,
              unit: 'm',
            },
            missing_fields_strategy: 'suppress',
          },
          from: 'now-35m',
          interval: '30m',
        };
        const createdRule = await createRule(supertest, log, rule);
        const alerts = await getOpenAlerts(supertest, log, es, createdRule);

        expect(alerts.hits.hits).toHaveLength(3);
        const [sequenceAlert, buildingBlockAlerts] = partitionSequenceBuildingBlocks(
          alerts.hits.hits
        );
        expect(buildingBlockAlerts).toHaveLength(2);
        expect(sequenceAlert).toHaveLength(1);

        // suppression start equal to alert timestamp
        const suppressionStart = sequenceAlert[0]._source?.[TIMESTAMP];

        expect(sequenceAlert[0]._source).toEqual(
          expect.objectContaining({
            [ALERT_SUPPRESSION_TERMS]: [
              {
                field: 'host.name',
                value: 'host-a',
              },
            ],
            // suppression boundaries equal to original event time, since no alert been suppressed
            [ALERT_SUPPRESSION_START]: suppressionStart,
            [ALERT_SUPPRESSION_END]: suppressionStart,
            [ALERT_SUPPRESSION_DOCS_COUNT]: 0,
          })
        );

        // index an event that happened 1 second before the next event in the sequence
        const secondTimestamp = new Date(Date.now() - 1000).toISOString();
        const secondDocument = {
          id,
          '@timestamp': secondTimestamp,
          host: {
            name: 'host-a',
          },
        };

        // Add a new document, then disable and re-enable to trigger another rule run. The second doc should
        // trigger an update to the existing alert without changing the timestamp
        await indexListOfSourceDocuments([secondDocument]);
        await patchRule(supertest, log, { id: createdRule.id, enabled: false });
        await patchRule(supertest, log, { id: createdRule.id, enabled: true });
        const afterTimestamp = new Date();
        const secondAlerts = await getOpenAlerts(
          supertest,
          log,
          es,
          createdRule,
          RuleExecutionStatusEnum.succeeded,
          undefined,
          afterTimestamp
        );

        const [sequenceAlert2] = partitionSequenceBuildingBlocks(secondAlerts.hits.hits);

        expect(sequenceAlert2).toHaveLength(1);
        expect(sequenceAlert2[0]._source).toEqual({
          ...sequenceAlert2[0]?._source,
          [ALERT_SUPPRESSION_TERMS]: [
            {
              field: 'host.name',
              value: 'host-a',
            },
          ],
          [ALERT_SUPPRESSION_DOCS_COUNT]: 1, // 1 alert from second rule run, that's why 1 suppressed
        });
        // suppression end value should be greater than second document timestamp, but lesser than current time
        const suppressionEnd = new Date(
          sequenceAlert2[0]._source?.[ALERT_SUPPRESSION_END] as string
        ).getTime();
        expect(suppressionEnd).toBeLessThan(new Date().getTime());
        expect(suppressionEnd).toBeGreaterThan(new Date(secondTimestamp).getDate());
      });

      it('does not suppress alerts outside of duration', async () => {
        const id = uuidv4();
        const firstRunTimestamp1 = '2020-10-28T05:45:00.000Z';
        const firstRunTimestamp2 = '2020-10-28T05:46:00.000Z';
        const secondRunTimestamp1 = '2020-10-28T06:10:00.000Z';
        const secondRunTimestamp2 = '2020-10-28T06:11:00.000Z';

        const firstDocument = {
          id,
          '@timestamp': firstRunTimestamp1,
          host: {
            name: 'host-a',
          },
        };
        await indexListOfSourceDocuments([
          firstDocument,
          { ...firstDocument, '@timestamp': firstRunTimestamp2 },
          { ...firstDocument, '@timestamp': secondRunTimestamp1 },
          { ...firstDocument, '@timestamp': secondRunTimestamp2 },
        ]);

        const rule: EqlRuleCreateProps = {
          ...getEqlRuleForAlertTesting(['ecs_compliant']),
          query: getSequenceQuery(id),
          alert_suppression: {
            group_by: ['host.name'],
            duration: {
              value: 20,
              unit: 'm',
            },
            missing_fields_strategy: 'suppress',
          },
          from: 'now-35m',
          interval: '30m',
        };

        const { previewId } = await previewRule({
          supertest,
          rule,
          timeframeEnd: new Date('2020-10-28T06:30:00.000Z'),
          invocationCount: 2,
        });

        const previewAlerts = await getPreviewAlerts({
          es,
          previewId,
        });

        expect(previewAlerts).toHaveLength(6);
        const [sequenceAlert, buildingBlockAlerts] = partitionSequenceBuildingBlocks(previewAlerts);
        expect(buildingBlockAlerts).toHaveLength(4);
        expect(sequenceAlert).toHaveLength(2);

        expect(sequenceAlert[0]._source).toEqual({
          ...sequenceAlert[0]._source,
          [ALERT_SUPPRESSION_TERMS]: [
            {
              field: 'host.name',
              value: 'host-a',
            },
          ],
          [ALERT_SUPPRESSION_DOCS_COUNT]: 0,
        });

        expect(sequenceAlert[1]._source).toEqual({
          ...sequenceAlert[1]._source,
          [ALERT_SUPPRESSION_TERMS]: [
            {
              field: 'host.name',
              value: 'host-a',
            },
          ],
          [ALERT_SUPPRESSION_DOCS_COUNT]: 0,
        });
      });

      it('suppresses alerts when query has 3 sequences', async () => {
        // the first sequence alert is comprised of events [timestamp1, ...2, ...3]
        // the other suppressed alerts will be made up of the following sequences
        // [timestamp2, timestamp3, timestamp4]
        // [timestamp3, timestamp4, timestamp5]
        // [timestamp4, timestamp5, timestamp6]
        const id = uuidv4();
        const dateNow = Date.now();
        const timestamp1 = new Date(dateNow - 5000).toISOString();
        const timestamp2 = new Date(dateNow - 5500).toISOString();
        const timestamp3 = new Date(dateNow - 5800).toISOString();
        const timestamp4 = new Date(dateNow - 6000).toISOString();
        const timestamp5 = new Date(dateNow - 6100).toISOString();
        const timestamp6 = new Date(dateNow - 6200).toISOString();

        const firstSequenceEvent = {
          id,
          '@timestamp': timestamp1,
          host: {
            name: 'host-a',
          },
        };
        await indexListOfSourceDocuments([
          firstSequenceEvent,
          { ...firstSequenceEvent, '@timestamp': timestamp2 },
          { ...firstSequenceEvent, '@timestamp': timestamp3 },
        ]);

        const secondSequenceEvent = {
          id,
          '@timestamp': timestamp4,
          host: {
            name: 'host-a',
          },
        };

        await indexListOfSourceDocuments([
          secondSequenceEvent,
          { ...secondSequenceEvent, '@timestamp': timestamp5 },
          { ...secondSequenceEvent, '@timestamp': timestamp6 },
        ]);

        const rule: EqlRuleCreateProps = {
          ...getEqlRuleForAlertTesting(['ecs_compliant']),
          query: `sequence [any where id == "${id}"] [any where id == "${id}"] [any where id == "${id}"]`,
          alert_suppression: {
            group_by: ['host.name'],
            duration: {
              value: 10,
              unit: 's',
            },
            missing_fields_strategy: 'suppress',
          },
          from: 'now-30s',
          interval: '10s',
        };
        const createdRule = await createRule(supertest, log, rule);
        const alerts = await getOpenAlerts(supertest, log, es, createdRule);

        // we expect one shell alert
        // and three building block alerts
        expect(alerts.hits.hits).toHaveLength(4);
        const [sequenceAlert, buildingBlockAlerts] = partitionSequenceBuildingBlocks(
          alerts.hits.hits
        );
        expect(buildingBlockAlerts).toHaveLength(3);
        expect(sequenceAlert).toHaveLength(1);

        expect(sequenceAlert[0]._source).toEqual({
          ...sequenceAlert[0]._source,
          [ALERT_SUPPRESSION_TERMS]: [
            {
              field: 'host.name',
              value: 'host-a',
            },
          ],
          [ALERT_SUPPRESSION_DOCS_COUNT]: 3,
        });
      });

      // Failing: See https://github.com/elastic/kibana/issues/202940
      it.skip('does not suppress alerts outside of duration when query with 3 sequences', async () => {
        const id = uuidv4();
        const dateNow = Date.now();
        const timestampSequenceEvent1 = new Date(dateNow - 5000).toISOString();
        const timestampSequenceEvent2 = new Date(dateNow - 5500).toISOString();
        const timestampSequenceEvent3 = new Date(dateNow - 5800).toISOString();

        const firstSequenceEvent = {
          id,
          '@timestamp': timestampSequenceEvent1,
          host: {
            name: 'host-a',
          },
        };
        await indexListOfSourceDocuments([
          firstSequenceEvent,
          { ...firstSequenceEvent, '@timestamp': timestampSequenceEvent2 },
          { ...firstSequenceEvent, '@timestamp': timestampSequenceEvent3 },
        ]);

        const rule: EqlRuleCreateProps = {
          ...getEqlRuleForAlertTesting(['ecs_compliant']),
          query: `sequence [any where id == "${id}"] [any where id == "${id}"] [any where id == "${id}"]`,
          alert_suppression: {
            group_by: ['host.name'],
            duration: {
              value: 7,
              unit: 's',
            },
            missing_fields_strategy: 'suppress',
          },
          from: 'now-10s',
          interval: '5s',
        };
        const createdRule = await createRule(supertest, log, rule);
        const alerts = await getOpenAlerts(supertest, log, es, createdRule);

        // we expect one shell alert
        // and three building block alerts
        expect(alerts.hits.hits).toHaveLength(4);
        const [sequenceAlert, buildingBlockAlerts] = partitionSequenceBuildingBlocks(
          alerts.hits.hits
        );
        expect(buildingBlockAlerts).toHaveLength(3);
        expect(sequenceAlert).toHaveLength(1);

        expect(sequenceAlert[0]._source).toEqual({
          ...sequenceAlert[0]._source,
          [ALERT_SUPPRESSION_TERMS]: [
            {
              field: 'host.name',
              value: 'host-a',
            },
          ],
          [ALERT_SUPPRESSION_DOCS_COUNT]: 0,
        });

        const dateNow2 = Date.now();
        const secondTimestampEventSequence = new Date(dateNow2 - 2000).toISOString();
        const secondTimestampEventSequence2 = new Date(dateNow2 - 1000).toISOString();
        const secondTimestampEventSequence3 = new Date(dateNow2).toISOString();

        const secondSequenceEvent = {
          id,
          '@timestamp': secondTimestampEventSequence,
          host: {
            name: 'host-a',
          },
        };

        // Add a new document, then disable and re-enable to trigger another rule run.
        // the second rule run should generate a new alert
        await patchRule(supertest, log, { id: createdRule.id, enabled: false });

        await indexListOfSourceDocuments([
          secondSequenceEvent,
          { ...secondSequenceEvent, '@timestamp': secondTimestampEventSequence2 },
          { ...secondSequenceEvent, '@timestamp': secondTimestampEventSequence3 },
        ]);
        await patchRule(supertest, log, { id: createdRule.id, enabled: true });
        const afterTimestamp2 = new Date(dateNow2 + 55000);
        const secondAlerts = await getOpenAlerts(
          supertest,
          log,
          es,
          createdRule,
          RuleExecutionStatusEnum.succeeded,
          undefined,
          afterTimestamp2
        );

        const [sequenceAlert2, buildingBlockAlerts2] = partitionSequenceBuildingBlocks(
          secondAlerts.hits.hits
        );

        // two sequence alerts because the second one happened
        // outside of the rule's suppression duration
        expect(sequenceAlert2).toHaveLength(2);
        expect(buildingBlockAlerts2).toHaveLength(6);
        // timestamps should be different for two alerts, showing they were
        // created in different rule executions
        expect(sequenceAlert2[0]?._source?.[TIMESTAMP]).not.toEqual(
          sequenceAlert2[1]?._source?.[TIMESTAMP]
        );

        expect(sequenceAlert2[0]._source).toEqual({
          ...sequenceAlert2[0]?._source,
          [ALERT_SUPPRESSION_TERMS]: [
            {
              field: 'host.name',
              value: 'host-a',
            },
          ],
          [ALERT_SUPPRESSION_DOCS_COUNT]: 0, // only one alert created, so zero documents are suppressed
        });
        expect(sequenceAlert2[1]._source).toEqual({
          ...sequenceAlert2[1]?._source,
          [ALERT_SUPPRESSION_TERMS]: [
            {
              field: 'host.name',
              value: 'host-a',
            },
          ],
          [ALERT_SUPPRESSION_DOCS_COUNT]: 0, // only one alert created, so zero documents are suppressed
        });
      });
    });
  });
};
