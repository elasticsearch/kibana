/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { sortBy } from 'lodash';
import expect from 'expect';
import { v4 as uuidv4 } from 'uuid';

import {
  ALERT_SUPPRESSION_START,
  ALERT_SUPPRESSION_END,
  ALERT_SUPPRESSION_DOCS_COUNT,
  ALERT_SUPPRESSION_TERMS,
  ALERT_LAST_DETECTED,
  TIMESTAMP,
  ALERT_START,
} from '@kbn/rule-data-utils';
import type { EsqlRuleCreateProps } from '@kbn/security-solution-plugin/common/api/detection_engine/model/rule_schema';
import { getCreateEsqlRulesSchemaMock } from '@kbn/security-solution-plugin/common/api/detection_engine/model/rule_schema/mocks';
import { RuleExecutionStatusEnum } from '@kbn/security-solution-plugin/common/api/detection_engine/rule_monitoring';
import { ALERT_ORIGINAL_TIME } from '@kbn/security-solution-plugin/common/field_maps/field_names';
import { DETECTION_ENGINE_SIGNALS_STATUS_URL as DETECTION_ENGINE_ALERTS_STATUS_URL } from '@kbn/security-solution-plugin/common/constants';
import { getSuppressionMaxSignalsWarning as getSuppressionMaxAlertsWarning } from '@kbn/security-solution-plugin/server/lib/detection_engine/rule_types/utils/utils';

import { deleteAllRules, deleteAllAlerts, createRule } from '@kbn/detections-response-ftr-services';
import {
  getPreviewAlerts,
  previewRule,
  getOpenAlerts,
  dataGeneratorFactory,
  previewRuleWithExceptionEntries,
  setAlertStatus,
  patchRule,
} from '../../../../utils';
import { deleteAllExceptions } from '../../../../../lists_and_exception_lists/utils';
import type { FtrProviderContext } from '../../../../../../ftr_provider_context';
import { EntityStoreV2EnrichmentSetup } from '../../entity_store_v2_enrichment_setup';

