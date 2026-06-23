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
import { getCreateNewTermsRulesSchemaMock } from '@kbn/security-solution-plugin/common/api/detection_engine/model/rule_schema/mocks';
import type { NewTermsRuleCreateProps } from '@kbn/security-solution-plugin/common/api/detection_engine';

import { DETECTION_ENGINE_SIGNALS_STATUS_URL as DETECTION_ENGINE_ALERTS_STATUS_URL } from '@kbn/security-solution-plugin/common/constants';

import { RuleExecutionStatusEnum } from '@kbn/security-solution-plugin/common/api/detection_engine/rule_monitoring';

import { ALERT_ORIGINAL_TIME } from '@kbn/security-solution-plugin/common/field_maps/field_names';
import { createRule } from '@kbn/detections-response-ftr-services';
import {
  getOpenAlerts,
  getPreviewAlerts,
  previewRule,
  previewRuleWithExceptionEntries,
  patchRule,
  setAlertStatus,
  dataGeneratorFactory,
} from '../../../../utils';
import type { FtrProviderContext } from '../../../../../../ftr_provider_context';
import { deleteAllExceptions } from '../../../../../lists_and_exception_lists/utils';
import { EsArchivePathBuilder } from '../../../../../../es_archive_path_builder';
import { EntityStoreV2EnrichmentSetup } from '../../entity_store_v2_enrichment_setup';

// host.id of the auditbeat record for zeek-newyork-sha-aa8df15 (first new term).
const ENRICHMENT_HOST_ID = '3729d06ce9964aa98549f41cbd99334d';
const ENRICHMENT_HOST_NAME = 'zeek-newyork-sha-aa8df15';
const ENRICHMENT_HOST_EUID = `host:${ENRICHMENT_HOST_ID}`;

