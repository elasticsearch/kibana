/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import expect from 'expect';
import { sortBy } from 'lodash';

import {
  ALERT_SUPPRESSION_START,
  ALERT_SUPPRESSION_END,
  ALERT_SUPPRESSION_DOCS_COUNT,
  ALERT_SUPPRESSION_TERMS,
  ALERT_LAST_DETECTED,
  TIMESTAMP,
  ALERT_START,
} from '@kbn/rule-data-utils';
import { getSuppressionMaxSignalsWarning as getSuppressionMaxAlertsWarning } from '@kbn/security-solution-plugin/server/lib/detection_engine/rule_types/utils/utils';

import { DETECTION_ENGINE_SIGNALS_STATUS_URL as DETECTION_ENGINE_ALERTS_STATUS_URL } from '@kbn/security-solution-plugin/common/constants';

import type { ThreatMatchRuleCreateProps } from '@kbn/security-solution-plugin/common/api/detection_engine';
import { RuleExecutionStatusEnum } from '@kbn/security-solution-plugin/common/api/detection_engine/rule_monitoring';

import { ALERT_ORIGINAL_TIME } from '@kbn/security-solution-plugin/common/field_maps/field_names';
import { createRule } from '@kbn/detections-response-ftr-services';
import {
  getOpenAlerts,
  getPreviewAlerts,
  getThreatMatchRuleForAlertTesting,
  previewRule,
  patchRule,
  setAlertStatus,
  dataGeneratorFactory,
} from '../../../../utils';
import type { FtrProviderContext } from '../../../../../../ftr_provider_context';
import { EntityStoreV2EnrichmentSetup } from '../../entity_store_v2_enrichment_setup';