export default ({ getService }: FtrProviderContext) => {
  const supertest = getService('supertest');
  const esArchiver = getService('esArchiver');
  const entityStoreV2 = EntityStoreV2EnrichmentSetup(getService);
  const es = getService('es');
  const log = getService('log');
  const { indexEnhancedDocuments, indexListOfDocuments, indexGeneratedDocuments } =
    dataGeneratorFactory({
      es,
      index: 'ecs_compliant',
      log,
    });

  /**
   * to separate docs between rules runs
   */
  const internalIdPipe = (id: string) => `| where id=="${id}"`;

  const getNonAggRuleQueryWithMetadata = (id: string) =>
    `from ecs_compliant metadata _id, _index, _version ${internalIdPipe(id)}`;

  // NOTE: Add to second quality gate after feature is GA
  describe('@ess @serverless ES|QL rule type, alert suppression', () => {
    before(async () => {
      await esArchiver.load(
        'x-pack/solutions/security/test/fixtures/es_archives/security_solution/ecs_compliant'
      );
    });

    after(async () => {
      await esArchiver.unload(
        'x-pack/solutions/security/test/fixtures/es_archives/security_solution/ecs_compliant'
      );
      await deleteAllAlerts(supertest, log, es);
      await deleteAllRules(supertest, log);
    });

    it('should suppress an alert during real rule executions', async () => {
      const id = uuidv4();
      const firstTimestamp = new Date().toISOString();

      const firstExecutionDocuments = [
        {
          host: { name: 'host-0' },
          id,
          '@timestamp': firstTimestamp,
        },
        {
          host: { name: 'host-0' },
          id,
          '@timestamp': firstTimestamp,
        },
        {
          host: { name: 'host-0' },
          id,
          '@timestamp': firstTimestamp,
        },
      ];

      await indexListOfDocuments(firstExecutionDocuments);

      const rule: EsqlRuleCreateProps = {
        ...getCreateEsqlRulesSchemaMock('rule-1', true),
        query: getNonAggRuleQueryWithMetadata(id),
        from: 'now-35m',
        interval: '30m',
        alert_suppression: {
          group_by: ['host.name'],
          duration: {
            value: 300,
            unit: 'm',
          },
          missing_fields_strategy: 'suppress',
        },
      };

      const createdRule = await createRule(supertest, log, rule);
      const alerts = await getOpenAlerts(supertest, log, es, createdRule);

      expect(alerts.hits.hits).toHaveLength(1);
      expect(alerts.hits.hits[0]._source).toEqual(
        expect.objectContaining({
          [ALERT_SUPPRESSION_TERMS]: [
            {
              field: 'host.name',
              value: 'host-0',
            },
          ],
          // suppression boundaries equal to original event time, since no alert been suppressed
          [ALERT_SUPPRESSION_START]: firstTimestamp,
          [ALERT_SUPPRESSION_END]: firstTimestamp,
          [ALERT_ORIGINAL_TIME]: firstTimestamp,
          [ALERT_SUPPRESSION_DOCS_COUNT]: 2,
        })
      );

      const secondTimestamp = new Date().toISOString();
      const secondExecutionDocuments = [
        {
          host: { name: 'host-0', ip: '127.0.0.5' },
          id,
          '@timestamp': secondTimestamp,
        },
      ];
      // Add a new document, then disable and re-enable to trigger another rule run. The second doc should
      // trigger an update to the existing alert without changing the timestamp
      await indexListOfDocuments(secondExecutionDocuments);

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
              value: 'host-0',
            },
          ],
          [ALERT_ORIGINAL_TIME]: firstTimestamp, // timestamp is the same
          [ALERT_SUPPRESSION_START]: firstTimestamp, // suppression start is the same
          [ALERT_SUPPRESSION_END]: secondTimestamp, // suppression end is updated
          [ALERT_SUPPRESSION_DOCS_COUNT]: 3,
        })
      );
    });

    it('should NOT suppress and update an alert if the alert is closed', async () => {
      const id = uuidv4();
      const firstTimestamp = new Date().toISOString();

      const rule: EsqlRuleCreateProps = {
        ...getCreateEsqlRulesSchemaMock('rule-1', true),
        query: getNonAggRuleQueryWithMetadata(id),
        from: 'now-35m',
        interval: '30m',
        alert_suppression: {
          group_by: ['host.name'],
          duration: {
            value: 300,
            unit: 'm',
          },
          missing_fields_strategy: 'suppress',
        },
      };

      const firstExecutionDocuments = [
        {
          host: { name: 'host-0' },
          id,
          '@timestamp': firstTimestamp,
        },
      ];

      await indexListOfDocuments(firstExecutionDocuments);

      const createdRule = await createRule(supertest, log, rule);
      const alerts = await getOpenAlerts(supertest, log, es, createdRule);
      expect(alerts.hits.hits).toHaveLength(1);
      // Close the alert. Subsequent rule executions should ignore this closed alert
      // for suppression purposes.
      const alertIds = alerts.hits.hits.map((alert) => alert._id!);
      await supertest
        .post(DETECTION_ENGINE_ALERTS_STATUS_URL)
        .set('kbn-xsrf', 'true')
        .send(setAlertStatus({ alertIds, status: 'closed' }))
        .expect(200);

      const secondTimestamp = new Date().toISOString();
      const secondExecutionDocuments = [
        {
          host: { name: 'host-0' },
          id,
          '@timestamp': secondTimestamp,
        },
      ];
      // Add new documents, then disable and re-enable to trigger another rule run. The second doc should
      // trigger a new alert since the first one is now closed.
      await indexListOfDocuments(secondExecutionDocuments);

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
      expect(alerts.hits.hits[0]._source).toEqual(
        expect.objectContaining({
          [ALERT_SUPPRESSION_TERMS]: [
            {
              field: 'host.name',
              value: 'host-0',
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

      const ruleWithoutSuppression: EsqlRuleCreateProps = {
        ...getCreateEsqlRulesSchemaMock('rule-1', true),
        query: getNonAggRuleQueryWithMetadata(id),
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

      const firstExecutionDocuments = [
        {
          host: { name: 'host-0' },
          id,
          '@timestamp': firstTimestamp,
        },
      ];

      await indexListOfDocuments(firstExecutionDocuments);

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
      const secondExecutionDocument = {
        host: { name: 'host-0' },
        id,
        '@timestamp': secondTimestamp,
      };

      await indexListOfDocuments([secondExecutionDocument, secondExecutionDocument]);

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

      expect(secondAlerts.hits.hits).toHaveLength(2);

      const sortedAlerts = sortBy(secondAlerts.hits.hits, ALERT_ORIGINAL_TIME);

      // second alert is generated with suppression
      expect(sortedAlerts[1]._source).toEqual(
        expect.objectContaining({
          [ALERT_SUPPRESSION_TERMS]: [
            {
              field: 'host.name',
              value: 'host-0',
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

      const firstExecutionDocuments = [
        {
          host: { name: 'host-0' },
          id,
          '@timestamp': firstTimestamp,
        },
      ];
      const secondExecutionDocuments = [
        {
          host: { name: 'host-0' },
          id,
          '@timestamp': secondTimestamp,
        },
      ];
      await indexListOfDocuments([...firstExecutionDocuments, ...secondExecutionDocuments]);

      const rule: EsqlRuleCreateProps = {
        ...getCreateEsqlRulesSchemaMock('rule-1', true),
        query: getNonAggRuleQueryWithMetadata(id),
        from: 'now-35m',
        interval: '30m',
        alert_suppression: {
          group_by: ['host.name'],
          duration: {
            value: 10,
            unit: 'm',
          },
          missing_fields_strategy: 'suppress',
        },
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
              value: 'host-0',
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
              value: 'host-0',
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

      const firstExecutionDocuments = [
        {
          host: { name: 'host-0' },
          id,
          '@timestamp': firstTimestamp,
        },
        {
          host: { name: 'host-0' },
          id,
          '@timestamp': firstTimestamp,
        },
      ];
      const secondExecutionDocuments = [
        {
          host: { name: 'host-0' },
          id,
          '@timestamp': secondTimestamp,
        },
      ];
      const thirdExecutionDocuments = [
        {
          host: { name: 'host-0' },
          id,
          '@timestamp': thirdTimestamp,
        },
      ];

      await indexListOfDocuments([
        ...firstExecutionDocuments,
        ...secondExecutionDocuments,
        ...thirdExecutionDocuments,
      ]);

      const rule: EsqlRuleCreateProps = {
        ...getCreateEsqlRulesSchemaMock('rule-1', true),
        query: getNonAggRuleQueryWithMetadata(id),
        from: 'now-35m',
        interval: '30m',
        alert_suppression: {
          group_by: ['host.name'],
          duration: {
            value: 2,
            unit: 'h',
          },
          missing_fields_strategy: 'suppress',
        },
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
            value: 'host-0',
          },
        ],
        [TIMESTAMP]: '2020-10-28T06:00:00.000Z',
        [ALERT_LAST_DETECTED]: '2020-10-28T07:00:00.000Z', // Note: ALERT_LAST_DETECTED gets updated, timestamp does not
        [ALERT_START]: '2020-10-28T06:00:00.000Z',
        [ALERT_ORIGINAL_TIME]: firstTimestamp,
        [ALERT_SUPPRESSION_START]: firstTimestamp,
        [ALERT_SUPPRESSION_END]: thirdTimestamp,
        [ALERT_SUPPRESSION_DOCS_COUNT]: 3, // in total 3 alert got suppressed: 1 from the first run, 1 from the second, 1 from the third
      });
    });

    it('should suppress the correct alerts based on multi values group_by', async () => {
      const id = uuidv4();
      const firstTimestamp = '2020-10-28T05:45:00.000Z';
      const secondTimestamp = '2020-10-28T06:15:00.000Z';

      const firstExecutionDocuments = [
        {
          host: { name: 'host-a' },
          id,
          '@timestamp': firstTimestamp,
          'agent.version': 1,
        },
        {
          host: { name: 'host-a' },
          id,
          '@timestamp': firstTimestamp,
          'agent.version': 2,
        },
        {
          host: { name: 'host-b' },
          id,
          '@timestamp': firstTimestamp,
          'agent.version': 2,
        },
      ];
      const secondExecutionDocuments = [
        {
          host: { name: 'host-a' },
          id,
          '@timestamp': secondTimestamp,
          'agent.version': 1,
        },
      ];

      await indexListOfDocuments([...firstExecutionDocuments, ...secondExecutionDocuments]);

      const rule: EsqlRuleCreateProps = {
        ...getCreateEsqlRulesSchemaMock('rule-1', true),
        query: `from ecs_compliant metadata _id, _index, _version ${internalIdPipe(
          id
        )} | where host.name=="host-a"`,
        from: 'now-35m',
        interval: '30m',
        alert_suppression: {
          group_by: ['host.name', 'agent.version'],
          duration: {
            value: 60,
            unit: 'm',
          },
          missing_fields_strategy: 'suppress',
        },
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
      expect(previewAlerts).toHaveLength(2);
      expect(previewAlerts[0]._source).toEqual({
        ...previewAlerts[0]._source,
        [ALERT_SUPPRESSION_TERMS]: [
          {
            field: 'host.name',
            value: 'host-a',
          },
          {
            field: 'agent.version',
            value: '1',
          },
        ],
        [TIMESTAMP]: '2020-10-28T06:00:00.000Z',
        [ALERT_ORIGINAL_TIME]: firstTimestamp,
        [ALERT_SUPPRESSION_START]: firstTimestamp,
        [ALERT_SUPPRESSION_END]: secondTimestamp,
        [ALERT_SUPPRESSION_DOCS_COUNT]: 1,
      });
      expect(previewAlerts[1]._source).toEqual({
        ...previewAlerts[1]._source,
        [ALERT_SUPPRESSION_TERMS]: [
          {
            field: 'host.name',
            value: 'host-a',
          },
          {
            field: 'agent.version',
            value: '2',
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
      };
      const docWithOverride = {
        ...docWithoutOverride,
        host: { name: 'host-a' },
        // This simulates a very late arriving doc
        '@timestamp': '2020-10-28T03:00:00.000Z',
        event: {
          ingested: secondTimestamp,
        },
      };

      await indexListOfDocuments([docWithoutOverride, docWithOverride]);

      const rule: EsqlRuleCreateProps = {
        ...getCreateEsqlRulesSchemaMock('rule-1', true),
        query: getNonAggRuleQueryWithMetadata(id),
        from: 'now-35m',
        interval: '30m',
        alert_suppression: {
          group_by: ['host.name'],
          duration: {
            value: 60,
            unit: 'm',
          },
          missing_fields_strategy: 'suppress',
        },
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
            value: 'host-a',
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

      const firstExecutionDocuments = [
        {
          host: { name: 'host-a' },
          id,
          '@timestamp': firstTimestamp,
        },
        {
          host: { name: 'host-a' },
          id,
          '@timestamp': firstTimestamp,
        },
      ];
      const secondExecutionDocuments = [
        {
          host: { name: 'host-a' },
          id,
          '@timestamp': secondTimestamp,
        },
        {
          host: { name: 'host-a' },
          id,
          '@timestamp': secondTimestamp,
        },
        {
          host: { name: 'host-a' },
          id,
          '@timestamp': secondTimestamp,
        },
      ];

      await indexListOfDocuments([...firstExecutionDocuments, ...secondExecutionDocuments]);

      const rule: EsqlRuleCreateProps = {
        ...getCreateEsqlRulesSchemaMock('rule-1', true),
        query: getNonAggRuleQueryWithMetadata(id),
        alert_suppression: {
          group_by: ['host.name'],
          duration: {
            value: 60,
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
            value: 'host-a',
          },
        ],
        [ALERT_ORIGINAL_TIME]: firstTimestamp,
        [ALERT_SUPPRESSION_START]: firstTimestamp,
        [ALERT_SUPPRESSION_END]: secondTimestamp,
        [ALERT_SUPPRESSION_DOCS_COUNT]: 4,
      });
    });

    it('should suppress alerts with missing fields', async () => {
      const id = uuidv4();
      const firstTimestamp = '2020-10-28T05:45:00.000Z';
      const secondTimestamp = '2020-10-28T06:10:00.000Z';

      const firstExecutionDocuments = [
        {
          id,
          '@timestamp': firstTimestamp,
          host: { name: 'host-a', ip: '127.0.0.3' },
        },
        {
          id,
          '@timestamp': firstTimestamp,
          host: { name: 'host-a', ip: '127.0.0.4' },
        },
        {
          id,
          '@timestamp': firstTimestamp,
          host: { ip: '127.0.0.5' }, // doc 1 with missing host.name field
        },
        {
          id,
          '@timestamp': firstTimestamp,
          host: { ip: '127.0.0.6' }, // doc 2 with missing host.name field
        },
      ];
      const secondExecutionDocuments = [
        {
          host: { name: 'host-a', ip: '127.0.0.10' },
          id,
          '@timestamp': secondTimestamp,
        },
        {
          host: { ip: '127.0.0.11' }, // doc 3 with missing host.name field
          id,
          '@timestamp': secondTimestamp,
        },
      ];

      await indexListOfDocuments([...firstExecutionDocuments, ...secondExecutionDocuments]);

      const rule: EsqlRuleCreateProps = {
        ...getCreateEsqlRulesSchemaMock('rule-1', true),
        query: getNonAggRuleQueryWithMetadata(id),
        from: 'now-35m',
        interval: '30m',
        alert_suppression: {
          group_by: ['host.name'],
          duration: {
            value: 60,
            unit: 'm',
          },
          missing_fields_strategy: 'suppress',
        },
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
            value: 'host-a',
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
            field: 'host.name',
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

      const firstExecutionDocuments = [
        {
          id,
          '@timestamp': firstTimestamp,
          host: { name: 'host-a', ip: '127.0.0.3' },
        },
        {
          id,
          '@timestamp': firstTimestamp,
          host: { name: 'host-a', ip: '127.0.0.4' },
        },
        {
          id,
          '@timestamp': firstTimestamp,
          host: { ip: '127.0.0.5' }, // doc 1 with missing host.name field
        },
        {
          id,
          '@timestamp': firstTimestamp,
          host: { ip: '127.0.0.6' }, // doc 2 with missing host.name field
        },
      ];
      const secondExecutionDocuments = [
        {
          host: { name: 'host-a', ip: '127.0.0.10' },
          id,
          '@timestamp': secondTimestamp,
        },
        {
          host: { ip: '127.0.0.11' }, // doc 3 with missing host.name field
          id,
          '@timestamp': secondTimestamp,
        },
      ];

      await indexListOfDocuments([...firstExecutionDocuments, ...secondExecutionDocuments]);

      const rule: EsqlRuleCreateProps = {
        ...getCreateEsqlRulesSchemaMock('rule-1', true),
        query: getNonAggRuleQueryWithMetadata(id),
        from: 'now-35m',
        interval: '30m',
        alert_suppression: {
          group_by: ['host.name'],
          duration: {
            value: 60,
            unit: 'm',
          },
          missing_fields_strategy: 'doNotSuppress',
        },
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
      expect(previewAlerts).toHaveLength(4);
      expect(previewAlerts[0]._source).toEqual({
        ...previewAlerts[0]._source,
        [ALERT_SUPPRESSION_TERMS]: [
          {
            field: 'host.name',
            value: 'host-a',
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

    it('should suppress alerts for aggregating queries', async () => {
      const id = uuidv4();
      const firstTimestamp = '2020-10-28T05:45:00.000Z';
      const secondTimestamp = '2020-10-28T06:10:00.000Z';

      const firstExecutionDocuments = [
        {
          id,
          '@timestamp': firstTimestamp,
          host: { name: 'host-a' },
        },
        {
          id,
          '@timestamp': firstTimestamp,
          host: { name: 'host-a' },
        },
      ];
      const secondExecutionDocuments = [
        {
          host: { name: 'host-a' },
          id,
          '@timestamp': secondTimestamp,
        },
        {
          host: { name: 'host-a' },
          id,
          '@timestamp': secondTimestamp,
        },
        {
          host: { name: 'host-a' },
          id,
          '@timestamp': secondTimestamp,
        },
      ];

      await indexListOfDocuments([...firstExecutionDocuments, ...secondExecutionDocuments]);

      const rule: EsqlRuleCreateProps = {
        ...getCreateEsqlRulesSchemaMock('rule-1', true),
        query: `from ecs_compliant ${internalIdPipe(
          id
        )} | stats counted_agents=count(host.name) by host.name`,
        from: 'now-35m',
        interval: '30m',
        alert_suppression: {
          group_by: ['host.name'],
          duration: {
            value: 60,
            unit: 'm',
          },
          missing_fields_strategy: 'suppress',
        },
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
            value: 'host-a',
          },
        ],
        [ALERT_SUPPRESSION_START]: '2020-10-28T06:00:00.000Z', // since aggregation query results do not have timestamp properties suppression boundary start set as a first execution time
        [ALERT_SUPPRESSION_END]: '2020-10-28T06:30:00.000Z', // since aggregation query results do not have timestamp properties suppression boundary end set as a second execution time
        [ALERT_SUPPRESSION_DOCS_COUNT]: 1, // only one suppressed alert, since aggregation query produces one alert per rule execution, no matter how many events aggregated
      });
      expect(previewAlerts[0]._source).not.toHaveProperty(ALERT_ORIGINAL_TIME);
    });

    it('should suppress alerts by custom field, created in ES|QL query', async () => {
      const id = uuidv4();
      const firstTimestamp = '2020-10-28T05:45:00.000Z';
      const secondTimestamp = '2020-10-28T06:10:00.000Z';

      const firstExecutionDocuments = [
        {
          id,
          '@timestamp': firstTimestamp,
          host: { name: 'host-a' },
        },
        {
          id,
          '@timestamp': firstTimestamp,
          host: { name: 'host-b' },
        },
      ];
      const secondExecutionDocuments = [
        {
          host: { name: 'test-c' },
          id,
          '@timestamp': secondTimestamp,
        },
        {
          host: { name: 'host-d' },
          id,
          '@timestamp': secondTimestamp,
        },
        {
          host: { name: 'test-s' },
          id,
          '@timestamp': secondTimestamp,
        },
      ];

      await indexListOfDocuments([...firstExecutionDocuments, ...secondExecutionDocuments]);

      const rule: EsqlRuleCreateProps = {
        ...getCreateEsqlRulesSchemaMock('rule-1', true),
        // ES|QL query creates new field custom_field - prefix_host, prefix_test
        query: `from ecs_compliant metadata _id ${internalIdPipe(
          id
        )} | eval custom_field=concat("prefix_", left(host.name, 4))`,
        from: 'now-35m',
        interval: '30m',
        alert_suppression: {
          group_by: ['custom_field'],
          duration: {
            value: 60,
            unit: 'm',
          },
          missing_fields_strategy: 'suppress',
        },
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
      // lodash sortBy is used here because custom_field is non ECS and not mapped in alerts index, so can't be sorted by
      const sortedAlerts = sortBy(previewAlerts, '_source.custom_field');
      expect(previewAlerts).toHaveLength(2);

      expect(sortedAlerts[0]._source).toEqual({
        ...sortedAlerts[0]._source,
        [ALERT_SUPPRESSION_TERMS]: [
          {
            field: 'custom_field',
            value: 'prefix_host',
          },
        ],
        [ALERT_ORIGINAL_TIME]: firstTimestamp,
        [ALERT_SUPPRESSION_START]: firstTimestamp,
        [ALERT_SUPPRESSION_END]: secondTimestamp,
        [ALERT_SUPPRESSION_DOCS_COUNT]: 2,
      });

      expect(sortedAlerts[1]._source).toEqual({
        ...sortedAlerts[1]._source,
        [ALERT_SUPPRESSION_TERMS]: [
          {
            field: 'custom_field',
            value: 'prefix_test',
          },
        ],
        [ALERT_ORIGINAL_TIME]: secondTimestamp,
        [ALERT_SUPPRESSION_START]: secondTimestamp,
        [ALERT_SUPPRESSION_END]: secondTimestamp,
        [ALERT_SUPPRESSION_DOCS_COUNT]: 1,
      });
    });

    it('should suppress alerts by custom field, created in ES|QL query, when do not suppress missing fields configured', async () => {
      const id = uuidv4();
      const firstTimestamp = '2020-10-28T05:45:00.000Z';
      const secondTimestamp = '2020-10-28T06:10:00.000Z';

      const firstExecutionDocuments = [
        {
          id,
          '@timestamp': firstTimestamp,
          host: { name: 'host-a' },
        },
        {
          id,
          '@timestamp': firstTimestamp,
          host: { name: 'host-b' },
        },
      ];
      const secondExecutionDocuments = [
        {
          host: { name: 'test-c' },
          id,
          '@timestamp': secondTimestamp,
        },
        {
          host: { name: 'host-d' },
          id,
          '@timestamp': secondTimestamp,
        },
        {
          host: { name: 'test-s' },
          id,
          '@timestamp': secondTimestamp,
        },
      ];

      await indexListOfDocuments([...firstExecutionDocuments, ...secondExecutionDocuments]);

      const rule: EsqlRuleCreateProps = {
        ...getCreateEsqlRulesSchemaMock('rule-1', true),
        // ES|QL query creates new field custom_field - prefix_host, prefix_test
        query: `from ecs_compliant metadata _id ${internalIdPipe(
          id
        )} | eval custom_field=concat("prefix_", left(host.name, 4))`,
        from: 'now-35m',
        interval: '30m',
        alert_suppression: {
          group_by: ['custom_field'],
          duration: {
            value: 60,
            unit: 'm',
          },
          missing_fields_strategy: 'doNotSuppress',
        },
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
      // lodash sortBy is used here because custom_field is non ECS and not mapped in alerts index, so can't be sorted by
      const sortedAlerts = sortBy(previewAlerts, '_source.custom_field');
      expect(previewAlerts).toHaveLength(2);

      expect(sortedAlerts[0]._source).toEqual({
        ...sortedAlerts[0]._source,
        [ALERT_SUPPRESSION_TERMS]: [
          {
            field: 'custom_field',
            value: 'prefix_host',
          },
        ],
        [ALERT_ORIGINAL_TIME]: firstTimestamp,
        [ALERT_SUPPRESSION_START]: firstTimestamp,
        [ALERT_SUPPRESSION_END]: secondTimestamp,
        [ALERT_SUPPRESSION_DOCS_COUNT]: 2,
      });

      expect(sortedAlerts[1]._source).toEqual({
        ...sortedAlerts[1]._source,
        [ALERT_SUPPRESSION_TERMS]: [
          {
            field: 'custom_field',
            value: 'prefix_test',
          },
        ],
        [ALERT_ORIGINAL_TIME]: secondTimestamp,
        [ALERT_SUPPRESSION_START]: secondTimestamp,
        [ALERT_SUPPRESSION_END]: secondTimestamp,
        [ALERT_SUPPRESSION_DOCS_COUNT]: 1,
      });
    });

    it('should suppress by field, dropped in ES|QL query, but returned from source index', async () => {
      const id = uuidv4();
      const firstTimestamp = '2020-10-28T05:45:00.000Z';
      const secondTimestamp = '2020-10-28T06:10:00.000Z';

      const firstExecutionDocuments = [
        {
          id,
          '@timestamp': firstTimestamp,
          host: { name: 'host-a' },
        },
      ];
      const secondExecutionDocuments = [
        {
          host: { name: 'host-a' },
          id,
          '@timestamp': secondTimestamp,
        },
      ];

      await indexListOfDocuments([...firstExecutionDocuments, ...secondExecutionDocuments]);

      const rule: EsqlRuleCreateProps = {
        ...getCreateEsqlRulesSchemaMock('rule-1', true),
        query: `from ecs_compliant metadata _id ${internalIdPipe(id)} | drop host.name`,
        from: 'now-35m',
        interval: '30m',
        alert_suppression: {
          group_by: ['host.name'],
          duration: {
            value: 60,
            unit: 'm',
          },
          missing_fields_strategy: 'suppress',
        },
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
        [ALERT_SUPPRESSION_DOCS_COUNT]: 1,
      });
    });

    // even when field is dropped in ES|QL query it is returned from source document
    it('should not suppress alerts by field, dropped in ES|QL query, when do not suppress missing fields configured', async () => {
      const id = uuidv4();
      const firstTimestamp = '2020-10-28T05:45:00.000Z';
      const secondTimestamp = '2020-10-28T06:10:00.000Z';

      const firstExecutionDocuments = [
        {
          id,
          '@timestamp': firstTimestamp,
          host: { name: 'host-a' },
        },
        {
          id,
          '@timestamp': firstTimestamp,
        },
      ];
      const secondExecutionDocuments = [
        {
          host: { name: 'host-a' },
          id,
          '@timestamp': secondTimestamp,
        },
        {
          id,
          '@timestamp': firstTimestamp,
        },
      ];

      await indexListOfDocuments([...firstExecutionDocuments, ...secondExecutionDocuments]);

      const rule: EsqlRuleCreateProps = {
        ...getCreateEsqlRulesSchemaMock('rule-1', true),
        query: `from ecs_compliant metadata _id ${internalIdPipe(id)} | drop host.name`,
        from: 'now-35m',
        interval: '30m',
        alert_suppression: {
          group_by: ['host.name'],
          duration: {
            value: 60,
            unit: 'm',
          },
          missing_fields_strategy: 'doNotSuppress',
        },
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
      expect(previewAlerts).toHaveLength(3);

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

    describe('rule execution only', () => {
      it('should suppress alerts during rule execution only', async () => {
        const id = uuidv4();
        const timestamp = '2020-10-28T06:45:00.000Z';
        const laterTimestamp = '2020-10-28T06:50:00.000Z';

        const firstExecutionDocuments = [
          {
            host: { name: 'host-a' },
            id,
            '@timestamp': timestamp,
          },
          {
            host: { name: 'host-a' },
            id,
            '@timestamp': timestamp,
          },
          {
            host: { name: 'host-a' },
            id,
            '@timestamp': laterTimestamp,
          },
          // does not generate alert
          {
            host: { name: 'host-b' },
            id,
            '@timestamp': laterTimestamp,
          },
        ];

        await indexListOfDocuments(firstExecutionDocuments);

        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          query: `from ecs_compliant metadata _id, _index, _version ${internalIdPipe(
            id
          )} | where host.name=="host-a"`,
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
              value: 'host-a',
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

      it('should suppress alerts per rule execution for array field', async () => {
        const id = uuidv4();
        const timestamp = '2020-10-28T06:45:00.000Z';

        const firstExecutionDocuments = [
          {
            host: { name: ['host-a', 'host-b'] },
            id,
            '@timestamp': timestamp,
          },
          {
            host: { name: ['host-a', 'host-b'] },
            id,
            '@timestamp': timestamp,
          },
        ];

        await indexListOfDocuments([...firstExecutionDocuments]);

        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          query: getNonAggRuleQueryWithMetadata(id),
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
          [ALERT_SUPPRESSION_DOCS_COUNT]: 1,
        });
      });

      it('should suppress alerts with missing fields during rule execution only for multiple suppress by fields', async () => {
        const id = uuidv4();
        const timestamp = '2020-10-28T06:45:00.000Z';

        const firstExecutionDocuments = [
          // no missing fields
          {
            host: { name: 'host-a', ip: '127.0.0.11' },
            agent: { name: 'agent-a', version: 10 },
            id,
            '@timestamp': timestamp,
          },
          {
            host: { name: 'host-a', ip: '127.0.0.12' },
            agent: { name: 'agent-a', version: 10 },
            id,
            '@timestamp': timestamp,
          },
          // missing agent.name
          {
            host: { name: 'host-a', ip: '127.0.0.21' },
            agent: { version: 10 },
            id,
            '@timestamp': timestamp,
          },
          {
            host: { name: 'host-a', ip: '127.0.0.22' },
            agent: { version: 10 },
            id,
            '@timestamp': timestamp,
          },
          // missing agent.version
          {
            host: { name: 'host-a', ip: '127.0.0.31' },
            agent: { name: 'agent-a' },
            id,
            '@timestamp': timestamp,
          },
          {
            host: { name: 'host-a', ip: '127.0.0.32' },
            agent: { name: 'agent-a' },
            id,
            '@timestamp': timestamp,
          },
          // missing both agent.*
          {
            host: { name: 'host-a', ip: '127.0.0.41' },
            id,
            '@timestamp': timestamp,
          },
          {
            host: { name: 'host-a', ip: '127.0.0.42' },
            id,
            '@timestamp': timestamp,
          },
        ];

        await indexListOfDocuments(firstExecutionDocuments);

        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          query: getNonAggRuleQueryWithMetadata(id),
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
              value: 'agent-a',
            },
            {
              field: 'agent.version',
              value: '10',
            },
          ],
          [ALERT_SUPPRESSION_DOCS_COUNT]: 1,
        });

        expect(previewAlerts[1]._source).toEqual({
          ...previewAlerts[1]._source,
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

        expect(previewAlerts[2]._source).toEqual({
          ...previewAlerts[2]._source,
          [ALERT_SUPPRESSION_TERMS]: [
            {
              field: 'agent.name',
              value: null,
            },
            {
              field: 'agent.version',
              value: '10',
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

      it('should not suppress alerts with missing fields during rule execution only if configured so for multiple suppress by fields', async () => {
        const id = uuidv4();
        const timestamp = '2020-10-28T06:45:00.000Z';

        const firstExecutionDocuments = [
          // no missing fields
          {
            host: { name: 'host-a', ip: '127.0.0.11' },
            agent: { name: 'agent-a', version: 10 },
            id,
            '@timestamp': timestamp,
          },
          {
            host: { name: 'host-a', ip: '127.0.0.12' },
            agent: { name: 'agent-a', version: 10 },
            id,
            '@timestamp': timestamp,
          },
          // missing agent.name
          {
            host: { name: 'host-a', ip: '127.0.0.21' },
            agent: { version: 10 },
            id,
            '@timestamp': timestamp,
          },
          {
            host: { name: 'host-a', ip: '127.0.0.22' },
            agent: { version: 10 },
            id,
            '@timestamp': timestamp,
          },
          // missing agent.version
          {
            host: { name: 'host-a', ip: '127.0.0.31' },
            agent: { name: 'agent-a' },
            id,
            '@timestamp': timestamp,
          },
          {
            host: { name: 'host-a', ip: '127.0.0.32' },
            agent: { name: 'agent-a' },
            id,
            '@timestamp': timestamp,
          },
          // missing both agent.*
          {
            host: { name: 'host-a', ip: '127.0.0.41' },
            id,
            '@timestamp': timestamp,
          },
          {
            host: { name: 'host-a', ip: '127.0.0.42' },
            id,
            '@timestamp': timestamp,
          },
        ];

        await indexListOfDocuments(firstExecutionDocuments);

        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          query: getNonAggRuleQueryWithMetadata(id),
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
        // from 8 injected, only one should be suppressed
        expect(previewAlerts).toHaveLength(7);
        expect(previewAlerts[0]._source).toEqual({
          ...previewAlerts[0]._source,
          [ALERT_SUPPRESSION_TERMS]: [
            {
              field: 'agent.name',
              value: 'agent-a',
            },
            {
              field: 'agent.version',
              value: '10',
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

      it('should deduplicate alerts while suppressing new ones on rule execution', async () => {
        const id = uuidv4();
        const firstTimestamp = '2020-10-28T05:45:00.000Z';
        const secondTimestamp = '2020-10-28T06:10:00.000Z';

        const firstExecutionDocuments = [
          {
            host: { name: 'host-a' },
            id,
            '@timestamp': firstTimestamp,
          },
          {
            host: { name: 'host-a' },
            id,
            '@timestamp': firstTimestamp,
          },
        ];
        const secondExecutionDocuments = [
          {
            host: { name: 'host-a' },
            id,
            '@timestamp': secondTimestamp,
          },
          {
            host: { name: 'host-a' },
            id,
            '@timestamp': secondTimestamp,
          },
          {
            host: { name: 'host-a' },
            id,
            '@timestamp': secondTimestamp,
          },
        ];

        await indexListOfDocuments([...firstExecutionDocuments, ...secondExecutionDocuments]);

        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          query: getNonAggRuleQueryWithMetadata(id),
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
              value: 'host-a',
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
              value: 'host-a',
            },
          ],
          [ALERT_ORIGINAL_TIME]: secondTimestamp,
          [ALERT_SUPPRESSION_START]: secondTimestamp,
          [ALERT_SUPPRESSION_END]: secondTimestamp,
          [ALERT_SUPPRESSION_DOCS_COUNT]: 2,
        });
      });

      it('should not suppress more than limited number of alerts (max_signals)', async () => {
        const id = uuidv4();

        await indexGeneratedDocuments({
          docsCount: 12000,
          seed: (index) => ({
            id,
            '@timestamp': `2020-10-28T06:50:00.${index}Z`,
            host: {
              name: `host-${index}`,
            },
            agent: { name: 'agent-a' },
          }),
        });

        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          query: `from ecs_compliant metadata _id, _index, _version ${internalIdPipe(
            id
          )} | sort @timestamp asc`,
          alert_suppression: {
            group_by: ['agent.name'],
            missing_fields_strategy: 'suppress',
          },
          from: 'now-35m',
          interval: '30m',
          max_signals: 200,
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
          size: 1000,
        });
        expect(previewAlerts).toHaveLength(1);
        expect(previewAlerts[0]._source).toEqual({
          ...previewAlerts[0]._source,
          [ALERT_SUPPRESSION_TERMS]: [
            {
              field: 'agent.name',
              value: 'agent-a',
            },
          ],
          [ALERT_SUPPRESSION_DOCS_COUNT]: 200,
        });
      });

      it('should generate up to max_signals alerts', async () => {
        const id = uuidv4();
        const timestamp = '2020-10-28T06:05:00.000Z';

        await indexGeneratedDocuments({
          docsCount: 20000,
          seed: (index) => ({
            id,
            '@timestamp': timestamp,
            host: {
              name: `host-${index}`,
            },
            'agent.name': `agent-${index}`,
          }),
        });

        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          query: getNonAggRuleQueryWithMetadata(id),
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
          max_signals: 150,
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
        expect(previewAlerts).toHaveLength(150);
      });
    });

    describe('with exceptions', () => {
      afterEach(async () => {
        await deleteAllExceptions(supertest, log);
      });

      it('should apply exceptions', async () => {
        const id = uuidv4();
        const interval: [string, string] = ['2020-10-28T06:00:00.000Z', '2020-10-28T06:10:00.000Z'];
        const doc1 = { agent: { name: 'test-1' }, 'client.ip': '127.0.0.2' };
        const doc2 = { agent: { name: 'test-1' } };
        const doc3 = { agent: { name: 'test-1' }, 'client.ip': '127.0.0.1' };

        await indexEnhancedDocuments({ documents: [doc1, doc2, doc3], interval, id });

        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          query: `from ecs_compliant ${internalIdPipe(id)} | where agent.name=="test-1"`,
          from: 'now-1h',
          interval: '1h',
          alert_suppression: {
            group_by: ['agent.name'],
            missing_fields_strategy: 'suppress',
          },
        };

        const { previewId } = await previewRuleWithExceptionEntries({
          supertest,
          log,
          rule,
          timeframeEnd: new Date('2020-10-28T06:30:00.000Z'),
          entries: [
            [
              {
                field: 'client.ip',
                operator: 'included',
                type: 'match',
                value: '127.0.0.1',
              },
            ],
          ],
        });

        const previewAlerts = await getPreviewAlerts({ es, previewId });

        expect(previewAlerts).toHaveLength(1);
        expect(previewAlerts[0]._source).toEqual({
          ...previewAlerts[0]._source,
          [ALERT_SUPPRESSION_TERMS]: [
            {
              field: 'agent.name',
              value: 'test-1',
            },
          ],
          [ALERT_SUPPRESSION_DOCS_COUNT]: 1,
        });
      });
    });

    describe('alerts enrichment', () => {
      before(async () => {
        await entityStoreV2.setup({
          hosts: [
            {
              host: { name: 'host-0' },
              entity: {
                id: 'host:host-0',
                type: 'host',
                risk: { calculated_level: 'Low', calculated_score_norm: 1 },
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
        const interval: [string, string] = ['2020-10-28T06:00:00.000Z', '2020-10-28T06:10:00.000Z'];
        const doc1 = { host: { name: 'host-0' } };

        await indexEnhancedDocuments({ documents: [doc1, doc1], interval, id });

        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          query: `from ecs_compliant ${internalIdPipe(id)} | where host.name=="host-0"`,
          from: 'now-1h',
          interval: '1h',
          alert_suppression: {
            group_by: ['host.name'],
            missing_fields_strategy: 'suppress',
          },
        };

        const { previewId } = await previewRule({
          supertest,
          rule,
          timeframeEnd: new Date('2020-10-28T06:30:00.000Z'),
        });

        const previewAlerts = await getPreviewAlerts({ es, previewId });

        expect(previewAlerts).toHaveLength(1);

        expect(previewAlerts[0]._source).toHaveProperty('host.risk.calculated_level', 'Low');
        expect(previewAlerts[0]._source).toHaveProperty('host.risk.calculated_score_norm', 1);
      });
    });

    describe('with asset criticality', () => {
      before(async () => {
        await entityStoreV2.setup({
          hosts: [
            {
              host: { name: 'host-0' },
              entity: { id: 'host:host-0', type: 'host' },
              asset: { criticality: 'extreme_impact' },
            },
          ],
        });
      });

      after(async () => {
        await entityStoreV2.teardown();
      });

      it('should be enriched alert with criticality_level', async () => {
        const id = uuidv4();
        const interval: [string, string] = ['2020-10-28T06:00:00.000Z', '2020-10-28T06:10:00.000Z'];
        const doc1 = { host: { name: 'host-0' } };

        await indexEnhancedDocuments({ documents: [doc1, doc1], interval, id });

        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          query: `from ecs_compliant ${internalIdPipe(id)} | where host.name=="host-0"`,
          from: 'now-1h',
          interval: '1h',
          alert_suppression: {
            group_by: ['host.name'],
            missing_fields_strategy: 'suppress',
          },
        };

        const { previewId } = await previewRule({
          supertest,
          rule,
          timeframeEnd: new Date('2020-10-28T06:30:00.000Z'),
        });

        const previewAlerts = await getPreviewAlerts({ es, previewId });

        expect(previewAlerts).toHaveLength(1);

        expect(previewAlerts[0]?._source?.['host.asset.criticality']).toBe('extreme_impact');
      });
    });

    describe('mv_expand command', () => {
      it('should suppress alerts generated from expanded rows', async () => {
        const id = uuidv4();
        const interval: [string, string] = ['2020-10-28T06:00:00.000Z', '2020-10-28T06:10:00.000Z'];
        const documents = [
          { agent: { name: 'test-1', type: 'auditbeat' } },
          { agent: { name: ['part-0', 'part-1'], type: 'auditbeat' } },
        ];

        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          query: `from ecs_compliant metadata _id ${internalIdPipe(id)} | mv_expand agent.name`,
          from: 'now-1h',
          interval: '1h',
          alert_suppression: {
            group_by: ['agent.type'],
            missing_fields_strategy: 'suppress',
          },
        };

        await indexEnhancedDocuments({
          documents,
          interval,
          id,
        });

        const { previewId } = await previewRule({
          supertest,
          rule,
          timeframeEnd: new Date('2020-10-28T06:30:00.000Z'),
        });

        const previewAlerts = await getPreviewAlerts({ es, previewId });
        expect(previewAlerts).toHaveLength(1);
        expect(previewAlerts[0]._source).toHaveProperty([ALERT_SUPPRESSION_DOCS_COUNT], 2);
      });

      it('should suppress alerts generated from expanded rows when expanded field renamed', async () => {
        const id = uuidv4();
        const interval: [string, string] = ['2020-10-28T06:00:00.000Z', '2020-10-28T06:10:00.000Z'];
        const documents = [
          { agent: { name: 'test-1', type: 'auditbeat' } },
          { agent: { name: ['part-0', 'part-1'], type: 'auditbeat' } },
        ];

        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          query: `from ecs_compliant metadata _id ${internalIdPipe(
            id
          )} | mv_expand agent.name | rename agent.name as new_field`,
          from: 'now-1h',
          interval: '1h',
          alert_suppression: {
            group_by: ['agent.type'],
            missing_fields_strategy: 'suppress',
          },
        };

        await indexEnhancedDocuments({
          documents,
          interval,
          id,
        });

        const { previewId } = await previewRule({
          supertest,
          rule,
          timeframeEnd: new Date('2020-10-28T06:30:00.000Z'),
        });

        const previewAlerts = await getPreviewAlerts({ es, previewId });

        expect(previewAlerts).toHaveLength(1);
        expect(previewAlerts[0]._source).toHaveProperty([ALERT_SUPPRESSION_DOCS_COUNT], 2);
      });

      it('should NOT generate alerts per expanded row when expanded field dropped', async () => {
        const id = uuidv4();
        const interval: [string, string] = ['2020-10-28T06:00:00.000Z', '2020-10-28T06:10:00.000Z'];
        const documents = [
          { agent: { name: 'test-1', type: 'auditbeat' } },
          { agent: { name: ['part-0', 'part-1'], type: 'auditbeat' } },
        ];

        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          query: `from ecs_compliant metadata _id ${internalIdPipe(
            id
          )} | mv_expand agent.name | drop agent.name`,
          from: 'now-1h',
          interval: '1h',
          alert_suppression: {
            group_by: ['agent.type'],
            missing_fields_strategy: 'suppress',
          },
        };

        await indexEnhancedDocuments({
          documents,
          interval,
          id,
        });

        const { previewId } = await previewRule({
          supertest,
          rule,
          timeframeEnd: new Date('2020-10-28T06:30:00.000Z'),
        });

        const previewAlerts = await getPreviewAlerts({ es, previewId });

        expect(previewAlerts).toHaveLength(1);
        expect(previewAlerts[0]._source).toHaveProperty([ALERT_SUPPRESSION_DOCS_COUNT], 1);
      });

      it('should suppress alerts from expanded rows on interval', async () => {
        const id = uuidv4();
        const doc1 = {
          id,
          '@timestamp': '2020-10-28T05:45:00.000Z',
          agent: { name: ['part-0', 'part-1'], type: 'auditbeat' },
        };

        const doc2 = {
          id,
          '@timestamp': '2020-10-28T06:25:00.000Z',
          agent: { name: ['part-0', 'part-1'], type: 'auditbeat' },
        };

        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          // only _id and agent.name is projected at the end of query pipeline
          query: `from ecs_compliant metadata _id ${internalIdPipe(id)} | mv_expand agent.name`,
          from: 'now-35m',
          interval: '30m',
          alert_suppression: {
            group_by: ['agent.type'],
            missing_fields_strategy: 'suppress',
            duration: {
              value: 300,
              unit: 'm',
            },
          },
        };

        await indexListOfDocuments([doc1, doc2]);

        const { previewId } = await previewRule({
          supertest,
          rule,
          timeframeEnd: new Date('2020-10-28T06:30:00.000Z'),
          invocationCount: 2,
        });

        const previewAlerts = await getPreviewAlerts({
          es,
          previewId,
          size: 10,
        });

        expect(previewAlerts).toHaveLength(1);
        expect(previewAlerts[0]._source).toHaveProperty([ALERT_SUPPRESSION_DOCS_COUNT], 3);
      });

      it('should suppress alerts on interval when expanded field renamed', async () => {
        const id = uuidv4();
        const doc1 = {
          id,
          '@timestamp': '2020-10-28T05:45:00.000Z',
          agent: { name: ['part-0', 'part-1'], type: 'auditbeat' },
        };

        const doc2 = {
          id,
          '@timestamp': '2020-10-28T06:25:00.000Z',
          agent: { name: ['part-0', 'part-1'], type: 'auditbeat' },
        };

        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          // only _id and agent.name is projected at the end of query pipeline
          query: `from ecs_compliant metadata _id ${internalIdPipe(
            id
          )} | mv_expand agent.name  | rename agent.name as new_field`,
          from: 'now-35m',
          interval: '30m',
          alert_suppression: {
            group_by: ['agent.type'],
            missing_fields_strategy: 'suppress',
            duration: {
              value: 300,
              unit: 'm',
            },
          },
        };

        await indexListOfDocuments([doc1, doc2]);

        const { previewId } = await previewRule({
          supertest,
          rule,
          timeframeEnd: new Date('2020-10-28T06:30:00.000Z'),
          invocationCount: 2,
        });

        const previewAlerts = await getPreviewAlerts({
          es,
          previewId,
          size: 10,
        });

        expect(previewAlerts).toHaveLength(1);
        expect(previewAlerts[0]._source).toHaveProperty([ALERT_SUPPRESSION_DOCS_COUNT], 3);
      });
    });
  });
};