export default ({ getService }: FtrProviderContext) => {
  const supertest = getService('supertest');
  const esArchiver = getService('esArchiver');
  const es = getService('es');
  const log = getService('log');
  const entityStoreV2 = EntityStoreV2EnrichmentSetup(getService);

  const { indexListOfDocuments, indexGeneratedDocuments } = dataGeneratorFactory({
    es,
    index: 'ecs_compliant',
    log,
  });

  const historicalWindowStart = '2019-10-13T05:00:04.000Z';

  // NOTE: Add to second quality gate after feature is GA
  describe('@ess @serverless New terms type rules, alert suppression', () => {
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

    it('should suppress an alert during real rule executions', async () => {
      const id = uuidv4();
      const firstTimestamp = new Date().toISOString();

      const rule: NewTermsRuleCreateProps = {
        ...getCreateNewTermsRulesSchemaMock('rule-1', true),
        new_terms_fields: ['host.ip'],
        alert_suppression: {
          group_by: ['host.name'],
          duration: {
            value: 300,
            unit: 'm',
          },
          missing_fields_strategy: 'suppress',
        },
        index: ['ecs_compliant'],
        history_window_start: historicalWindowStart,
        from: 'now-35m',
        interval: '30m',
        query: `id: "${id}"`,
      };

      const historicalDocuments = [
        {
          host: { name: 'host-0', ip: '127.0.0.1' },
          id,
          '@timestamp': historicalWindowStart,
        },
        {
          host: { name: 'host-0', ip: '127.0.0.2' },
          id,
          '@timestamp': historicalWindowStart,
        },
      ];

      const firstExecutionDocuments = [
        {
          host: { name: 'host-0', ip: '127.0.0.3' },
          id,
          '@timestamp': firstTimestamp,
        },
        {
          host: { name: 'host-0', ip: '127.0.0.3' },
          id,
          '@timestamp': firstTimestamp,
        },
        {
          host: { name: 'host-0', ip: '127.0.0.4' },
          id,
          '@timestamp': firstTimestamp,
        },
      ];

      await indexListOfDocuments([...historicalDocuments, ...firstExecutionDocuments]);

      const createdRule = await createRule(supertest, log, rule);
      const alerts = await getOpenAlerts(supertest, log, es, createdRule);
      expect(alerts.hits.hits).toHaveLength(1);

      expect(alerts.hits.hits[0]._source).toEqual(
        expect.objectContaining({
          [ALERT_SUPPRESSION_TERMS]: [
            {
              field: 'host.name',
              value: ['host-0'],
            },
          ],
          // suppression boundaries equal to original event time, since no alert been suppressed
          [ALERT_SUPPRESSION_START]: firstTimestamp,
          [ALERT_SUPPRESSION_END]: firstTimestamp,
          [ALERT_ORIGINAL_TIME]: firstTimestamp,
          [ALERT_SUPPRESSION_DOCS_COUNT]: 1,
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
      expect(secondAlerts.hits.hits.length).toEqual(1);
      expect(secondAlerts.hits.hits[0]._source).toEqual(
        expect.objectContaining({
          [ALERT_SUPPRESSION_TERMS]: [
            {
              field: 'host.name',
              value: ['host-0'],
            },
          ],
          [ALERT_ORIGINAL_TIME]: firstTimestamp, // timestamp is the same
          [ALERT_SUPPRESSION_START]: firstTimestamp, // suppression start is the same
          [ALERT_SUPPRESSION_END]: secondTimestamp, // suppression end is updated
          [ALERT_SUPPRESSION_DOCS_COUNT]: 2, // 2 alerts from second rule run, that's why 2 suppressed
        })
      );
    });

    it('should NOT suppress and update an alert if the alert is closed', async () => {
      const id = uuidv4();
      const firstTimestamp = new Date().toISOString();

      const rule: NewTermsRuleCreateProps = {
        ...getCreateNewTermsRulesSchemaMock(id, true),
        new_terms_fields: ['host.ip'],
        alert_suppression: {
          group_by: ['host.name'],
          duration: {
            value: 300,
            unit: 'm',
          },
          missing_fields_strategy: 'suppress',
        },
        index: ['ecs_compliant'],
        history_window_start: historicalWindowStart,
        from: 'now-35m',
        interval: '30m',
        query: `id: "${id}"`,
      };

      const historicalDocuments = [
        {
          host: { name: 'host-0', ip: '127.0.0.1' },
          id,
          '@timestamp': historicalWindowStart,
        },
        {
          host: { name: 'host-0', ip: '127.0.0.2' },
          id,
          '@timestamp': historicalWindowStart,
        },
      ];

      const firstExecutionDocuments = [
        {
          host: { name: 'host-0', ip: '127.0.0.3' },
          id,
          '@timestamp': firstTimestamp,
        },
      ];

      await indexListOfDocuments([...historicalDocuments, ...firstExecutionDocuments]);

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
          host: { name: 'host-0', ip: '127.0.0.5' },
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
      expect(secondAlerts.hits.hits.length).toEqual(1);
      expect(alerts.hits.hits[0]._source).toEqual(
        expect.objectContaining({
          [ALERT_SUPPRESSION_TERMS]: [
            {
              field: 'host.name',
              value: ['host-0'],
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

      const ruleWithoutSuppression: NewTermsRuleCreateProps = {
        ...getCreateNewTermsRulesSchemaMock(id, true),
        new_terms_fields: ['host.ip'],
        index: ['ecs_compliant'],
        history_window_start: historicalWindowStart,
        from: 'now-35m',
        interval: '30m',
        query: `id: "${id}"`,
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
          host: { name: 'host-0', ip: '127.0.0.3' },
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
      const secondExecutionDocuments = [
        {
          host: { name: 'host-0', ip: '127.0.0.5' },
          id,
          '@timestamp': secondTimestamp,
        },
        {
          host: { name: 'host-0', ip: '127.0.0.6' },
          id,
          '@timestamp': secondTimestamp,
        },
      ];

      await indexListOfDocuments(secondExecutionDocuments);

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
              value: ['host-0'],
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

      const historicalDocuments = [
        {
          host: { name: 'host-0', ip: '127.0.0.1' },
          id,
          '@timestamp': historicalWindowStart,
        },
      ];
      const firstExecutionDocuments = [
        {
          host: { name: 'host-0', ip: '127.0.0.3' },
          id,
          '@timestamp': firstTimestamp,
        },
      ];
      const secondExecutionDocuments = [
        {
          host: { name: 'host-0', ip: '127.0.0.5' },
          id,
          '@timestamp': secondTimestamp,
        },
      ];
      await indexListOfDocuments([
        ...historicalDocuments,
        ...firstExecutionDocuments,
        ...secondExecutionDocuments,
      ]);

      const rule: NewTermsRuleCreateProps = {
        ...getCreateNewTermsRulesSchemaMock('rule-1', true),
        new_terms_fields: ['host.ip'],
        alert_suppression: {
          group_by: ['host.name'],
          duration: {
            value: 20,
            unit: 'm',
          },
          missing_fields_strategy: 'suppress',
        },
        index: ['ecs_compliant'],
        history_window_start: historicalWindowStart,
        from: 'now-35m',
        interval: '30m',
        query: `id: "${id}"`,
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
              value: ['host-0'],
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
              value: ['host-0'],
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
      const historicalDocuments = [
        {
          host: { name: 'host-0', ip: '127.0.0.1' },
          id,
          '@timestamp': historicalWindowStart,
        },
      ];
      const firstExecutionDocuments = [
        {
          host: { name: 'host-0', ip: '127.0.0.3' },
          id,
          '@timestamp': firstTimestamp,
        },
        {
          host: { name: 'host-0', ip: '127.0.0.4' },
          id,
          '@timestamp': firstTimestamp,
        },
      ];
      const secondExecutionDocuments = [
        {
          host: { name: 'host-0', ip: '127.0.0.5' },
          id,
          '@timestamp': secondTimestamp,
        },
      ];
      const thirdExecutionDocuments = [
        {
          host: { name: 'host-0', ip: '127.0.0.7' },
          id,
          '@timestamp': thirdTimestamp,
        },
      ];

      await indexListOfDocuments([
        ...historicalDocuments,
        ...firstExecutionDocuments,
        ...secondExecutionDocuments,
        ...thirdExecutionDocuments,
      ]);

      const rule: NewTermsRuleCreateProps = {
        ...getCreateNewTermsRulesSchemaMock('rule-1', true),
        new_terms_fields: ['host.ip'],
        alert_suppression: {
          group_by: ['host.name'],
          duration: {
            value: 2,
            unit: 'h',
          },
          missing_fields_strategy: 'suppress',
        },
        index: ['ecs_compliant'],
        history_window_start: historicalWindowStart,
        from: 'now-35m',
        interval: '30m',
        query: `id: "${id}"`,
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
            value: ['host-0'],
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

      const historicalDocuments = [
        {
          host: { name: 'host-a', ip: '127.0.0.1' },
          'agent.version': 1,
          id,
          '@timestamp': historicalWindowStart,
        },
      ];
      const firstExecutionDocuments = [
        {
          host: { name: 'host-a', ip: '127.0.0.3' },
          id,
          '@timestamp': firstTimestamp,
          'agent.version': 1,
        },
        {
          host: { name: 'host-a', ip: '127.0.0.4' },
          id,
          '@timestamp': firstTimestamp,
          'agent.version': 2,
        },
        {
          host: { name: 'host-b', ip: '127.0.0.1' },
          id,
          '@timestamp': firstTimestamp,
          'agent.version': 2,
        },
      ];
      const secondExecutionDocuments = [
        {
          host: { name: 'host-a', ip: '127.0.0.10' },
          id,
          '@timestamp': secondTimestamp,
          'agent.version': 1,
        },
      ];

      await indexListOfDocuments([
        ...historicalDocuments,
        ...firstExecutionDocuments,
        ...secondExecutionDocuments,
      ]);

      const rule: NewTermsRuleCreateProps = {
        ...getCreateNewTermsRulesSchemaMock('rule-1', true),
        new_terms_fields: ['host.ip'],
        alert_suppression: {
          group_by: ['host.name', 'agent.version'],
          duration: {
            value: 2,
            unit: 'h',
          },
          missing_fields_strategy: 'suppress',
        },
        index: ['ecs_compliant'],
        history_window_start: historicalWindowStart,
        from: 'now-35m',
        interval: '30m',
        query: `id: "${id}"`,
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
        [ALERT_SUPPRESSION_DOCS_COUNT]: 1,
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
      const historicalDocuments = [
        {
          host: { name: 'host-a', ip: '127.0.0.1' },
          id,
          '@timestamp': historicalWindowStart,
        },
      ];
      const docWithoutOverride = {
        id,
        '@timestamp': firstTimestamp,
        host: { name: 'host-a', ip: '127.0.0.2' },
        event: {
          ingested: firstTimestamp,
        },
      };
      const docWithOverride = {
        ...docWithoutOverride,
        host: { name: 'host-a', ip: '127.0.0.3' },
        // This simulates a very late arriving doc
        '@timestamp': '2020-10-28T03:00:00.000Z',
        event: {
          ingested: secondTimestamp,
        },
      };

      await indexListOfDocuments([...historicalDocuments, docWithoutOverride, docWithOverride]);

      const rule: NewTermsRuleCreateProps = {
        ...getCreateNewTermsRulesSchemaMock('rule-1', true),
        new_terms_fields: ['host.ip'],
        alert_suppression: {
          group_by: ['host.name'],
          duration: {
            value: 2,
            unit: 'h',
          },
          missing_fields_strategy: 'suppress',
        },
        index: ['ecs_compliant'],
        history_window_start: historicalWindowStart,
        from: 'now-35m',
        interval: '30m',
        query: `id: "${id}"`,
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

      const historicalDocuments = [
        {
          host: { name: 'host-a', ip: '127.0.0.1' },
          'agent.version': 1,
          id,
          '@timestamp': historicalWindowStart,
        },
      ];
      const firstExecutionDocuments = [
        {
          host: { name: 'host-a', ip: '127.0.0.3' },
          id,
          '@timestamp': firstTimestamp,
        },
        {
          host: { name: 'host-a', ip: '127.0.0.4' },
          id,
          '@timestamp': firstTimestamp,
        },
      ];
      const secondExecutionDocuments = [
        {
          host: { name: 'host-a', ip: '127.0.0.5' },
          id,
          '@timestamp': secondTimestamp,
        },
        {
          host: { name: 'host-a', ip: '127.0.0.6' },
          id,
          '@timestamp': secondTimestamp,
        },
        {
          host: { name: 'host-a', ip: '127.0.0.7' },
          id,
          '@timestamp': secondTimestamp,
        },
      ];

      await indexListOfDocuments([
        ...historicalDocuments,
        ...firstExecutionDocuments,
        ...secondExecutionDocuments,
      ]);

      const rule: NewTermsRuleCreateProps = {
        ...getCreateNewTermsRulesSchemaMock('rule-1', true),
        new_terms_fields: ['host.ip'],
        query: `id: "${id}"`,
        index: ['ecs_compliant'],
        history_window_start: historicalWindowStart,
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
        [ALERT_SUPPRESSION_DOCS_COUNT]: 4,
      });
    });

    it('should suppress alerts with missing fields', async () => {
      const id = uuidv4();
      const firstTimestamp = '2020-10-28T05:45:00.000Z';
      const secondTimestamp = '2020-10-28T06:10:00.000Z';
      const historicalDocuments = [
        {
          host: { name: 'host-a', ip: '127.0.0.1' },
          'agent.version': 1,
          id,
          '@timestamp': historicalWindowStart,
        },
      ];

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

      await indexListOfDocuments([
        ...historicalDocuments,
        ...firstExecutionDocuments,
        ...secondExecutionDocuments,
      ]);

      const rule: NewTermsRuleCreateProps = {
        ...getCreateNewTermsRulesSchemaMock('rule-1', true),
        new_terms_fields: ['host.ip'],
        query: `id: "${id}"`,
        index: ['ecs_compliant'],
        history_window_start: historicalWindowStart,
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
      const historicalDocuments = [
        {
          host: { name: 'host-a', ip: '127.0.0.1' },
          'agent.version': 1,
          id,
          '@timestamp': historicalWindowStart,
        },
      ];

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

      await indexListOfDocuments([
        ...historicalDocuments,
        ...firstExecutionDocuments,
        ...secondExecutionDocuments,
      ]);

      const rule: NewTermsRuleCreateProps = {
        ...getCreateNewTermsRulesSchemaMock('rule-1', true),
        new_terms_fields: ['host.ip'],
        query: `id: "${id}"`,
        index: ['ecs_compliant'],
        history_window_start: historicalWindowStart,
        alert_suppression: {
          group_by: ['host.name'],
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
        sort: ['host.name', ALERT_ORIGINAL_TIME],
      });
      expect(previewAlerts.length).toEqual(4);
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

    it('should suppress alerts for multiple new terms', async () => {
      const id = uuidv4();
      const firstTimestamp = '2020-10-28T05:45:00.000Z';
      const secondTimestamp = '2020-10-28T06:10:00.000Z';

      const historicalDocuments = [
        {
          host: { name: 'host-a', ip: '127.0.0.1' },
          id,
          '@timestamp': historicalWindowStart,
        },
        {
          host: { name: 'host-a', ip: '127.0.0.2' },
          id,
          '@timestamp': historicalWindowStart,
        },
        {
          host: { name: 'host-b', ip: '127.0.0.3' },
          id,
          '@timestamp': historicalWindowStart,
        },
      ];
      const firstExecutionDocuments = [
        {
          host: { name: 'host-a', ip: '127.0.0.11' }, // new entrance of host.ip
          id,
          '@timestamp': firstTimestamp,
        },
        {
          host: { name: 'host-a', ip: '127.0.0.2' },
          id,
          '@timestamp': firstTimestamp,
        },
        {
          host: { name: 'host-b', ip: '127.0.0.1' }, // new combination of existing values
          id,
          '@timestamp': firstTimestamp,
        },
      ];
      const secondExecutionDocuments = [
        {
          host: { name: 'host-a', ip: '127.0.0.20' }, // new entrance of host.ip
          id,
          '@timestamp': secondTimestamp,
        },
        {
          host: { name: 'host-c', ip: '127.0.0.1' }, // new entrance of host.name
          id,
          '@timestamp': secondTimestamp,
        },
      ];

      await indexListOfDocuments([
        ...historicalDocuments,
        ...firstExecutionDocuments,
        ...secondExecutionDocuments,
      ]);

      const rule: NewTermsRuleCreateProps = {
        ...getCreateNewTermsRulesSchemaMock('rule-1', true),
        new_terms_fields: ['host.name', 'host.ip'],
        query: `id: "${id}"`,
        index: ['ecs_compliant'],
        history_window_start: historicalWindowStart,
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
        sort: ['host.name', 'host.ip', ALERT_ORIGINAL_TIME],
      });
      expect(previewAlerts.length).toEqual(3);
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
        'kibana.alert.new_terms': ['host-a', '127.0.0.11'],
      });
      expect(previewAlerts[1]._source).toEqual({
        ...previewAlerts[1]._source,
        [ALERT_SUPPRESSION_TERMS]: [
          {
            field: 'host.name',
            value: ['host-b'],
          },
        ],
        [ALERT_ORIGINAL_TIME]: firstTimestamp,
        [ALERT_SUPPRESSION_START]: firstTimestamp,
        [ALERT_SUPPRESSION_END]: firstTimestamp,
        [ALERT_SUPPRESSION_DOCS_COUNT]: 0,
        'kibana.alert.new_terms': ['host-b', '127.0.0.1'],
      });

      expect(previewAlerts[2]._source).toEqual({
        ...previewAlerts[2]._source,
        [ALERT_SUPPRESSION_TERMS]: [
          {
            field: 'host.name',
            value: ['host-c'],
          },
        ],
        [ALERT_ORIGINAL_TIME]: secondTimestamp,
        [ALERT_SUPPRESSION_START]: secondTimestamp,
        [ALERT_SUPPRESSION_END]: secondTimestamp,
        [ALERT_SUPPRESSION_DOCS_COUNT]: 0,
        'kibana.alert.new_terms': ['host-c', '127.0.0.1'],
      });
    });

    describe('rule execution only', () => {
      it('should suppress alerts during rule execution only', async () => {
        const id = uuidv4();
        const timestamp = '2020-10-28T06:45:00.000Z';
        const laterTimestamp = '2020-10-28T06:50:00.000Z';

        const historicalDocuments = [
          {
            host: { name: 'host-a', ip: '127.0.0.1' },
            id,
            '@timestamp': historicalWindowStart,
          },
        ];
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
          // does not generate alert
          {
            host: { name: 'host-a', ip: '127.0.0.1' },
            id,
            '@timestamp': laterTimestamp,
          },
        ];

        await indexListOfDocuments([...historicalDocuments, ...firstExecutionDocuments]);

        const rule: NewTermsRuleCreateProps = {
          ...getCreateNewTermsRulesSchemaMock('rule-1', true),
          new_terms_fields: ['host.ip'],
          query: `id: "${id}"`,
          index: ['ecs_compliant'],
          history_window_start: historicalWindowStart,
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

        const historicalDocuments = [
          {
            host: { name: ['host-a', 'host-b'], ip: '127.0.0.1' },
            id,
            '@timestamp': historicalWindowStart,
          },
        ];
        const firstExecutionDocuments = [
          {
            host: { name: ['host-a', 'host-b'], ip: '127.0.0.3' },
            id,
            '@timestamp': timestamp,
          },
          {
            host: { name: ['host-a', 'host-b'], ip: '127.0.0.4' },
            id,
            '@timestamp': timestamp,
          },
        ];

        await indexListOfDocuments([...historicalDocuments, ...firstExecutionDocuments]);

        const rule: NewTermsRuleCreateProps = {
          ...getCreateNewTermsRulesSchemaMock('rule-1', true),
          new_terms_fields: ['host.ip'],
          query: `id: "${id}"`,
          index: ['ecs_compliant'],
          history_window_start: historicalWindowStart,
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
          [ALERT_SUPPRESSION_DOCS_COUNT]: 1,
        });
      });

      it('should suppress alerts with missing fields during rule execution only for multiple suppress by fields', async () => {
        const id = uuidv4();
        const timestamp = '2020-10-28T06:45:00.000Z';

        const historicalDocuments = [
          {
            host: { name: 'host-a', ip: '127.0.0.1' },
            agent: { name: 'agent-a', version: 10 },
            id,
            '@timestamp': historicalWindowStart,
          },
        ];
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

        await indexListOfDocuments([...historicalDocuments, ...firstExecutionDocuments]);

        const rule: NewTermsRuleCreateProps = {
          ...getCreateNewTermsRulesSchemaMock('rule-1', true),
          new_terms_fields: ['host.ip'],
          query: `id: "${id}"`,
          index: ['ecs_compliant'],
          history_window_start: historicalWindowStart,
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

        const historicalDocuments = [
          {
            host: { name: 'host-a', ip: '127.0.0.1' },
            id,
            '@timestamp': historicalWindowStart,
          },
        ];
        const firstExecutionDocuments = [
          {
            host: { name: 'host-a', ip: '127.0.0.3' },
            agent: { name: 'agent-1' },
            id,
            '@timestamp': timestamp,
          },
          {
            host: { name: 'host-a', ip: '127.0.0.4' },
            agent: { name: 'agent-1' },
            id,
            '@timestamp': timestamp,
          },
          {
            host: { name: 'host-a', ip: '127.0.0.5' },
            id,
            '@timestamp': timestamp,
          },
          {
            host: { name: 'host-a', ip: '127.0.0.6' },
            id,
            '@timestamp': timestamp,
          },
        ];

        await indexListOfDocuments([...historicalDocuments, ...firstExecutionDocuments]);

        const rule: NewTermsRuleCreateProps = {
          ...getCreateNewTermsRulesSchemaMock('rule-1', true),
          new_terms_fields: ['host.ip'],
          query: `id: "${id}"`,
          index: ['ecs_compliant'],
          history_window_start: historicalWindowStart,
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

        const historicalDocuments = [
          {
            host: { name: 'host-a', ip: '127.0.0.1' },
            id,
            '@timestamp': historicalWindowStart,
          },
        ];
        const firstExecutionDocuments = [
          {
            host: { name: 'host-a', ip: '127.0.0.3' },
            agent: { name: 'agent-1' },
            id,
            '@timestamp': timestamp,
          },
          {
            host: { name: 'host-a', ip: '127.0.0.4' },
            agent: { name: 'agent-1' },
            id,
            '@timestamp': timestamp,
          },
          {
            host: { name: 'host-a', ip: '127.0.0.5' },
            id,
            '@timestamp': timestamp,
          },
          {
            host: { name: 'host-a', ip: '127.0.0.6' },
            id,
            '@timestamp': timestamp,
          },
        ];

        await indexListOfDocuments([...historicalDocuments, ...firstExecutionDocuments]);

        const rule: NewTermsRuleCreateProps = {
          ...getCreateNewTermsRulesSchemaMock('rule-1', true),
          new_terms_fields: ['host.ip'],
          query: `id: "${id}"`,
          index: ['ecs_compliant'],
          history_window_start: historicalWindowStart,
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

        const historicalDocuments = [
          {
            host: { name: 'host-a', ip: '127.0.0.1' },
            agent: { name: 'agent-a', version: 10 },
            id,
            '@timestamp': historicalWindowStart,
          },
        ];
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

        await indexListOfDocuments([...historicalDocuments, ...firstExecutionDocuments]);

        const rule: NewTermsRuleCreateProps = {
          ...getCreateNewTermsRulesSchemaMock('rule-1', true),
          new_terms_fields: ['host.ip'],
          query: `id: "${id}"`,
          index: ['ecs_compliant'],
          history_window_start: historicalWindowStart,
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
        expect(previewAlerts.length).toEqual(7);
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

      it('should deduplicate single alert while suppressing new ones on rule execution', async () => {
        const id = uuidv4();
        const firstTimestamp = '2020-10-28T05:45:00.000Z';
        const secondTimestamp = '2020-10-28T06:10:00.000Z';
        const historicalDocuments = [
          {
            host: { name: 'host-a', ip: '127.0.0.1' },
            'agent.version': 1,
            id,
            '@timestamp': historicalWindowStart,
          },
        ];
        const firstExecutionDocuments = [
          {
            host: { name: 'host-a', ip: '127.0.0.3' },
            id,
            '@timestamp': firstTimestamp,
          },
        ];
        const secondExecutionDocuments = [
          {
            host: { name: 'host-a', ip: '127.0.0.5' },
            id,
            '@timestamp': secondTimestamp,
          },
          {
            host: { name: 'host-a', ip: '127.0.0.6' },
            id,
            '@timestamp': secondTimestamp,
          },
          {
            host: { name: 'host-a', ip: '127.0.0.7' },
            id,
            '@timestamp': secondTimestamp,
          },
        ];

        await indexListOfDocuments([
          ...historicalDocuments,
          ...firstExecutionDocuments,
          ...secondExecutionDocuments,
        ]);

        const rule: NewTermsRuleCreateProps = {
          ...getCreateNewTermsRulesSchemaMock('rule-1', true),
          new_terms_fields: ['host.ip'],
          query: `id: "${id}"`,
          index: ['ecs_compliant'],
          history_window_start: historicalWindowStart,
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

      it('should not suppress more than limited number 500 (max_signals * 5) for single new terms field', async () => {
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

        const rule: NewTermsRuleCreateProps = {
          ...getCreateNewTermsRulesSchemaMock('rule-1', true),
          new_terms_fields: ['host.name'],
          query: `id: "${id}"`,
          index: ['ecs_compliant'],
          history_window_start: historicalWindowStart,
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
          size: 1000,
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

      it('should not suppress more than limited number 500 (max_signals * 5) for multiple new terms field', async () => {
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

        const rule: NewTermsRuleCreateProps = {
          ...getCreateNewTermsRulesSchemaMock('rule-1', true),
          new_terms_fields: ['host.name', 'agent.name'],
          query: `id: "${id}"`,
          index: ['ecs_compliant'],
          history_window_start: historicalWindowStart,
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
          size: 1000,
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

      it('should generate up to max_signals alerts for single new terms field', async () => {
        const id = uuidv4();
        const firstTimestamp = '2020-10-28T06:05:00.000Z';
        const secondTimestamp = '2020-10-28T06:10:00.000Z';

        await Promise.all(
          [firstTimestamp, secondTimestamp].map((t) =>
            indexGeneratedDocuments({
              docsCount: 20000,
              seed: (index) => ({
                id,
                '@timestamp': t,
                host: {
                  name: `host-${index}`,
                },
                'agent.name': `agent-${index % 10000}`,
              }),
            })
          )
        );

        const rule: NewTermsRuleCreateProps = {
          ...getCreateNewTermsRulesSchemaMock('rule-1', true),
          new_terms_fields: ['host.name'],
          query: `id: "${id}"`,
          index: ['ecs_compliant'],
          history_window_start: historicalWindowStart,
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

      it('should generate up to max_signals alerts for multiple new terms fields', async () => {
        const id = uuidv4();
        const firstTimestamp = '2020-10-28T06:05:00.000Z';
        const secondTimestamp = '2020-10-28T06:10:00.000Z';

        await Promise.all(
          [firstTimestamp, secondTimestamp].map((t) =>
            indexGeneratedDocuments({
              docsCount: 20000,
              seed: (index) => ({
                id,
                '@timestamp': t,
                host: {
                  name: `host-${index}`,
                },
                'agent.name': `agent-${index % 10000}`,
              }),
            })
          )
        );

        const rule: NewTermsRuleCreateProps = {
          ...getCreateNewTermsRulesSchemaMock('rule-1', true),
          new_terms_fields: ['host.name', 'agent.name'],
          query: `id: "${id}"`,
          index: ['ecs_compliant'],
          history_window_start: historicalWindowStart,
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
    });

    describe('with exceptions', () => {
      beforeEach(async () => {
        await deleteAllExceptions(supertest, log);
      });

      it('should apply exceptions when suppression configured during rule execution only', async () => {
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

        await indexListOfDocuments([...firstExecutionDocuments]);

        const rule: NewTermsRuleCreateProps = {
          ...getCreateNewTermsRulesSchemaMock('rule-1', true),
          new_terms_fields: ['host.ip'],
          query: `id: "${id}"`,
          index: ['ecs_compliant'],
          history_window_start: historicalWindowStart,
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
          [ALERT_SUPPRESSION_DOCS_COUNT]: 1,
        });
      });
    });

    describe('enrichment', () => {
      const config = getService('config');
      const isServerless = config.get('serverless');
      const dataPathBuilder = new EsArchivePathBuilder(isServerless);
      const path = dataPathBuilder.getPath('auditbeat/hosts');
      before(async () => {
        await esArchiver.load(path);
        await entityStoreV2.setup({
          hosts: [
            {
              host: { name: ENRICHMENT_HOST_NAME, id: [ENRICHMENT_HOST_ID] },
              entity: {
                id: ENRICHMENT_HOST_EUID,
                type: 'host',
                risk: { calculated_level: 'Low', calculated_score_norm: 23 },
              },
            },
            {
              host: { name: ENRICHMENT_HOST_NAME },
              entity: { id: `host:${ENRICHMENT_HOST_NAME}`, type: 'host' },
              asset: { criticality: 'medium_impact' },
            },
          ],
        });
      });

      after(async () => {
        await esArchiver.unload(path);
        await entityStoreV2.teardown();
      });

      it('should be enriched with host risk score', async () => {
        const rule: NewTermsRuleCreateProps = {
          ...getCreateNewTermsRulesSchemaMock('rule-1', true),
          new_terms_fields: ['host.name'],
          from: '2019-02-19T20:42:00.000Z',
          history_window_start: '2019-01-19T20:42:00.000Z',
          alert_suppression: {
            group_by: ['host.name'],
            missing_fields_strategy: 'suppress',
          },
        };

        const { previewId } = await previewRule({ supertest, rule });
        const previewAlerts = await getPreviewAlerts({ es, previewId });

        expect(previewAlerts[0]?._source?.host?.risk?.calculated_level).toBe('Low');
        expect(previewAlerts[0]?._source?.host?.risk?.calculated_score_norm).toBe(23);
      });

      it('should be enriched alert with criticality_level', async () => {
        const id = uuidv4();
        const timestamp = '2020-10-28T06:45:00.000Z';

        const firstExecutionDocuments = [
          {
            host: { name: 'zeek-newyork-sha-aa8df15', ip: '127.0.0.5' },
            id,
            '@timestamp': timestamp,
          },
        ];

        await indexListOfDocuments([...firstExecutionDocuments]);

        const rule: NewTermsRuleCreateProps = {
          ...getCreateNewTermsRulesSchemaMock('rule-1', true),
          new_terms_fields: ['host.name'],
          query: `id: "${id}"`,
          index: ['ecs_compliant'],
          history_window_start: historicalWindowStart,
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
};