export default ({ getService }: FtrProviderContext) => {
  const supertest = getService('supertest');
  const esArchiver = getService('esArchiver');
  const es = getService('es');
  const log = getService('log');
  const entityStoreV2 = EntityStoreV2EnrichmentSetup(getService);

  const {
    indexListOfDocuments: indexListOfSourceDocuments,
    indexGeneratedDocuments: indexGeneratedSourceDocuments,
  } = dataGeneratorFactory({
    es,
    index: 'ecs_compliant',
    log,
  });

  // ensures minimal number of events indexed that will be queried within rule runs
  // it is needed to ensure we cover IM rule code branch execution in which number of events is greater than number of threats
  // takes array of timestamps, so events can be indexed for multiple rule executions
  const eventsFiller = async ({
    id,
    timestamp,
    count,
  }: {
    id: string;
    count: number;
    timestamp: string[];
  }) => {
    if (!count) {
      return;
    }

    await Promise.all(
      timestamp.map((t) =>
        indexGeneratedSourceDocuments({
          docsCount: count,
          seed: (index) => ({
            id,
            '@timestamp': t,
            host: {
              name: `host-event-${index}`,
            },
          }),
        })
      )
    );
  };

  // ensures minimal number of threats indexed that will be queried within rule runs
  // it is needed to ensure we cover IM rule code branch execution in which number of events is smaller than number of threats
  // takes single timestamp, as time window for queried threats is 30 days in past
  const threatsFiller = async ({
    id,
    timestamp,
    count,
  }: {
    id: string;
    count: number;
    timestamp: string;
  }) =>
    count &&
    indexGeneratedSourceDocuments({
      docsCount: count,
      seed: (index) => ({
        id,
        '@timestamp': timestamp,
        'agent.type': 'threat',
        host: {
          name: `host-threat-${index}`,
        },
      }),
    });

  const addThreatDocuments = ({
    id,
    timestamp,
    fields,
    count,
  }: {
    id: string;
    fields?: Record<string, unknown>;
    timestamp: string;
    count: number;
  }) =>
    indexGeneratedSourceDocuments({
      docsCount: count,
      seed: (index) => ({
        id,
        '@timestamp': timestamp,
        'agent.type': 'threat',
        ...fields,
      }),
    });

  // for simplicity IM rule query source events and threats from the same index
  // all events with agent.type:threat are categorized as threats
  // the rest will be source ones
  const indicatorMatchRule = (id: string) => ({
    ...getThreatMatchRuleForAlertTesting(['ecs_compliant']),
    query: `id:${id} and NOT agent.type:threat`,
    threat_query: `id:${id} and agent.type:threat`,
    name: 'ALert suppression IM test rule',
  });

  // cases to cover 2 execution paths of IM
  const cases = [
    {
      eventsCount: 10,
      threatsCount: 0,
      title: `events count is greater than threats count`,
    },

    {
      eventsCount: 0,
      threatsCount: 10,
      title: `events count is smaller than threats count`,
    },
  ];

  // NOTE: Add to second quality gate after feature is GA
  describe('@ess @serverless Indicator match type rules, alert suppression', () => {
    before(async () => {
      await esArchiver.load(
        'x-pack/solutions/security/test/fixtures/es_archives/security_solution/ecs_compliant'
      );
    });

    after(async () => {
      await esArchiver.unload(
        'x-pack/solutions/security/test/fixtures/es_archives/security_solution/ecs_compliant'
      );
    });

    cases.forEach(({ eventsCount, threatsCount, title }) => {
      // FLAKY: https://github.com/elastic/kibana/issues/197765
      describe(`Code execution path: ${title}`, () => {
        it('should suppress an alert on real rule executions', async () => {
          const id = uuidv4();
          const firstTimestamp = new Date().toISOString();

          await eventsFiller({ id, count: eventsCount, timestamp: [firstTimestamp] });
          await threatsFiller({ id, count: threatsCount, timestamp: firstTimestamp });

          const firstDocument = {
            id,
            '@timestamp': firstTimestamp,
            host: {
              name: 'host-a',
            },
          };
          await indexListOfSourceDocuments([firstDocument]);

          await addThreatDocuments({
            id,
            timestamp: firstTimestamp,
            fields: {
              host: {
                name: 'host-a',
              },
            },
            count: 1,
          });

          const rule: ThreatMatchRuleCreateProps = {
            ...indicatorMatchRule(id),
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
          await eventsFiller({ id, count: eventsCount, timestamp: [secondTimestamp] });

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
          expect(secondAlerts.hits.hits.length).toEqual(1);
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

        it('should NOT suppress and update an alert if the alert is closed', async () => {
          const id = uuidv4();
          const firstTimestamp = new Date().toISOString();

          await eventsFiller({ id, count: eventsCount, timestamp: [firstTimestamp] });
          await threatsFiller({ id, count: threatsCount, timestamp: firstTimestamp });

          const firstDocument = {
            id,
            '@timestamp': firstTimestamp,
            host: {
              name: 'host-a',
            },
          };
          await indexListOfSourceDocuments([firstDocument]);

          await addThreatDocuments({
            id,
            timestamp: firstTimestamp,
            fields: {
              host: {
                name: 'host-a',
              },
            },
            count: 1,
          });

          const rule: ThreatMatchRuleCreateProps = {
            ...indicatorMatchRule(id),
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
            host: {
              name: 'host-a',
            },
          };
          // Add new documents, then disable and re-enable to trigger another rule run. The second doc should
          // trigger a new alert since the first one is now closed.
          await indexListOfSourceDocuments([secondDocument]);
          await eventsFiller({ id, count: eventsCount, timestamp: [secondTimestamp] });

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
          expect(secondAlerts.hits.hits.length).toEqual(1);
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

          await eventsFiller({ id, count: eventsCount, timestamp: [firstTimestamp] });
          await threatsFiller({ id, count: threatsCount, timestamp: firstTimestamp });

          const firstDocument = {
            id,
            '@timestamp': firstTimestamp,
            host: {
              name: 'host-a',
            },
          };
          await indexListOfSourceDocuments([firstDocument]);

          await addThreatDocuments({
            id,
            timestamp: firstTimestamp,
            fields: {
              host: {
                name: 'host-a',
              },
            },
            count: 1,
          });

          const ruleWithoutSuppression: ThreatMatchRuleCreateProps = {
            ...indicatorMatchRule(id),
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

          const createdRule = await createRule(supertest, log, ruleWithoutSuppression);
          const alerts = await getOpenAlerts(supertest, log, es, createdRule);
          expect(alerts.hits.hits).toHaveLength(1);
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

          expect(secondAlerts.hits.hits.length).toEqual(2);

          const sortedAlerts = sortBy(secondAlerts.hits.hits, ALERT_ORIGINAL_TIME);

          // second alert is generated with suppression
          expect(sortedAlerts[1]._source).toEqual(
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

        it('should NOT suppress alerts when suppression period is less than rule interval', async () => {
          const id = uuidv4();
          const firstTimestamp = '2020-10-28T05:45:00.000Z';
          const secondTimestamp = '2020-10-28T06:15:00.000Z';

          await eventsFiller({
            id,
            count: eventsCount,
            timestamp: [firstTimestamp, secondTimestamp],
          });
          await threatsFiller({ id, count: threatsCount, timestamp: firstTimestamp });

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

          await addThreatDocuments({
            id,
            timestamp: firstTimestamp,
            fields: {
              host: {
                name: 'host-a',
              },
            },
            count: 1,
          });

          const rule: ThreatMatchRuleCreateProps = {
            ...indicatorMatchRule(id),
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
          expect(previewAlerts.length).toBe(2);
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

        it('should suppress alerts in the time window that covers 3 rule executions', async () => {
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

          await eventsFiller({
            id,
            count: eventsCount,
            timestamp: [firstTimestamp, secondTimestamp, thirdTimestamp],
          });
          await threatsFiller({ id, count: threatsCount, timestamp: firstTimestamp });

          await indexListOfSourceDocuments([
            firstRunDoc,
            firstRunDoc,
            secondRunDoc,
            secondRunDoc,
            thirdRunDoc,
          ]);

          await addThreatDocuments({
            id,
            timestamp: firstTimestamp,
            fields: {
              host: {
                name: 'host-a',
              },
            },
            count: 1,
          });

          const rule: ThreatMatchRuleCreateProps = {
            ...indicatorMatchRule(id),
            alert_suppression: {
              group_by: ['host.name'],
              duration: {
                value: 2,
                unit: 'h',
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
          expect(previewAlerts.length).toEqual(1);
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

        it('should suppress the correct alerts based on multi values group_by', async () => {
          const id = uuidv4();
          const firstTimestamp = '2020-10-28T05:45:00.000Z';
          const secondTimestamp = '2020-10-28T06:15:00.000Z';
          const firstRunDocA = {
            id,
            '@timestamp': firstTimestamp,
            'host.name': 'host-a',
            'agent.version': 1,
          };
          const firstRunDoc2 = {
            ...firstRunDocA,
            'agent.version': 2,
          };
          const firstRunDocB = {
            ...firstRunDocA,
            'host.name': 'host-b',
            'agent.version': 1,
          };

          const secondRunDocA = {
            ...firstRunDocA,
            '@timestamp': secondTimestamp,
          };

          await eventsFiller({
            id,
            count: eventsCount,
            timestamp: [firstTimestamp, secondTimestamp],
          });
          await threatsFiller({ id, count: threatsCount, timestamp: firstTimestamp });

          await indexListOfSourceDocuments([
            firstRunDocA,
            firstRunDoc2,
            firstRunDocB,
            secondRunDocA,
            secondRunDocA,
            secondRunDocA,
          ]);
          await addThreatDocuments({
            id,
            timestamp: firstTimestamp,
            fields: {
              host: {
                name: 'host-a',
              },
            },
            count: 1,
          });

          const rule: ThreatMatchRuleCreateProps = {
            ...indicatorMatchRule(id),
            alert_suppression: {
              group_by: ['host.name', 'agent.version'],
              duration: {
                value: 2,
                unit: 'h',
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
            sort: ['host.name', 'agent.version', ALERT_ORIGINAL_TIME],
          });
          // 3 alerts should be generated:
          // 1. for pair 'host-a', 1 - suppressed
          // 2. for pair 'host-a', 2 - not suppressed
          expect(previewAlerts.length).toEqual(2);
          expect(previewAlerts[0]._source).toEqual({
            ...previewAlerts[0]._source,
            [ALERT_SUPPRESSION_TERMS]: [
              {
                field: 'host.name',
                value: ['host-a'],
              },
              {
                field: 'agent.version',
                value: ['1'],
              },
            ],
            [TIMESTAMP]: '2020-10-28T06:00:00.000Z',
            [ALERT_ORIGINAL_TIME]: firstTimestamp,
            [ALERT_SUPPRESSION_START]: firstTimestamp,
            [ALERT_SUPPRESSION_END]: secondTimestamp,
            [ALERT_SUPPRESSION_DOCS_COUNT]: 3, // 3 alerts suppressed from the second run
          });
          expect(previewAlerts[1]._source).toEqual({
            ...previewAlerts[1]._source,
            [ALERT_SUPPRESSION_TERMS]: [
              {
                field: 'host.name',
                value: ['host-a'],
              },
              {
                field: 'agent.version',
                value: ['2'],
              },
            ],
            [TIMESTAMP]: '2020-10-28T06:00:00.000Z',
            [ALERT_LAST_DETECTED]: '2020-10-28T06:00:00.000Z',
            [ALERT_ORIGINAL_TIME]: firstTimestamp,
            [ALERT_SUPPRESSION_START]: firstTimestamp,
            [ALERT_SUPPRESSION_END]: firstTimestamp,
            [ALERT_SUPPRESSION_DOCS_COUNT]: 0, // no suppressed alerts
          });
        });

        it('should correctly suppress when using a timestamp override', async () => {
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

          await eventsFiller({
            id,
            count: eventsCount,
            timestamp: [firstTimestamp, secondTimestamp],
          });
          await threatsFiller({ id, count: threatsCount, timestamp: firstTimestamp });

          await indexListOfSourceDocuments([docWithoutOverride, docWithOverride]);

          await addThreatDocuments({
            id,
            timestamp: firstTimestamp,
            fields: {
              host: {
                name: 'host-a',
              },
            },
            count: 1,
          });

          const rule: ThreatMatchRuleCreateProps = {
            ...indicatorMatchRule(id),
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

          expect(previewAlerts.length).toEqual(1);
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

        it('should deduplicate multiple alerts while suppressing new ones', async () => {
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

          await eventsFiller({
            id,
            count: eventsCount,
            timestamp: [firstTimestamp, secondTimestamp],
          });
          await threatsFiller({ id, count: threatsCount, timestamp: firstTimestamp });

          // 4 alert should be suppressed
          await indexListOfSourceDocuments([doc1, doc1, doc2, doc2, doc2]);

          await addThreatDocuments({
            id,
            timestamp: firstTimestamp,
            fields: {
              host: {
                name: 'host-a',
              },
            },
            count: 1,
          });

          const rule: ThreatMatchRuleCreateProps = {
            ...indicatorMatchRule(id),
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
          expect(previewAlerts.length).toEqual(1);
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
            // TODO: fix count, it should be 4 suppressed
            [ALERT_SUPPRESSION_DOCS_COUNT]: 4,
          });
        });

        it('should deduplicate single alerts while suppressing new ones', async () => {
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

          await eventsFiller({
            id,
            count: eventsCount,
            timestamp: [firstTimestamp, secondTimestamp],
          });
          await threatsFiller({ id, count: threatsCount, timestamp: firstTimestamp });

          // 3 alerts should be suppressed
          await indexListOfSourceDocuments([doc1, doc2, doc2, doc2]);

          await addThreatDocuments({
            id,
            timestamp: firstTimestamp,
            fields: {
              host: {
                name: 'host-a',
              },
            },
            count: 1,
          });

          const rule: ThreatMatchRuleCreateProps = {
            ...indicatorMatchRule(id),
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
          expect(previewAlerts.length).toEqual(1);
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
            [ALERT_SUPPRESSION_DOCS_COUNT]: 3,
          });
        });

        it('should suppress alerts with missing fields', async () => {
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

          await eventsFiller({
            id,
            count: eventsCount,
            timestamp: [firstTimestamp, secondTimestamp],
          });
          await threatsFiller({ id, count: threatsCount, timestamp: firstTimestamp });

          // 4 alert should be suppressed: 2 for agent.name: 'agent-1' and 2 for missing agent.name
          await indexListOfSourceDocuments([
            doc1,
            doc1,
            docWithMissingField1,
            docWithMissingField1,
            docWithMissingField2,
            doc2,
          ]);

          await addThreatDocuments({
            id,
            timestamp: firstTimestamp,
            fields: {
              host: {
                name: 'host-a',
              },
            },
            count: 1,
          });

          const rule: ThreatMatchRuleCreateProps = {
            ...indicatorMatchRule(id),
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
          expect(previewAlerts.length).toEqual(2);
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

        it('should not suppress alerts with missing fields if configured so', async () => {
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

          await eventsFiller({
            id,
            count: eventsCount,
            timestamp: [firstTimestamp, secondTimestamp],
          });
          await threatsFiller({ id, count: threatsCount, timestamp: firstTimestamp });

          // 2 alert should be suppressed: 2 for agent.name: 'agent-1' and not any for missing agent.name
          await indexListOfSourceDocuments([
            doc1,
            doc1,
            docWithMissingField1,
            docWithMissingField1,
            docWithMissingField2,
            doc2,
          ]);

          await addThreatDocuments({
            id,
            timestamp: firstTimestamp,
            fields: {
              host: {
                name: 'host-a',
              },
            },
            count: 1,
          });

          const rule: ThreatMatchRuleCreateProps = {
            ...indicatorMatchRule(id),
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
          expect(previewAlerts.length).toEqual(4);
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

        // large number of documents gets processed in batches of 9,000
        // rule should correctly go through them and suppress
        // that can be an issue when search results returning in desc order
        // this test is added to verify suppression works fine for this cases
        it('should suppress alerts on large number of documents, more than 9,000', async () => {
          const id = uuidv4();
          const firstTimestamp = '2020-10-28T05:45:00.000Z';
          const secondTimestamp = '2020-10-28T06:10:00.000Z';

          await eventsFiller({
            id,
            count: 10000 * eventsCount,
            timestamp: [firstTimestamp, secondTimestamp],
          });
          await threatsFiller({ id, count: 10000 * threatsCount, timestamp: firstTimestamp });

          await indexGeneratedSourceDocuments({
            docsCount: 60000,
            seed: (index) => ({
              id,
              '@timestamp': new Date('2020-10-28T05:45:00.000Z').getTime() - index,
              host: {
                name: `host-${index}`,
              },
              agent: { name: 'agent-a' },
            }),
          });

          await indexGeneratedSourceDocuments({
            docsCount: 60000,
            seed: (index) => ({
              id,
              '@timestamp': new Date('2020-10-28T06:20:00.000Z').getTime() - index,
              host: {
                name: `host-${index}`,
              },
              agent: { name: 'agent-a' },
            }),
          });

          await addThreatDocuments({
            id,
            timestamp: firstTimestamp,
            fields: {
              host: {
                name: 'host-80',
              },
            },
            count: 1,
          });

          await addThreatDocuments({
            id,
            timestamp: firstTimestamp,
            fields: {
              host: {
                name: 'host-14000',
              },
            },
            count: 1,
          });

          await addThreatDocuments({
            id,
            timestamp: firstTimestamp,
            fields: {
              host: {
                name: 'host-36000',
              },
            },
            count: 1,
          });

          await addThreatDocuments({
            id,
            timestamp: firstTimestamp,
            fields: {
              host: {
                name: 'host-5700',
              },
            },
            count: 1,
          });

          const rule: ThreatMatchRuleCreateProps = {
            ...indicatorMatchRule(id),
            alert_suppression: {
              group_by: ['agent.name'],
              missing_fields_strategy: 'suppress',
              duration: {
                value: 300,
                unit: 'm',
              },
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
          expect(previewAlerts.length).toEqual(1);
          expect(previewAlerts[0]._source).toEqual({
            ...previewAlerts[0]._source,
            [ALERT_SUPPRESSION_TERMS]: [
              {
                field: 'agent.name',
                value: ['agent-a'],
              },
            ],
            // There 4 documents in threats index, each matches one document in source index on each of 2 rule executions
            // In total it gives 8 potential alerts. With suppression enabled 1 is created, the rest 7 are suppressed
            [ALERT_SUPPRESSION_DOCS_COUNT]: 7,
          });
        });

        describe('rule execution only', () => {
          it('should suppress alerts during rule execution only', async () => {
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
            // doc2 does not generate alert
            const doc2 = {
              ...doc1,
              host: { name: 'host-b' },
            };

            await eventsFiller({ id, count: eventsCount, timestamp: [timestamp] });
            await threatsFiller({ id, count: threatsCount, timestamp });

            await indexListOfSourceDocuments([doc1, doc1WithLaterTimestamp, doc1, doc2]);

            await addThreatDocuments({
              id,
              timestamp,
              fields: {
                host: {
                  name: 'host-a',
                },
              },
              count: 1,
            });

            const rule: ThreatMatchRuleCreateProps = {
              ...indicatorMatchRule(id),
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
            expect(previewAlerts.length).toEqual(1);
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

          it('should suppress alerts during rule execution only for array field', async () => {
            const id = uuidv4();
            const timestamp = '2020-10-28T06:45:00.000Z';
            const doc1 = {
              id,
              '@timestamp': timestamp,
              host: { name: ['host-a', 'host-b'] },
            };

            await eventsFiller({ id, count: eventsCount, timestamp: [timestamp] });
            await threatsFiller({ id, count: threatsCount, timestamp });

            await indexListOfSourceDocuments([doc1, doc1, doc1]);

            await addThreatDocuments({
              id,
              timestamp,
              fields: {
                host: {
                  name: 'host-a',
                },
              },
              count: 1,
            });

            const rule: ThreatMatchRuleCreateProps = {
              ...indicatorMatchRule(id),
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
            expect(previewAlerts.length).toEqual(1);
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

          it('should suppress alerts with missing fields during rule execution only for multiple suppress by fields', async () => {
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

            await eventsFiller({ id, count: eventsCount, timestamp: [timestamp] });
            await threatsFiller({ id, count: threatsCount, timestamp });

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

            await addThreatDocuments({
              id,
              timestamp,
              fields: {
                host: {
                  name: 'host-a',
                },
              },
              count: 1,
            });

            const rule: ThreatMatchRuleCreateProps = {
              ...indicatorMatchRule(id),
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
            expect(previewAlerts.length).toEqual(4);
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

          it('should suppress alerts with missing fields during rule execution only', async () => {
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

            await eventsFiller({ id, count: eventsCount, timestamp: [timestamp] });
            await threatsFiller({ id, count: threatsCount, timestamp });

            // 2 alert should be suppressed: 1 doc and 1 doc2
            await indexListOfSourceDocuments([doc1, doc1, doc2, doc2]);

            await addThreatDocuments({
              id,
              timestamp,
              fields: {
                host: {
                  name: 'host-a',
                },
              },
              count: 1,
            });

            const rule: ThreatMatchRuleCreateProps = {
              ...indicatorMatchRule(id),
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
            expect(previewAlerts.length).toEqual(2);
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

          it('should not suppress alerts with missing fields during rule execution only if configured so', async () => {
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

            await eventsFiller({ id, count: eventsCount, timestamp: [timestamp] });
            await threatsFiller({ id, count: threatsCount, timestamp });

            // 1 alert should be suppressed: 1 doc only
            await indexListOfSourceDocuments([doc1, doc1, doc2, doc2]);

            await addThreatDocuments({
              id,
              timestamp,
              fields: {
                host: {
                  name: 'host-a',
                },
              },
              count: 1,
            });

            const rule: ThreatMatchRuleCreateProps = {
              ...indicatorMatchRule(id),
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
            expect(previewAlerts.length).toEqual(3);
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

          it('should not suppress alerts with missing fields during rule execution only if configured so for multiple suppress by fields', async () => {
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

            await eventsFiller({ id, count: eventsCount, timestamp: [timestamp] });
            await threatsFiller({ id, count: threatsCount, timestamp });

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

            await addThreatDocuments({
              id,
              timestamp,
              fields: {
                host: {
                  name: 'host-a',
                },
              },
              count: 1,
            });

            const rule: ThreatMatchRuleCreateProps = {
              ...indicatorMatchRule(id),
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
            expect(previewAlerts.length).toEqual(6);
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

          it('should deduplicate multiple alerts while suppressing on rule interval only', async () => {
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

            await eventsFiller({
              id,
              count: eventsCount,
              timestamp: [firstTimestamp, secondTimestamp],
            });
            await threatsFiller({ id, count: threatsCount, timestamp: firstTimestamp });

            // 4 alert should be suppressed
            await indexListOfSourceDocuments([doc1, doc1, doc2, doc2, doc2]);

            await addThreatDocuments({
              id,
              timestamp: firstTimestamp,
              fields: {
                host: {
                  name: 'host-a',
                },
              },
              count: 1,
            });

            const rule: ThreatMatchRuleCreateProps = {
              ...indicatorMatchRule(id),
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
            expect(previewAlerts.length).toEqual(2);
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

          it('should deduplicate single alert while suppressing new ones on rule execution', async () => {
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

            await eventsFiller({
              id,
              count: eventsCount,
              timestamp: [firstTimestamp, secondTimestamp],
            });
            await threatsFiller({ id, count: threatsCount, timestamp: firstTimestamp });

            // 3 alerts should be suppressed
            await indexListOfSourceDocuments([doc1, doc2, doc2, doc2]);

            await addThreatDocuments({
              id,
              timestamp: firstTimestamp,
              fields: {
                host: {
                  name: 'host-a',
                },
              },
              count: 1,
            });

            const rule: ThreatMatchRuleCreateProps = {
              ...indicatorMatchRule(id),
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
            expect(previewAlerts.length).toEqual(2);
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

          it('should create and suppress alert on rule execution when alert created on previous execution', async () => {
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

            await eventsFiller({
              id,
              count: eventsCount,
              timestamp: [firstTimestamp, secondTimestamp],
            });
            await threatsFiller({ id, count: threatsCount, timestamp: firstTimestamp });

            // 1 created + 1 suppressed on first run
            // 1 created + 2 suppressed on second run
            await indexListOfSourceDocuments([doc1, doc1, doc2, doc2, doc2]);

            await addThreatDocuments({
              id,
              timestamp: firstTimestamp,
              fields: {
                host: {
                  name: 'host-a',
                },
              },
              count: 1,
            });

            const rule: ThreatMatchRuleCreateProps = {
              ...indicatorMatchRule(id),
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
            expect(previewAlerts.length).toEqual(2);
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

          it('should not suppress more than limited number (max_signals x5)', async () => {
            const id = uuidv4();
            const timestamp = '2020-10-28T06:45:00.000Z';

            await eventsFiller({ id, count: 100 * eventsCount, timestamp: [timestamp] });
            await threatsFiller({ id, count: 100 * threatsCount, timestamp });

            await indexGeneratedSourceDocuments({
              docsCount: 700,
              seed: (index) => ({
                id,
                '@timestamp': `2020-10-28T06:50:00.${index}Z`,
                host: {
                  name: `host-a`,
                },
                agent: { name: 'agent-a' },
              }),
            });

            await addThreatDocuments({
              id,
              timestamp,
              fields: {
                host: {
                  name: 'host-a',
                },
              },
              count: 1,
            });

            const rule: ThreatMatchRuleCreateProps = {
              ...indicatorMatchRule(id),
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
            expect(previewAlerts.length).toEqual(1);
            expect(previewAlerts[0]._source).toEqual({
              ...previewAlerts[0]._source,
              [ALERT_SUPPRESSION_TERMS]: [
                {
                  field: 'agent.name',
                  value: ['agent-a'],
                },
              ],
              [ALERT_SUPPRESSION_DOCS_COUNT]: 499,
            });
          });

          // 9,000 is the size of chunk that is processed in IM rule
          // when number of documents in either of index exceeds this number it may leads to unexpected behavior
          // this test added to ensure these cases covered
          it('should not suppress more than limited number (max_signals x5) for number of events/threats greater than 9,000', async () => {
            const id = uuidv4();
            const timestamp = '2020-10-28T06:45:00.000Z';

            await eventsFiller({ id, count: 10000 * eventsCount, timestamp: [timestamp] });
            await threatsFiller({ id, count: 10000 * threatsCount, timestamp });

            await indexGeneratedSourceDocuments({
              docsCount: 15000,
              seed: (index) => ({
                id,
                '@timestamp': `2020-10-28T06:50:00.${index}Z`,
                host: {
                  name: `host-a`,
                },
                agent: { name: 'agent-a' },
              }),
            });

            await addThreatDocuments({
              id,
              timestamp,
              fields: {
                host: {
                  name: 'host-a',
                },
              },
              count: 1,
            });

            const rule: ThreatMatchRuleCreateProps = {
              ...indicatorMatchRule(id),
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
            expect(previewAlerts.length).toEqual(1);
            expect(previewAlerts[0]._source).toEqual({
              ...previewAlerts[0]._source,
              [ALERT_SUPPRESSION_TERMS]: [
                {
                  field: 'agent.name',
                  value: ['agent-a'],
                },
              ],
              [ALERT_SUPPRESSION_DOCS_COUNT]: 499,
              [ALERT_SUPPRESSION_START]: '2020-10-28T06:50:00.000Z',
            });
          });

          it('should generate to max_signals alerts', async () => {
            const id = uuidv4();
            const firstTimestamp = '2020-10-28T06:05:00.000Z';
            const secondTimestamp = '2020-10-28T06:10:00.000Z';

            await eventsFiller({
              id,
              count: eventsCount * 20,
              timestamp: [firstTimestamp, secondTimestamp],
            });
            await threatsFiller({ id, count: threatsCount * 20, timestamp: firstTimestamp });

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

            await addThreatDocuments({
              id,
              timestamp: firstTimestamp,
              fields: {
                host: {
                  name: 'host-a',
                },
              },
              count: 1,
            });

            const rule: ThreatMatchRuleCreateProps = {
              ...indicatorMatchRule(id),
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
            expect(previewAlerts.length).toEqual(100);
          });

          it('should detect threats beyond max_signals if large number of alerts suppressed', async () => {
            const id = uuidv4();
            const timestamp = '2020-10-28T06:45:00.000Z';
            const doc1 = {
              id,
              '@timestamp': timestamp,
              host: { name: 'host-a' },
              agent: { name: 'agent-b' },
            };

            const doc2 = {
              id,
              '@timestamp': timestamp,
              host: { name: 'host-c' },
              agent: { name: 'agent-c' },
            };

            await eventsFiller({ id, count: 20 * eventsCount, timestamp: [timestamp] });
            await threatsFiller({ id, count: 20 * threatsCount, timestamp });

            await indexGeneratedSourceDocuments({
              docsCount: 150,
              seed: (index) => ({
                id,
                '@timestamp': `2020-10-28T06:50:00.${100 + index}Z`,
                host: {
                  name: `host-a`,
                },
                agent: { name: 'agent-a' },
              }),
            });

            await indexListOfSourceDocuments([doc1, doc1, doc1, doc2, doc2]);

            await addThreatDocuments({
              id,
              timestamp,
              fields: {
                host: {
                  name: 'host-a',
                },
              },
              count: 1,
            });

            await addThreatDocuments({
              id,
              timestamp,
              fields: {
                host: {
                  name: 'host-c',
                },
              },
              count: 1,
            });

            const rule: ThreatMatchRuleCreateProps = {
              ...indicatorMatchRule(id),
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

            // 3 alerts in total
            // 1 + 149 suppressed host-a threat, 'agent-a' suppressed by
            // 1 + 2 suppressed host-a threat, 'agent-b' suppressed by
            // 1 + 1 suppressed host-c threat, 'agent-c' suppressed by
            expect(previewAlerts.length).toEqual(3);
            expect(previewAlerts[0]._source).toEqual({
              ...previewAlerts[0]._source,
              [ALERT_SUPPRESSION_TERMS]: [
                {
                  field: 'agent.name',
                  value: ['agent-a'],
                },
              ],
              [ALERT_SUPPRESSION_START]: '2020-10-28T06:50:00.100Z',
              [ALERT_SUPPRESSION_END]: '2020-10-28T06:50:00.249Z', // the largest suppression end boundary
              [ALERT_SUPPRESSION_DOCS_COUNT]: 149,
            });

            expect(previewAlerts[1]._source).toEqual({
              ...previewAlerts[1]._source,
              [ALERT_SUPPRESSION_TERMS]: [
                {
                  field: 'agent.name',
                  value: ['agent-b'],
                },
              ],
              [ALERT_SUPPRESSION_DOCS_COUNT]: 2,
            });

            expect(previewAlerts[2]._source).toEqual({
              ...previewAlerts[2]._source,
              [ALERT_SUPPRESSION_TERMS]: [
                {
                  field: 'agent.name',
                  value: ['agent-c'],
                },
              ],
              [ALERT_SUPPRESSION_DOCS_COUNT]: 1,
            });
          });
        });

        describe('alerts should be enriched', () => {
          before(async () => {
            await entityStoreV2.setup({
              hosts: [
                {
                  host: { name: 'zeek-sensor-amsterdam' },
                  entity: {
                    id: 'host:zeek-sensor-amsterdam',
                    type: 'host',
                    risk: { calculated_level: 'Critical', calculated_score_norm: 70 },
                  },
                },
              ],
            });
          });

          after(async () => {
            await entityStoreV2.teardown();
          });

          it('should be enriched with host risk score', async () => {
            const id = uuidv4();
            const timestamp = '2020-10-28T06:45:00.000Z';
            const laterTimestamp = '2020-10-28T06:50:00.000Z';
            const doc1 = {
              id,
              '@timestamp': timestamp,
              host: { name: 'zeek-sensor-amsterdam' },
            };
            const doc1WithLaterTimestamp = {
              ...doc1,
              '@timestamp': laterTimestamp,
            };

            await eventsFiller({ id, count: eventsCount, timestamp: [timestamp] });
            await threatsFiller({ id, count: threatsCount, timestamp });

            await indexListOfSourceDocuments([doc1, doc1WithLaterTimestamp, doc1]);

            await addThreatDocuments({
              id,
              timestamp,
              fields: {
                host: {
                  name: 'zeek-sensor-amsterdam',
                },
              },
              count: 1,
            });

            const rule: ThreatMatchRuleCreateProps = {
              ...indicatorMatchRule(id),
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

            expect(previewAlerts[0]?._source?.host?.risk?.calculated_level).toEqual('Critical');
            expect(previewAlerts[0]?._source?.host?.risk?.calculated_score_norm).toEqual(70);
          });
        });

        describe('with asset criticality', () => {
          before(async () => {
            await entityStoreV2.setup({
              hosts: [
                {
                  host: { name: 'zeek-sensor-amsterdam' },
                  entity: { id: 'host:zeek-sensor-amsterdam', type: 'host' },
                  asset: { criticality: 'low_impact' },
                },
              ],
            });
          });

          after(async () => {
            await entityStoreV2.teardown();
          });

          it('should be enriched alert with criticality_level', async () => {
            const id = uuidv4();
            const timestamp = '2020-10-28T06:45:00.000Z';
            const laterTimestamp = '2020-10-28T06:50:00.000Z';
            const doc1 = {
              id,
              '@timestamp': timestamp,
              host: { name: 'zeek-sensor-amsterdam' },
            };
            const doc1WithLaterTimestamp = {
              ...doc1,
              '@timestamp': laterTimestamp,
            };

            await eventsFiller({ id, count: eventsCount, timestamp: [timestamp] });
            await threatsFiller({ id, count: threatsCount, timestamp });

            await indexListOfSourceDocuments([doc1, doc1WithLaterTimestamp, doc1]);

            await addThreatDocuments({
              id,
              timestamp,
              fields: {
                host: {
                  name: 'zeek-sensor-amsterdam',
                },
              },
              count: 1,
            });

            const rule: ThreatMatchRuleCreateProps = {
              ...indicatorMatchRule(id),
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

            expect(previewAlerts[0]?._source?.['host.asset.criticality']).toEqual('low_impact');
          });
        });
      });
    });
  });
};
