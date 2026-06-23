/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from 'expect';
import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';
import {
  ALERT_RULE_EXECUTION_TYPE,
  ALERT_SUPPRESSION_DOCS_COUNT,
  ALERT_RULE_UUID,
} from '@kbn/rule-data-utils';
import type { EsqlRuleCreateProps } from '@kbn/security-solution-plugin/common/api/detection_engine/model/rule_schema';
import { getCreateEsqlRulesSchemaMock } from '@kbn/security-solution-plugin/common/api/detection_engine/model/rule_schema/mocks';
import { RuleExecutionStatusEnum } from '@kbn/security-solution-plugin/common/api/detection_engine/rule_monitoring';
import {
  ALERT_ANCESTORS,
  ALERT_ORIGINAL_TIME,
} from '@kbn/security-solution-plugin/common/field_maps/field_names';

import {
  getMaxSignalsWarning as getMaxAlertsWarning,
  getMissingIdFieldWarning,
} from '@kbn/security-solution-plugin/server/lib/detection_engine/rule_types/utils/utils';
import {
  EXCLUDED_DATA_TIERS_FOR_RULE_EXECUTION,
  INCLUDED_DATA_STREAM_NAMESPACES_FOR_RULE_EXECUTION,
} from '@kbn/security-solution-plugin/common/constants';
import { deleteAllRules, deleteAllAlerts, createRule } from '@kbn/detections-response-ftr-services';
import {
  getPreviewAlerts,
  previewRule,
  getAlerts,
  dataGeneratorFactory,
  previewRuleWithExceptionEntries,
  removeRandomValuedPropertiesFromAlert,
  patchRule,
  runSoonRule,
  scheduleRuleRun,
  stopAllManualRuns,
  waitForBackfillExecuted,
  setAdvancedSettings,
  getOpenAlerts,
  setBrokenRuntimeField,
  unsetBrokenRuntimeField,
} from '../../../../utils';
import { deleteAllExceptions } from '../../../../../lists_and_exception_lists/utils';
import type { FtrProviderContext } from '../../../../../../ftr_provider_context';
import { EsArchivePathBuilder } from '../../../../../../es_archive_path_builder';
import { EntityStoreV2EnrichmentSetup } from '../../entity_store_v2_enrichment_setup';

export default ({ getService }: FtrProviderContext) => {
  const supertest = getService('supertest');
  const esArchiver = getService('esArchiver');
  const es = getService('es');
  const log = getService('log');
  const utils = getService('securitySolutionUtils');
  const entityStoreV2 = EntityStoreV2EnrichmentSetup(getService);

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

  describe('@ess @serverless ES|QL rule type', () => {
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

    // First test creates a real rule - remaining tests use preview API
    it('should generate 1 alert with during actual rule execution', async () => {
      const id = uuidv4();
      const username = await utils.getUsername();
      const interval: [string, string] = ['2020-10-28T06:00:00.000Z', '2020-10-28T06:10:00.000Z'];
      const doc1 = { agent: { name: 'test-1' } };
      const doc2 = { agent: { name: 'test-2' } };
      const ruleQuery = `from ecs_compliant metadata _id, _index, _version ${internalIdPipe(
        id
      )} | where agent.name=="test-1"`;
      const rule: EsqlRuleCreateProps = {
        ...getCreateEsqlRulesSchemaMock('rule-1', true),
        query: ruleQuery,
        from: '2020-10-28T06:00:00.000Z',
        interval: '1h',
      };

      await indexEnhancedDocuments({
        documents: [doc1, doc2],
        interval,
        id,
      });

      const createdRule = await createRule(supertest, log, rule);
      const alerts = await getAlerts(supertest, log, es, createdRule);

      expect(alerts.hits.hits).toHaveLength(1);
      expect(removeRandomValuedPropertiesFromAlert(alerts.hits.hits[0]._source)).toEqual({
        'kibana.alert.rule.parameters': {
          description: 'Detecting root and admin users',
          risk_score: 55,
          severity: 'high',
          author: [],
          false_positives: [],
          from: '2020-10-28T06:00:00.000Z',
          rule_id: 'rule-1',
          max_signals: 100,
          risk_score_mapping: [],
          severity_mapping: [],
          threat: [],
          to: 'now',
          references: [],
          version: 1,
          exceptions_list: [],
          immutable: false,
          rule_source: {
            type: 'internal',
          },
          related_integrations: [],
          required_fields: [],
          setup: '',
          type: 'esql',
          language: 'esql',
          query: ruleQuery,
        },
        'kibana.alert.rule.category': 'ES|QL Rule',
        'kibana.alert.rule.consumer': 'siem',
        'kibana.alert.rule.name': 'Query with a rule id',
        'kibana.alert.rule.producer': 'siem',
        'kibana.alert.rule.revision': 0,
        'kibana.alert.rule.rule_type_id': 'siem.esqlRule',
        'kibana.space_ids': ['default'],
        'kibana.alert.rule.tags': [],
        'agent.name': 'test-1',
        id,
        'event.kind': 'signal',
        'kibana.alert.original_time': expect.any(String),
        'kibana.alert.ancestors': [
          { id: expect.any(String), type: 'event', index: 'ecs_compliant', depth: 0 },
        ],
        'kibana.alert.status': 'active',
        'kibana.alert.workflow_status': 'open',
        'kibana.alert.depth': 1,
        'kibana.alert.reason': 'event created high alert Query with a rule id.',
        'kibana.alert.severity': 'high',
        'kibana.alert.risk_score': 55,
        'kibana.alert.rule.actions': [],
        'kibana.alert.rule.author': [],
        'kibana.alert.rule.created_by': username,
        'kibana.alert.rule.description': 'Detecting root and admin users',
        'kibana.alert.rule.enabled': true,
        'kibana.alert.rule.exceptions_list': [],
        'kibana.alert.rule.false_positives': [],
        'kibana.alert.rule.from': '2020-10-28T06:00:00.000Z',
        'kibana.alert.rule.immutable': false,
        'kibana.alert.rule.interval': '1h',
        'kibana.alert.rule.indices': ['ecs_compliant'],
        'kibana.alert.rule.max_signals': 100,
        'kibana.alert.rule.references': [],
        'kibana.alert.rule.risk_score_mapping': [],
        'kibana.alert.rule.rule_id': 'rule-1',
        'kibana.alert.rule.severity_mapping': [],
        'kibana.alert.rule.threat': [],
        'kibana.alert.rule.to': 'now',
        'kibana.alert.rule.type': 'esql',
        'kibana.alert.rule.updated_by': username,
        'kibana.alert.rule.version': 1,
        'kibana.alert.workflow_tags': [],
        'kibana.alert.workflow_assignee_ids': [],
        'kibana.alert.rule.risk_score': 55,
        'kibana.alert.rule.severity': 'high',
        'kibana.alert.rule.execution.type': 'scheduled',
      });
    });

    it('should generate 1 alert', async () => {
      const id = uuidv4();
      const interval: [string, string] = ['2020-10-28T06:00:00.000Z', '2020-10-28T06:10:00.000Z'];
      const doc1 = { agent: { name: 'test-1' } };
      const doc2 = { agent: { name: 'test-2' } };

      const rule: EsqlRuleCreateProps = {
        ...getCreateEsqlRulesSchemaMock('rule-1', true),
        query: `from ecs_compliant ${internalIdPipe(id)} | where agent.name=="test-1"`,
        from: 'now-1h',
        interval: '1h',
      };

      await indexEnhancedDocuments({
        documents: [doc1, doc2],
        interval,
        id,
      });

      const { previewId } = await previewRule({
        supertest,
        rule,
        timeframeEnd: new Date('2020-10-28T06:30:00.000Z'),
      });

      const previewAlerts = await getPreviewAlerts({
        es,
        previewId,
        size: 10,
      });

      expect(previewAlerts).toHaveLength(1);
      expect(previewAlerts[0]._source).toEqual(
        expect.objectContaining({
          'agent.name': 'test-1',
        })
      );
    });

    it('should not generate alerts out of rule execution time interval', async () => {
      const id = uuidv4();
      const interval: [string, string] = ['2020-10-28T06:00:00.000Z', '2020-10-28T06:10:00.000Z'];
      const doc1 = { agent: { name: 'test-1' } };
      const doc2 = { agent: { name: 'test-2' } };

      const rule: EsqlRuleCreateProps = {
        ...getCreateEsqlRulesSchemaMock('rule-1', true),
        query: `from ecs_compliant ${internalIdPipe(id)} | where agent.name=="test-1"`,
        from: 'now-1h',
        interval: '1h',
      };

      await indexEnhancedDocuments({ documents: [doc1, doc1, doc1, doc2, doc2], interval, id });
      await indexEnhancedDocuments({ documents: [doc1, doc2], id });

      const { previewId } = await previewRule({
        supertest,
        rule,
        timeframeEnd: new Date('2020-10-28T06:30:00.000Z'),
      });

      const previewAlerts = await getPreviewAlerts({
        es,
        previewId,
        size: 10,
      });

      expect(previewAlerts).toHaveLength(3);
    });

    describe('non-aggregating query rules', () => {
      describe('auto-inject metadata _id', () => {
        it('should deduplicate alerts when query omits METADATA clause (auto-injected)', async () => {
          const id = uuidv4();
          const doc1 = {
            id,
            '@timestamp': '2020-10-28T05:55:00.000Z',
            agent: { name: 'test-1' },
          };

          const rule: EsqlRuleCreateProps = {
            ...getCreateEsqlRulesSchemaMock('rule-1', true),
            query: `from ecs_compliant ${internalIdPipe(id)} | where agent.name=="test-1"`,
            from: 'now-45m',
            interval: '30m',
          };

          await indexListOfDocuments([doc1]);

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
        });

        it('should deduplicate alerts when KEEP without _id is used (auto-injected)', async () => {
          const id = uuidv4();
          const doc1 = {
            id,
            '@timestamp': '2020-10-28T05:55:00.000Z',
            agent: { name: 'test-1' },
          };

          const rule: EsqlRuleCreateProps = {
            ...getCreateEsqlRulesSchemaMock('rule-1', true),
            query: `from ecs_compliant ${internalIdPipe(id)} | keep agent.name`,
            from: 'now-45m',
            interval: '30m',
          };

          await indexListOfDocuments([doc1]);

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
        });
      });
      it('should add source document to alert', async () => {
        const id = uuidv4();
        const interval: [string, string] = ['2020-10-28T06:00:00.000Z', '2020-10-28T06:10:00.000Z'];
        const doc1 = {
          agent: { name: 'test-1', version: '2', type: 'auditbeat' },
          host: { name: 'my-host' },
          client: { ip: '127.0.0.1' },
        };

        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          // only _id and agent.name is projected at the end of query pipeline
          query: `from ecs_compliant metadata _id ${internalIdPipe(id)} | keep _id, agent.name`,
          from: 'now-1h',
          interval: '1h',
        };

        await indexEnhancedDocuments({
          documents: [doc1],
          interval,
          id,
        });

        const { previewId } = await previewRule({
          supertest,
          rule,
          timeframeEnd: new Date('2020-10-28T06:30:00.000Z'),
        });

        const previewAlerts = await getPreviewAlerts({
          es,
          previewId,
          size: 10,
        });

        expect(previewAlerts).toHaveLength(1);
        // all fields from source document should be returned
        expect(previewAlerts[0]._source).toEqual(
          expect.objectContaining({
            'agent.name': 'test-1',
            agent: { version: '2', type: 'auditbeat' },
            host: { name: 'my-host' },
            client: { ip: '127.0.0.1' },
          })
        );
      });

      it('should deduplicate alerts correctly based on source document _id', async () => {
        const id = uuidv4();
        // document will fall into 2 rule execution windows
        const doc1 = {
          id,
          '@timestamp': '2020-10-28T05:55:00.000Z',
          agent: { name: 'test-1', type: 'auditbeat' },
        };

        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          // only _id and agent.name is projected at the end of query pipeline
          query: `from ecs_compliant metadata _id ${internalIdPipe(id)} | keep _id, agent.name`,
          from: 'now-45m',
          interval: '30m',
        };

        await indexListOfDocuments([doc1]);

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
      });
    });

    describe('esql query specific syntax', () => {
      it('should return only specified in query fields', async () => {
        const id = uuidv4();
        const interval: [string, string] = ['2020-10-28T06:00:00.000Z', '2020-10-28T06:10:00.000Z'];
        const doc1 = { agent: { name: 'test-1', type: 'auditbeat' } };

        // ESQL query drops agent type and renames agent.name
        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          query: `from ecs_compliant ${internalIdPipe(
            id
          )} | where agent.name=="test-1" | stats count() by agent.name | rename agent.name as custom_named_agent`,
          from: 'now-1h',
          interval: '1h',
        };

        await indexEnhancedDocuments({
          documents: [doc1],
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
        expect(previewAlerts[0]._source).toHaveProperty('custom_named_agent', 'test-1');
        expect(previewAlerts[0]._source).not.toHaveProperty(['agent.name']);
        expect(previewAlerts[0]._source).not.toHaveProperty('agent.name');
        expect(previewAlerts[0]._source).not.toHaveProperty(['agent.type']);
        expect(previewAlerts[0]._source).not.toHaveProperty('agent.type');
      });

      describe('mv_expand command', () => {
        it('should generate alert per expanded row', async () => {
          const id = uuidv4();
          const interval: [string, string] = [
            '2020-10-28T06:00:00.000Z',
            '2020-10-28T06:10:00.000Z',
          ];
          const documents = [
            { agent: { name: 'test-1', type: 'auditbeat' } },
            { agent: { name: ['part-0', 'part-1'], type: 'auditbeat' } },
          ];

          const rule: EsqlRuleCreateProps = {
            ...getCreateEsqlRulesSchemaMock('rule-1', true),
            query: `from ecs_compliant metadata _id ${internalIdPipe(id)} | mv_expand agent.name`,
            from: 'now-1h',
            interval: '1h',
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

          expect(previewAlerts).toHaveLength(3);
          expect(previewAlerts.map((_) => _._source?.['agent.name'])).toEqual(
            expect.arrayContaining(['part-0', 'part-1', 'test-1'])
          );
        });

        it('should generate alert per expanded row when expanded field renamed', async () => {
          const id = uuidv4();
          const interval: [string, string] = [
            '2020-10-28T06:00:00.000Z',
            '2020-10-28T06:10:00.000Z',
          ];
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

          expect(previewAlerts).toHaveLength(3);
        });

        //  When expanded field dropped, ES|QL response rows will be identical.
        //  In this case, identical duplicated alerts won't be created
        it('should NOT generate alert per expanded row when expanded field dropped', async () => {
          const id = uuidv4();
          const interval: [string, string] = [
            '2020-10-28T06:00:00.000Z',
            '2020-10-28T06:10:00.000Z',
          ];
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

          expect(previewAlerts).toHaveLength(2);
        });

        it('should generate alert per expanded row when mv_expand used multiple times', async () => {
          const id = uuidv4();
          const interval: [string, string] = [
            '2020-10-28T06:00:00.000Z',
            '2020-10-28T06:10:00.000Z',
          ];
          const documents = [
            { agent: { name: 'test-1', type: 'auditbeat' } },
            { agent: { name: 'test-1', type: 'auditbeat' }, 'host.name': ['host-0', 'host-1'] },
            {
              agent: { name: ['part-0', 'part-1'], type: 'auditbeat' },
              'host.name': ['host-2', 'host-3'],
            },
          ];

          const rule: EsqlRuleCreateProps = {
            ...getCreateEsqlRulesSchemaMock('rule-1', true),
            query: `from ecs_compliant metadata _id ${internalIdPipe(
              id
            )} | mv_expand agent.name | mv_expand host.name`,
            from: 'now-1h',
            interval: '1h',
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

          expect(previewAlerts).toHaveLength(7);
          expect(previewAlerts.map((_) => _._source?.['agent.name'])).toEqual(
            expect.arrayContaining(['part-0', 'part-1', 'test-1'])
          );
          expect(previewAlerts.map((_) => _._source?.['host.name'])).toEqual(
            expect.arrayContaining([undefined, 'host-0', 'host-1', 'host-2', 'host-3'])
          );
        });

        it('should deduplicate alerts generated from expanded rows', async () => {
          const id = uuidv4();
          // document will fall into 2 rule execution windows
          const doc1 = {
            id,
            '@timestamp': '2020-10-28T05:55:00.000Z',
            agent: { name: ['part-0', 'part-1'], type: 'auditbeat' },
          };

          const rule: EsqlRuleCreateProps = {
            ...getCreateEsqlRulesSchemaMock('rule-1', true),
            query: `from ecs_compliant metadata _id ${internalIdPipe(id)} | mv_expand agent.name`,
            from: 'now-45m',
            interval: '30m',
          };

          await indexListOfDocuments([doc1]);

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

          expect(previewAlerts).toHaveLength(2);
        });

        it('should deduplicate alerts generated form expanded rows when expanded field renamed', async () => {
          const id = uuidv4();
          // document will fall into 2 rule execution windows
          const doc1 = {
            id,
            '@timestamp': '2020-10-28T05:55:00.000Z',
            agent: { name: ['part-0', 'part-1'], type: 'auditbeat' },
          };

          const rule: EsqlRuleCreateProps = {
            ...getCreateEsqlRulesSchemaMock('rule-1', true),
            query: `from ecs_compliant metadata _id ${internalIdPipe(
              id
            )} | mv_expand agent.name | rename agent.name as new_field`,
            from: 'now-45m',
            interval: '30m',
          };

          await indexListOfDocuments([doc1]);

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

          expect(previewAlerts).toHaveLength(2);
        });

        it('should deduplicate alert when expanded field dropped', async () => {
          const id = uuidv4();
          // document will fall into 2 rule execution windows
          const doc1 = {
            id,
            '@timestamp': '2020-10-28T05:55:00.000Z',
            agent: { name: ['part-0', 'part-1'], type: 'auditbeat' },
          };

          const rule: EsqlRuleCreateProps = {
            ...getCreateEsqlRulesSchemaMock('rule-1', true),
            query: `from ecs_compliant metadata _id ${internalIdPipe(
              id
            )} | mv_expand agent.name | drop agent.name`,
            from: 'now-45m',
            interval: '30m',
          };

          await indexListOfDocuments([doc1]);

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
        });

        describe('pagination', () => {
          it('should create alerts from expanded values', async () => {
            const id = uuidv4();
            const rule: EsqlRuleCreateProps = {
              ...getCreateEsqlRulesSchemaMock(`rule-${id}`, true),
              query: `from ecs_compliant metadata _id ${internalIdPipe(id)} | mv_expand agent.name`,
              from: '2020-10-28T05:15:00.000Z',
              to: '2020-10-28T06:00:00.000Z',
              interval: '45m',
              max_signals: 100,
              enabled: true,
            };

            const doc1 = {
              id,
              '@timestamp': '2020-10-28T05:55:00.000Z',
              agent: {
                name: Array.from({ length: 80 }, (_, i) => `test_1_${1000 + i}`),
                type: 'auditbeat',
              },
            };
            const doc2 = {
              id,
              '@timestamp': '2020-10-28T05:55:00.000Z',
              agent: {
                name: Array.from({ length: 40 }, (_, i) => `test_2_${1000 + i}`),
                type: 'auditbeat',
              },
            };
            await indexListOfDocuments([doc1, doc2]);

            const createdRule = await createRule(supertest, log, rule);

            const alertsResponseFromFirstRuleExecution = await getOpenAlerts(
              supertest,
              log,
              es,
              createdRule,
              // rule has warning, alerts were truncated, thus "partial failure" status
              RuleExecutionStatusEnum['partial failure'],
              200
            );

            expect(alertsResponseFromFirstRuleExecution.hits.hits).toHaveLength(100);

            // re-trigger rule execution
            await runSoonRule(supertest, createdRule.id);

            const alertsResponse = await getOpenAlerts(
              supertest,
              log,
              es,
              createdRule,
              RuleExecutionStatusEnum.succeeded,
              300,
              new Date()
            );

            expect(alertsResponse.hits.hits).toHaveLength(120);
          });

          it('should create alerts from all events(2 x max_signals)', async () => {
            const id = uuidv4();
            const rule: EsqlRuleCreateProps = {
              ...getCreateEsqlRulesSchemaMock(`rule-${id}`, true),
              query: `from ecs_compliant metadata _id ${internalIdPipe(id)}`,
              from: '2020-10-28T05:15:00.000Z',
              to: new Date().toISOString(),
              max_signals: 100,
              enabled: true,
            };

            const docs = Array.from({ length: 200 }, (_, i) => ({
              id,
              '@timestamp': '2020-10-28T05:55:00.000Z',
              agent: {
                name: `test_${i}`,
                type: 'auditbeat',
              },
            }));

            await indexListOfDocuments(docs);

            const createdRule = await createRule(supertest, log, rule);

            const alertsResponseFromFirstRuleExecution = await getOpenAlerts(
              supertest,
              log,
              es,
              createdRule,
              // rule has warning, alerts were truncated, thus "partial failure" status
              RuleExecutionStatusEnum['partial failure'],
              200
            );
            expect(alertsResponseFromFirstRuleExecution.hits.hits).toHaveLength(100);

            // re-trigger rule execution
            await patchRule(supertest, log, {
              id: createdRule.id,
              enabled: false,
            });
            await patchRule(supertest, log, {
              id: createdRule.id,
              to: new Date().toISOString(),
              enabled: true,
            });

            const alertsResponse = await getOpenAlerts(
              supertest,
              log,
              es,
              createdRule,
              RuleExecutionStatusEnum.succeeded,
              300,
              new Date()
            );

            expect(alertsResponse.hits.hits).toHaveLength(200);
          });

          it('should create alerts from all events(2 x max_signals) when used timestamp override', async () => {
            const id = uuidv4();
            const rule: EsqlRuleCreateProps = {
              ...getCreateEsqlRulesSchemaMock(`rule-${id}`, true),
              query: `from ecs_compliant metadata _id ${internalIdPipe(id)}`,
              from: '2020-10-28T05:15:00.000Z',
              to: new Date().toISOString(),
              max_signals: 100,
              enabled: true,
              timestamp_override: 'event.ingested',
              timestamp_override_fallback_disabled: false,
            };

            const docs = Array.from({ length: 200 }, (_, i) => ({
              id,
              '@timestamp': '2019-10-28T05:55:00.000Z',
              agent: {
                name: `test_${i}`,
                type: 'auditbeat',
              },
              'event.ingested': '2020-10-28T05:55:00.000Z',
            }));

            await indexListOfDocuments(docs);

            const createdRule = await createRule(supertest, log, rule);

            const alertsResponseFromFirstRuleExecution = await getOpenAlerts(
              supertest,
              log,
              es,
              createdRule,
              // rule has warning, alerts were truncated, thus "partial failure" status
              RuleExecutionStatusEnum['partial failure'],
              200
            );
            expect(alertsResponseFromFirstRuleExecution.hits.hits).toHaveLength(100);

            // re-trigger rule execution
            await patchRule(supertest, log, {
              id: createdRule.id,
              enabled: false,
            });
            await patchRule(supertest, log, {
              id: createdRule.id,
              to: new Date().toISOString(),
              enabled: true,
            });

            const alertsResponse = await getOpenAlerts(
              supertest,
              log,
              es,
              createdRule,
              RuleExecutionStatusEnum.succeeded,
              300,
              new Date()
            );

            expect(alertsResponse.hits.hits).toHaveLength(200);
          });

          it('should create alerts from all events(2 x max_signals) when used timestamp override without fallback', async () => {
            const id = uuidv4();
            const rule: EsqlRuleCreateProps = {
              ...getCreateEsqlRulesSchemaMock(`rule-${id}`, true),
              query: `from ecs_compliant metadata _id ${internalIdPipe(id)}`,
              from: '2020-10-28T05:15:00.000Z',
              to: new Date().toISOString(),
              max_signals: 100,
              enabled: true,
              timestamp_override: 'event.ingested',
              timestamp_override_fallback_disabled: true,
            };

            const docs = Array.from({ length: 200 }, (_, i) => ({
              id,
              '@timestamp': '2019-10-28T05:55:00.000Z',
              agent: {
                name: `test_${i}`,
                type: 'auditbeat',
              },
              'event.ingested': '2020-10-28T05:55:00.000Z',
            }));

            await indexListOfDocuments(docs);

            const createdRule = await createRule(supertest, log, rule);

            const alertsResponseFromFirstRuleExecution = await getOpenAlerts(
              supertest,
              log,
              es,
              createdRule,
              // rule has warning, alerts were truncated, thus "partial failure" status
              RuleExecutionStatusEnum['partial failure'],
              200
            );
            expect(alertsResponseFromFirstRuleExecution.hits.hits).toHaveLength(100);

            // re-trigger rule execution
            await patchRule(supertest, log, {
              id: createdRule.id,
              enabled: false,
            });
            await patchRule(supertest, log, {
              id: createdRule.id,
              to: new Date().toISOString(),
              enabled: true,
            });

            const alertsResponse = await getOpenAlerts(
              supertest,
              log,
              es,
              createdRule,
              RuleExecutionStatusEnum.succeeded,
              300,
              new Date()
            );

            expect(alertsResponse.hits.hits).toHaveLength(200);
          });

          it('should not create more than max_signals alerts from single document when paginate through results', async () => {
            const id = uuidv4();
            const rule: EsqlRuleCreateProps = {
              ...getCreateEsqlRulesSchemaMock(`rule-${id}`, true),
              query: `from ecs_compliant metadata _id ${internalIdPipe(id)} | mv_expand agent.name`,
              from: '2020-10-28T05:15:00.000Z',
              to: '2020-10-28T06:00:00.000Z',
              interval: '45m',
              max_signals: 100,
              enabled: true,
            };

            const doc1 = {
              id,
              '@timestamp': '2020-10-28T05:55:00.000Z',
              agent: {
                name: Array.from({ length: 150 }, (_, i) => `test_1_${1000 + i}`),
                type: 'auditbeat',
              },
            };
            const doc2 = {
              id,
              '@timestamp': '2020-10-28T05:55:00.000Z',
              agent: {
                name: Array.from({ length: 200 }, (_, i) => `test_2_${1000 + i}`),
                type: 'filebeat',
              },
            };

            await indexListOfDocuments([doc1, doc2]);

            const createdRule = await createRule(supertest, log, rule);

            const alertsResponseFromFirstRuleExecution = await getOpenAlerts(
              supertest,
              log,
              es,
              createdRule,
              // rule has warning, alerts were truncated, thus "partial failure" status
              RuleExecutionStatusEnum['partial failure'],
              200
            );

            expect(alertsResponseFromFirstRuleExecution.hits.hits).toHaveLength(100);

            // re-trigger rule execution
            await runSoonRule(supertest, createdRule.id);

            const alertsResponse = await getOpenAlerts(
              supertest,
              log,
              es,
              createdRule,
              // rule has warning, alerts were truncated, thus "partial failure" status
              RuleExecutionStatusEnum['partial failure'],
              300,
              new Date()
            );

            expect(alertsResponse.hits.hits).toHaveLength(200);

            const agentTypeCounts = alertsResponse.hits.hits.reduce<Record<string, number>>(
              (acc, curr) => {
                const agentType = curr._source?.['agent.type'] as string;
                if (agentType) {
                  acc[agentType] = (acc[agentType] || 0) + 1;
                }
                return acc;
              },
              {}
            );

            expect(agentTypeCounts).toEqual({
              auditbeat: 100,
              filebeat: 100,
            });
          });

          it('should create alerts from expanded values when expanded field renamed', async () => {
            const id = uuidv4();
            const rule: EsqlRuleCreateProps = {
              ...getCreateEsqlRulesSchemaMock(`rule-${id}`, true),
              query: `from ecs_compliant metadata _id ${internalIdPipe(
                id
              )} | mv_expand agent.name | rename agent.name as new_field`,
              from: '2020-10-28T05:15:00.000Z',
              to: '2020-10-28T06:00:00.000Z',
              interval: '45m',
              max_signals: 100,
              enabled: true,
            };

            const doc1 = {
              id,
              '@timestamp': '2020-10-28T05:55:00.000Z',
              agent: {
                name: Array.from({ length: 80 }, (_, i) => `test_1_${1000 + i}`),
                type: 'auditbeat',
              },
            };
            const doc2 = {
              id,
              '@timestamp': '2020-10-28T05:55:00.000Z',
              agent: {
                name: Array.from({ length: 40 }, (_, i) => `test_2_${1000 + i}`),
                type: 'auditbeat',
              },
            };
            await indexListOfDocuments([doc1, doc2]);

            const createdRule = await createRule(supertest, log, rule);

            const alertsResponseFromFirstRuleExecution = await getOpenAlerts(
              supertest,
              log,
              es,
              createdRule,
              // rule has warning, alerts were truncated, thus "partial failure" status
              RuleExecutionStatusEnum['partial failure'],
              200
            );

            expect(alertsResponseFromFirstRuleExecution.hits.hits).toHaveLength(100);

            // re-trigger rule execution
            await runSoonRule(supertest, createdRule.id);

            const alertsResponse = await getOpenAlerts(
              supertest,
              log,
              es,
              createdRule,
              RuleExecutionStatusEnum.succeeded,
              300,
              new Date()
            );

            expect(alertsResponse.hits.hits).toHaveLength(120);
          });

          it('should create alerts from multiple expanded values', async () => {
            const id = uuidv4();
            const rule: EsqlRuleCreateProps = {
              ...getCreateEsqlRulesSchemaMock(`rule-${id}`, true),
              query: `from ecs_compliant metadata _id ${internalIdPipe(
                id
              )} | mv_expand agent.name | mv_expand agent.type`,
              from: '2020-10-28T05:15:00.000Z',
              to: '2020-10-28T06:00:00.000Z',
              interval: '45m',
              max_signals: 100,
              enabled: true,
            };

            const doc1 = {
              id,
              '@timestamp': '2020-10-28T05:55:00.000Z',
              agent: {
                name: Array.from({ length: 30 }, (_, i) => `test_1_${1000 + i}`),
                type: ['test-1', 'test-2'],
              },
            };
            const doc2 = {
              id,
              '@timestamp': '2020-10-28T05:55:00.000Z',
              agent: {
                name: Array.from({ length: 25 }, (_, i) => `test_2_${1000 + i}`),
                type: ['test-1', 'test-2', 'test-3'],
              },
            };
            await indexListOfDocuments([doc1, doc2]);

            const createdRule = await createRule(supertest, log, rule);

            const alertsResponseFromFirstRuleExecution = await getOpenAlerts(
              supertest,
              log,
              es,
              createdRule,
              // rule has warning, alerts were truncated, thus "partial failure" status
              RuleExecutionStatusEnum['partial failure'],
              200
            );

            expect(alertsResponseFromFirstRuleExecution.hits.hits).toHaveLength(100);

            // re-trigger rule execution
            await runSoonRule(supertest, createdRule.id);

            const alertsResponse = await getOpenAlerts(
              supertest,
              log,
              es,
              createdRule,
              RuleExecutionStatusEnum.succeeded,
              300,
              new Date()
            );
            // 60 from doc1 and 75 from doc2
            expect(alertsResponse.hits.hits).toHaveLength(135);
          });
        });
      });
    });

    describe('aggregating query rules', () => {
      it('should aggregate results correctly', async () => {
        const id = uuidv4();
        const interval: [string, string] = ['2020-10-28T06:00:00.000Z', '2020-10-28T06:10:00.000Z'];
        const doc1 = { agent: { name: 'test-1' } };
        const doc2 = { agent: { name: 'test-2' } };
        const doc3 = { agent: { name: 'test-3' } };

        // ESQL query counts each distinct value in agent.name
        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          query: `from ecs_compliant ${internalIdPipe(
            id
          )} | stats counted_agents=count(agent.name) by agent.name`,
          from: 'now-1h',
          interval: '1h',
        };

        await indexEnhancedDocuments({
          documents: [doc1, doc1, doc1, doc2, doc2, doc3],
          interval,
          id,
        });

        const { previewId } = await previewRule({
          supertest,
          rule,
          timeframeEnd: new Date('2020-10-28T06:30:00.000Z'),
        });

        const previewAlertsOrderedByAgentName = await getPreviewAlerts({
          es,
          previewId,
          sort: ['agent.name'],
        });

        expect(previewAlertsOrderedByAgentName).toHaveLength(3);
        expect(previewAlertsOrderedByAgentName[0]._source).toEqual(
          expect.objectContaining({
            'agent.name': 'test-1',
            counted_agents: 3,
          })
        );
        expect(previewAlertsOrderedByAgentName[1]._source).toEqual(
          expect.objectContaining({
            'agent.name': 'test-2',
            counted_agents: 2,
          })
        );
        expect(previewAlertsOrderedByAgentName[2]._source).toEqual(
          expect.objectContaining({
            'agent.name': 'test-3',
            counted_agents: 1,
          })
        );
      });

      // in future, these alerts can be suppressed
      // but for now the following test fixes current behaviour when alerts are not suppressed
      it('should generate 2 alerts if events falls into 2 rule executions', async () => {
        const id = uuidv4();
        // document will fall into 2 rule execution windows
        const doc1 = {
          id,
          '@timestamp': '2020-10-28T05:55:00.000Z',
          agent: { name: 'test-1', type: 'auditbeat' },
        };

        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          query: `from ecs_compliant ${internalIdPipe(id)} | stats _counted=count(agent.name)`,
          from: 'now-45m',
          interval: '30m',
        };

        await indexListOfDocuments([doc1]);

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

        expect(previewAlerts).toHaveLength(2);
        expect(previewAlerts[0]._source).toHaveProperty(['_counted'], 1);
        expect(previewAlerts[1]._source).toHaveProperty(['_counted'], 1);
      });

      // ES|QL query can return row in results when data set is empty
      // to prevent this, query should be written in a way that does not allow such cases
      // but it might be useful to trigger alerts, when there is gap in data injection
      it('should generate 1 alert on empty data set', async () => {
        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          query: `from ecs_compliant | stats _counted=count(agent.name)`,
          from: 'now-45m',
          interval: '30m',
        };

        const { previewId } = await previewRule({
          supertest,
          rule,
          timeframeEnd: new Date('2012-03-16T06:30:00.000Z'),
          invocationCount: 1,
        });

        const previewAlerts = await getPreviewAlerts({
          es,
          previewId,
          size: 10,
        });

        expect(previewAlerts).toHaveLength(1);
        // no data has been injected during rule execution interval
        expect(previewAlerts[0]._source).toHaveProperty(['_counted'], 0);
      });
    });

    describe('timestamp override and fallback', () => {
      const expectedEventIngested = '2020-10-28T06:00:00.000Z';
      const doc1 = {
        agent: { name: 'test-1' },
        // delayed timestamp out of 1h rule preview
        '@timestamp': '2020-10-28T08:00:00.000Z',
        'event.ingested': expectedEventIngested,
      };
      const doc2 = {
        agent: { name: 'test-1' },
        '@timestamp': '2020-10-28T08:00:00.000Z',
        // event.ingested out of 1h rule preview
        'event.ingested': '2020-10-28T08:00:00.000Z',
      };
      // use fallback to @timestamp
      const doc3 = {
        agent: { name: 'test-1' },
        '@timestamp': expectedEventIngested,
      };

      it('should generate the correct alerts when timestamp_override defined', async () => {
        const id = uuidv4();

        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          query: `from ecs_compliant ${internalIdPipe(id)} | where agent.name=="test-1"`,
          from: 'now-1h',
          interval: '1h',
          timestamp_override: 'event.ingested',
        };

        await indexListOfDocuments([
          { id, ...doc1 },
          { id, ...doc2 },
          { id, ...doc3 },
        ]);

        const { previewId } = await previewRule({
          supertest,
          rule,
          timeframeEnd: new Date('2020-10-28T06:30:00.000Z'),
        });

        const previewAlerts = await getPreviewAlerts({
          es,
          previewId,
          sort: ['event.ingested'],
        });

        expect(previewAlerts).toHaveLength(2);
        expect(previewAlerts[0]._source).toHaveProperty(['event.ingested'], expectedEventIngested);
        expect(previewAlerts[1]._source).not.toHaveProperty(['event.ingested']);
      });

      it('should generate the correct alerts when timestamp_override defined and fallback disabled', async () => {
        const id = uuidv4();

        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          query: `from ecs_compliant ${internalIdPipe(id)} | where agent.name=="test-1"`,
          from: 'now-1h',
          interval: '1h',
          timestamp_override: 'event.ingested',
          timestamp_override_fallback_disabled: true,
        };

        await indexListOfDocuments([
          { id, ...doc1 },
          { id, ...doc2 },
          { id, ...doc3 },
        ]);

        const { previewId } = await previewRule({
          supertest,
          rule,
          timeframeEnd: new Date('2020-10-28T06:30:00.000Z'),
        });

        const previewAlerts = await getPreviewAlerts({ es, previewId });

        expect(previewAlerts).toHaveLength(1);
        expect(previewAlerts[0]._source).toHaveProperty(['event.ingested'], expectedEventIngested);
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

        expect(previewAlerts).toHaveLength(2);
      });
    });

    describe('max alerts', () => {
      it('generates max alerts warning when circuit breaker is exceeded', async () => {
        const id = uuidv4();
        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          query: `from ecs_compliant ${internalIdPipe(id)} | where agent.name=="test-1"`,
          from: 'now-1h',
          interval: '1h',
        };

        await indexGeneratedDocuments({
          docsCount: 150,
          seed: () => ({
            id,
            '@timestamp': '2020-10-28T06:00:00.000Z',
            agent: {
              name: `test-1`,
            },
          }),
        });

        const { logs, previewId } = await previewRule({
          supertest,
          rule,
          timeframeEnd: new Date('2020-10-28T06:30:00.000Z'),
        });

        expect(logs[0].warnings).toEqual(expect.arrayContaining([getMaxAlertsWarning()]));

        const previewAlerts = await getPreviewAlerts({
          es,
          previewId,
          size: 200,
        });

        expect(previewAlerts).toHaveLength(100);
      });

      it("doesn't generate max alerts warning when circuit breaker is met but not exceeded", async () => {
        const id = uuidv4();
        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          query: `from ecs_compliant ${internalIdPipe(id)} | where agent.name=="test-1"`,
          from: 'now-1h',
          interval: '1h',
        };

        await indexGeneratedDocuments({
          docsCount: 100,
          seed: () => ({
            id,
            '@timestamp': '2020-10-28T06:00:00.000Z',
            agent: {
              name: `test-1`,
            },
          }),
        });

        const { logs, previewId } = await previewRule({
          supertest,
          rule,
          timeframeEnd: new Date('2020-10-28T06:30:00.000Z'),
        });
        expect(logs[0].warnings).not.toEqual(expect.arrayContaining([getMaxAlertsWarning()]));

        const previewAlerts = await getPreviewAlerts({
          es,
          previewId,
          size: 200,
        });

        expect(previewAlerts).toHaveLength(100);
      });

      it('should work for max alerts > 100', async () => {
        const id = uuidv4();
        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          query: `from ecs_compliant ${internalIdPipe(id)} | where agent.name=="test-1"`,
          from: 'now-1h',
          interval: '1h',
          max_signals: 150,
        };

        await indexGeneratedDocuments({
          docsCount: 200,
          seed: () => ({
            id,
            '@timestamp': '2020-10-28T06:00:00.000Z',
            agent: {
              name: `test-1`,
            },
          }),
        });

        const { previewId } = await previewRule({
          supertest,
          rule,
          timeframeEnd: new Date('2020-10-28T06:30:00.000Z'),
        });

        const previewAlerts = await getPreviewAlerts({
          es,
          previewId,
          size: 200,
        });

        expect(previewAlerts).toHaveLength(150);
      });

      // we use actual rule executions, not preview, because for preview API alerts index refresh=false for non suppressed alerts
      // first rule execution catches 130 documents and generates 100 alerts
      // second rule execution catches 150 docs, 120 of which were captured during the first execution and generates only 60 alerts. Because rest are deduplicated
      // so in total 160 alerts should be generated
      it('should generate alerts when docs overlap execution intervals and alerts number reached max_signals in one of the real executions', async () => {
        const id = uuidv4();
        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock(`rule-${id}`, true),
          query: `from ecs_compliant metadata _id ${internalIdPipe(
            id
          )} | keep _id, agent.name | sort agent.name`,
          from: '2020-10-28T05:15:00.000Z',
          to: '2020-10-28T06:00:00.000Z',
          interval: '45m',
          max_signals: 100,
          enabled: true,
        };

        // docs fall in first rule executions
        await indexGeneratedDocuments({
          docsCount: 10,
          seed: (i) => ({
            id,
            '@timestamp': '2020-10-28T05:40:00.000Z',
            agent: {
              name: `00${i}`,
            },
          }),
        });

        // docs fall in both rule executions
        await indexGeneratedDocuments({
          docsCount: 90,
          seed: (i) => ({
            id,
            '@timestamp': '2020-10-28T05:55:00.000Z',
            agent: {
              name: `0${10 + i}`,
            },
          }),
        });

        // docs fall in both rule executions
        await indexGeneratedDocuments({
          docsCount: 30,
          seed: (i) => ({
            id,
            '@timestamp': '2020-10-28T05:55:00.000Z',
            agent: {
              name: 100 + i,
            },
          }),
        });

        // docs fall in second rule execution
        await indexGeneratedDocuments({
          docsCount: 30,
          seed: (i) => ({
            id,
            '@timestamp': '2020-10-28T06:20:00.000Z',
            agent: {
              name: 130 + i,
            },
          }),
        });

        const createdRule = await createRule(supertest, log, rule);

        // first rule run should generate 100 alerts from first 3 batches of index documents
        const alertsResponseFromFirstRuleExecution = await getAlerts(
          supertest,
          log,
          es,
          createdRule,
          // rule has warning, alerts were truncated, thus "partial failure" status
          RuleExecutionStatusEnum['partial failure'],
          200
        );

        // should return 100 alerts
        expect(alertsResponseFromFirstRuleExecution.hits.hits).toHaveLength(100);

        const dateRestart = new Date();
        // re-trigger rule execution with new interval
        await patchRule(supertest, log, {
          id: createdRule.id,
          enabled: false,
        });
        await patchRule(supertest, log, {
          id: createdRule.id,
          from: '2020-10-28T05:45:00.000Z',
          to: '2020-10-28T06:30:00.000Z',
          enabled: true,
        });

        const alertsResponse = await getAlerts(
          supertest,
          log,
          es,
          createdRule,
          RuleExecutionStatusEnum.succeeded,
          200,
          dateRestart
        );

        // should return 160 alerts
        expect(alertsResponse.hits.hits).toHaveLength(160);
      });

      describe('identical document ids across multiple indices', () => {
        before(async () => {
          await esArchiver.load(
            'x-pack/solutions/security/test/fixtures/es_archives/security_solution/ecs_compliant_synthetic_source'
          );
        });

        after(async () => {
          await esArchiver.unload(
            'x-pack/solutions/security/test/fixtures/es_archives/security_solution/ecs_compliant_synthetic_source'
          );
        });

        it('should generate alerts from events with the same id', async () => {
          const id = uuidv4();
          const rule: EsqlRuleCreateProps = {
            ...getCreateEsqlRulesSchemaMock(`rule-${id}`, true),
            query: `from ecs_compliant, ecs_compliant_synthetic_source metadata _id, _index ${internalIdPipe(
              id
            )} | sort @timestamp asc`,
            from: '2020-10-28T05:15:00.000Z',
            to: '2020-10-28T06:00:00.000Z',
            interval: '45m',
            enabled: true,
          };

          await es.index({
            index: 'ecs_compliant',
            id, // id of event in index
            refresh: true,
            document: {
              id,
              '@timestamp': '2020-10-28T05:30:00.000Z',
              agent: { name: 'from ecs_compliant' },
            },
          });
          await es.index({
            index: 'ecs_compliant_synthetic_source',
            id, // id of event in index
            refresh: true,
            document: {
              id,
              '@timestamp': '2020-10-28T05:35:00.000Z',
              agent: { name: 'from ecs_compliant_synthetic_source' },
            },
          });

          const { previewId } = await previewRule({
            supertest,
            rule,
            timeframeEnd: new Date('2020-10-28T06:00:00.000Z'),
          });

          const previewAlerts = await getPreviewAlerts({
            es,
            previewId,
            size: 200,
            sort: [ALERT_ORIGINAL_TIME],
          });

          expect(previewAlerts).toHaveLength(2);
          expect(previewAlerts[0]._source).toHaveProperty(['agent.name'], 'from ecs_compliant');
          expect(previewAlerts[1]._source).toHaveProperty(
            ['agent.name'],
            'from ecs_compliant_synthetic_source'
          );
        });

        // since we exclude _id from the query in the next page, we should be able to generate alerts from multiple documents with the same id in different indices
        it('should generate alerts over multiple pages from different indices but same event id', async () => {
          const id = uuidv4();
          const rule: EsqlRuleCreateProps = {
            ...getCreateEsqlRulesSchemaMock(`rule-${id}`, true),
            query: `from ecs_compliant, ecs_compliant_synthetic_source metadata _id, _index ${internalIdPipe(
              id
            )} | sort @timestamp asc`,
            from: '2020-10-28T05:15:00.000Z',
            to: '2020-10-28T06:00:00.000Z',
            interval: '45m',
            max_signals: 2, // we would paginate with page size = 2
            enabled: true,
          };

          const document = {
            id,
            '@timestamp': '2020-10-28T05:30:00.000Z',
            agent: { name: 'test-1' },
          };

          await Promise.all(
            Array.from({ length: 2 }, (_, i) => i).map((i) =>
              es.index({
                index: 'ecs_compliant',
                id: 'id-' + id + '_' + i, // id of event in index
                refresh: true,
                document,
              })
            )
          );

          const createdRule = await createRule(supertest, log, rule);

          const alertsResponseFromFirstRuleExecution = await getAlerts(
            supertest,
            log,
            es,
            createdRule,
            RuleExecutionStatusEnum.succeeded,
            10
          );

          expect(alertsResponseFromFirstRuleExecution.hits.hits).toHaveLength(2);

          await Promise.all(
            Array.from({ length: 2 }, (_, i) => i).map((i) =>
              es.index({
                index: 'ecs_compliant_synthetic_source',
                id: 'id-' + id + '_' + i, // id of event in index
                refresh: true,
                document: {
                  ...document,
                  '@timestamp': '2020-10-28T05:53:00.000Z',
                },
              })
            )
          );

          const dateRestart = new Date();

          await runSoonRule(supertest, createdRule.id);

          const alertsResponse = await getAlerts(
            supertest,
            log,
            es,
            createdRule,
            RuleExecutionStatusEnum.succeeded,
            200,
            dateRestart
          );

          // no alert should be missed
          expect(alertsResponse.hits.hits).toHaveLength(4);
        });

        it('should generate alerts over multiple pages from different indices but same event id for mv_expand when number alerts exceeds max signal', async () => {
          const id = uuidv4();
          const rule: EsqlRuleCreateProps = {
            ...getCreateEsqlRulesSchemaMock(`rule-${id}`, true),
            query: `from ecs_compliant, ecs_compliant_synthetic_source metadata _id, _index ${internalIdPipe(
              id
            )} | mv_expand agent.name | sort @timestamp asc, _index asc`, // sort by timestamp and index to ensure deterministic results, see https://github.com/elastic/kibana/issues/253849
            from: '2020-10-28T05:15:00.000Z',
            to: '2020-10-28T06:00:00.000Z',
            interval: '45m',
            enabled: true,
          };

          const document = {
            id,
            '@timestamp': '2020-10-28T05:30:00.000Z',
            agent: { name: Array.from({ length: 150 }, (_, i) => `test_1_${1000 + i}`) },
          };

          await Promise.all(
            ['ecs_compliant', 'ecs_compliant_synthetic_source'].map((index, i) =>
              es.index({
                index,
                id,
                refresh: true,
                document,
              })
            )
          );

          const createdRule = await createRule(supertest, log, rule);

          const alertsResponseFromFirstRuleExecution = await getAlerts(
            supertest,
            log,
            es,
            createdRule,
            RuleExecutionStatusEnum['partial failure'], // rule has warning, alerts were truncated, thus "partial failure" status
            200
          );

          expect(alertsResponseFromFirstRuleExecution.hits.hits).toHaveLength(100);

          const dateRestart = new Date();

          await runSoonRule(supertest, createdRule.id);

          const alertsResponse = await getAlerts(
            supertest,
            log,
            es,
            createdRule,
            RuleExecutionStatusEnum['partial failure'], // rule has warning, alerts were truncated, thus "partial failure" status
            300,
            dateRestart
          );

          const indexCounts = alertsResponse.hits.hits.reduce<Record<string, number>>(
            (acc, curr) => {
              const indexName = curr._source?.[ALERT_ANCESTORS][0].index;
              if (indexName) {
                acc[indexName] = (acc[indexName] || 0) + 1;
              }
              return acc;
            },
            {}
          );
          expect(alertsResponse.hits.hits).toHaveLength(200);

          expect(indexCounts).toEqual({
            ecs_compliant: 100,
            ecs_compliant_synthetic_source: 100,
          });
        });
      });
    });

    describe('missing _id warning', () => {
      it('generates warning when non-aggregating query does not return _id', async () => {
        const id = uuidv4();
        const interval: [string, string] = ['2020-10-28T06:00:00.000Z', '2020-10-28T06:10:00.000Z'];
        const doc1 = { agent: { name: 'test-1' } };

        await indexEnhancedDocuments({ documents: [doc1], interval, id });

        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          query: `from ecs_compliant metadata _id ${internalIdPipe(
            id
          )} | where agent.name=="test-1" | DROP _id`,
          from: 'now-1h',
          interval: '1h',
        };

        const { logs, previewId } = await previewRule({
          supertest,
          rule,
          timeframeEnd: new Date('2020-10-28T06:30:00.000Z'),
        });

        expect(logs[0].warnings).toEqual(expect.arrayContaining([getMissingIdFieldWarning()]));

        const previewAlerts = await getPreviewAlerts({ es, previewId });
        expect(previewAlerts).toHaveLength(1);
      });

      it('does not generate warning when non-aggregating query returns _id', async () => {
        const id = uuidv4();
        const interval: [string, string] = ['2020-10-28T06:00:00.000Z', '2020-10-28T06:10:00.000Z'];
        const doc1 = { agent: { name: 'test-1' } };

        await indexEnhancedDocuments({ documents: [doc1], interval, id });

        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          query: `from ecs_compliant metadata _id ${internalIdPipe(
            id
          )} | where agent.name=="test-1"`,
          from: 'now-1h',
          interval: '1h',
        };

        const { logs, previewId } = await previewRule({
          supertest,
          rule,
          timeframeEnd: new Date('2020-10-28T06:30:00.000Z'),
        });

        expect(logs[0].warnings).not.toEqual(expect.arrayContaining([getMissingIdFieldWarning()]));

        const previewAlerts = await getPreviewAlerts({ es, previewId });
        expect(previewAlerts).toHaveLength(1);
      });

      it('does not generate warning for aggregating queries without _id', async () => {
        const id = uuidv4();
        const interval: [string, string] = ['2020-10-28T06:00:00.000Z', '2020-10-28T06:10:00.000Z'];
        const doc1 = { agent: { name: 'test-1' } };

        await indexEnhancedDocuments({ documents: [doc1], interval, id });

        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          query: `from ecs_compliant ${internalIdPipe(id)} | stats counted=count(agent.name)`,
          from: 'now-1h',
          interval: '1h',
        };

        const { logs, previewId } = await previewRule({
          supertest,
          rule,
          timeframeEnd: new Date('2020-10-28T06:30:00.000Z'),
        });

        expect(logs[0].warnings).not.toEqual(expect.arrayContaining([getMissingIdFieldWarning()]));

        const previewAlerts = await getPreviewAlerts({ es, previewId });
        expect(previewAlerts).toHaveLength(1);
      });

      it('generates warning when auto-injected _id is dropped by DROP command', async () => {
        const id = uuidv4();
        const interval: [string, string] = ['2020-10-28T06:00:00.000Z', '2020-10-28T06:10:00.000Z'];
        const doc1 = { agent: { name: 'test-1' } };

        await indexEnhancedDocuments({ documents: [doc1], interval, id });

        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          query: `from ecs_compliant ${internalIdPipe(id)} | where agent.name=="test-1" | DROP _id`,
          from: 'now-1h',
          interval: '1h',
        };

        const { logs, previewId } = await previewRule({
          supertest,
          rule,
          timeframeEnd: new Date('2020-10-28T06:30:00.000Z'),
        });

        expect(logs[0].warnings).toEqual(expect.arrayContaining([getMissingIdFieldWarning()]));

        const previewAlerts = await getPreviewAlerts({ es, previewId });
        expect(previewAlerts).toHaveLength(1);
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

        await indexEnhancedDocuments({ documents: [doc1], interval, id });

        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          query: `from ecs_compliant ${internalIdPipe(id)} | where host.name=="host-0"`,
          from: 'now-1h',
          interval: '1h',
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

        await indexEnhancedDocuments({ documents: [doc1], interval, id });

        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          query: `from ecs_compliant ${internalIdPipe(id)} | where host.name=="host-0"`,
          from: 'now-1h',
          interval: '1h',
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

    describe('ECS fields validation', () => {
      it('creates alert if ECS field has multifields', async () => {
        const id = uuidv4();
        const interval: [string, string] = ['2020-10-28T06:00:00.000Z', '2020-10-28T06:10:00.000Z'];
        const doc1 = { agent: { name: 'test-1' }, 'observer.os.full': 'full test os' };
        const doc2 = { agent: { name: 'test-2' } };

        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          query: `from ecs_compliant metadata _id ${internalIdPipe(
            id
          )} | where agent.name=="test-1"`,
          from: 'now-1h',
          interval: '1h',
        };

        await indexEnhancedDocuments({
          documents: [doc1, doc2],
          interval,
          id,
        });

        const { previewId } = await previewRule({
          supertest,
          rule,
          timeframeEnd: new Date('2020-10-28T06:30:00.000Z'),
        });

        const previewAlerts = await getPreviewAlerts({
          es,
          previewId,
          size: 10,
        });

        expect(previewAlerts).toHaveLength(1);
        expect(previewAlerts[0]._source).toHaveProperty(['observer.os.full'], 'full test os');
        // *.text is multifield define in mappings for observer.os.full
        expect(previewAlerts[0]._source).not.toHaveProperty(['observer.os.full.text']);
      });
      // https://github.com/elastic/security-team/issues/7741
      it('creates alert if ECS field has multifields and is not in ruleRegistry ECS map', async () => {
        const id = uuidv4();
        const interval: [string, string] = ['2020-10-28T06:00:00.000Z', '2020-10-28T06:10:00.000Z'];
        const doc1 = {
          agent: { name: 'test-1' },
          // this field is mapped in alerts index, but not in ruleRegistry ECS map
          'process.entry_leader.name': 'test_process_name',
        };
        const doc2 = { agent: { name: 'test-2' } };

        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          query: `from ecs_compliant metadata _id ${internalIdPipe(
            id
          )} | where agent.name=="test-1"`,
          from: 'now-1h',
          interval: '1h',
        };

        await indexEnhancedDocuments({
          documents: [doc1, doc2],
          interval,
          id,
        });

        const { previewId } = await previewRule({
          supertest,
          rule,
          timeframeEnd: new Date('2020-10-28T06:30:00.000Z'),
        });

        const previewAlerts = await getPreviewAlerts({
          es,
          previewId,
          size: 10,
        });

        expect(previewAlerts).toHaveLength(1);
        expect(previewAlerts[0]._source).toHaveProperty(
          ['process.entry_leader.name'],
          'test_process_name'
        );
        expect(previewAlerts[0]._source).not.toHaveProperty(['process.entry_leader.name.text']);
        expect(previewAlerts[0]._source).not.toHaveProperty(['process.entry_leader.name.caseless']);
      });

      describe('non-ecs', () => {
        before(async () => {
          await esArchiver.load(
            'x-pack/solutions/security/test/fixtures/es_archives/security_solution/ecs_non_compliant'
          );
        });

        after(async () => {
          await esArchiver.unload(
            'x-pack/solutions/security/test/fixtures/es_archives/security_solution/ecs_non_compliant'
          );
        });

        const { indexEnhancedDocuments: indexEnhancedDocumentsToNonEcs } = dataGeneratorFactory({
          es,
          index: 'ecs_non_compliant',
          log,
        });

        it('creates alert if non ECS field has multifields', async () => {
          const id = uuidv4();
          const interval: [string, string] = [
            '2020-10-28T06:00:00.000Z',
            '2020-10-28T06:10:00.000Z',
          ];
          const doc1 = {
            'random.entry_leader.name': 'random non-ecs field',
          };

          const rule: EsqlRuleCreateProps = {
            ...getCreateEsqlRulesSchemaMock('rule-1', true),
            query: `from ecs_non_compliant metadata _id ${internalIdPipe(id)}`,
            from: 'now-1h',
            interval: '1h',
          };

          await indexEnhancedDocumentsToNonEcs({
            documents: [doc1],
            interval,
            id,
          });

          const { previewId } = await previewRule({
            supertest,
            rule,
            timeframeEnd: new Date('2020-10-28T06:30:00.000Z'),
          });

          const previewAlerts = await getPreviewAlerts({
            es,
            previewId,
            size: 10,
          });

          expect(previewAlerts).toHaveLength(1);
          // all multifields have been indexed, which is expected, seen we don't know original mappings
          expect(previewAlerts[0]._source).toHaveProperty(
            ['random.entry_leader.name'],
            'random non-ecs field'
          );
          expect(previewAlerts[0]._source).toHaveProperty(
            ['random.entry_leader.name.text'],
            'random non-ecs field'
          );
          expect(previewAlerts[0]._source).toHaveProperty(
            ['random.entry_leader.name.caseless'],
            'random non-ecs field'
          );
        });

        it('creates alert if `event.action` ECS field has non-ECS sub-field', async () => {
          // The issue was found by customer and reported in
          // https://github.com/elastic/sdh-security-team/issues/1015
          const id = uuidv4();
          const interval: [string, string] = [
            '2020-10-28T06:00:00.000Z',
            '2020-10-28T06:10:00.000Z',
          ];
          const doc1 = {
            'event.action': 'process',
          };

          const rule: EsqlRuleCreateProps = {
            ...getCreateEsqlRulesSchemaMock('rule-1', true),
            query: `from ecs_non_compliant metadata _id ${internalIdPipe(id)}`,
            from: 'now-1h',
            interval: '1h',
          };

          await indexEnhancedDocumentsToNonEcs({
            documents: [doc1],
            interval,
            id,
          });

          const { logs } = await previewRule({
            supertest,
            rule,
            timeframeEnd: new Date('2020-10-28T06:30:00.000Z'),
          });

          expect(logs[0].errors).toHaveLength(0);
        });
      });
    });

    describe('manual rule run', () => {
      beforeEach(async () => {
        await stopAllManualRuns(supertest);
        await esArchiver.load(
          'x-pack/solutions/security/test/fixtures/es_archives/security_solution/ecs_compliant'
        );
      });

      afterEach(async () => {
        await stopAllManualRuns(supertest);
        await esArchiver.unload(
          'x-pack/solutions/security/test/fixtures/es_archives/security_solution/ecs_compliant'
        );
      });

      it('alerts when run on a time range that the rule has not previously seen, and deduplicates if run there more than once', async () => {
        const id = uuidv4();
        const firstTimestamp = moment(new Date()).subtract(3, 'h');
        const firstDocument = {
          id,
          '@timestamp': firstTimestamp.toISOString(),
          agent: {
            name: 'test-1',
          },
        };
        const secondDocument = {
          id,
          '@timestamp': moment().subtract(1, 'm').toISOString(),
          agent: {
            name: 'test-1',
          },
        };

        await indexListOfDocuments([firstDocument, secondDocument]);

        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          query: `from ecs_compliant ${internalIdPipe(id)} | where agent.name=="test-1"`,
          from: 'now-1h',
          interval: '1h',
        };

        const createdRule = await createRule(supertest, log, rule);
        const alerts = await getAlerts(supertest, log, es, createdRule);

        expect(alerts.hits.hits).toHaveLength(1);
        expect(alerts.hits.hits[0]?._source?.[ALERT_RULE_EXECUTION_TYPE]).toEqual('scheduled');

        const backfill = await scheduleRuleRun(supertest, [createdRule.id], {
          startDate: moment(firstTimestamp).subtract(5, 'm'),
          endDate: moment(firstTimestamp).add(5, 'm'),
        });

        await waitForBackfillExecuted(backfill, [createdRule.id], { supertest, log });
        const allNewAlerts = await getAlerts(supertest, log, es, createdRule);
        expect(allNewAlerts.hits.hits).toHaveLength(2);

        expect(allNewAlerts.hits.hits[1]?._source?.[ALERT_RULE_EXECUTION_TYPE]).toEqual('manual');

        const secondBackfill = await scheduleRuleRun(supertest, [createdRule.id], {
          startDate: moment(firstTimestamp).subtract(5, 'm'),
          endDate: moment(firstTimestamp).add(5, 'm'),
        });

        await waitForBackfillExecuted(secondBackfill, [createdRule.id], { supertest, log });
        const allNewAlertsAfter2ManualRuns = await getAlerts(supertest, log, es, createdRule);
        expect(allNewAlertsAfter2ManualRuns.hits.hits).toHaveLength(2);
      });

      it('does not alert if the manual run overlaps with a previous scheduled rule execution', async () => {
        const id = uuidv4();
        const firstTimestamp = moment();

        const firstDocument = {
          id,
          '@timestamp': moment(firstTimestamp).subtract(1, 'm').toISOString(),
          agent: {
            name: 'test-1',
          },
        };

        await indexListOfDocuments([firstDocument]);

        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          query: `from ecs_compliant METADATA  _id, _index, _version ${internalIdPipe(
            id
          )} | where agent.name=="test-1"`,
          from: 'now-1h',
          interval: '1h',
        };

        const createdRule = await createRule(supertest, log, rule);
        const alerts = await getAlerts(supertest, log, es, createdRule);

        expect(alerts.hits.hits).toHaveLength(1);

        const backfill = await scheduleRuleRun(supertest, [createdRule.id], {
          startDate: moment(firstTimestamp).subtract(5, 'm'),
          endDate: moment(),
        });

        await waitForBackfillExecuted(backfill, [createdRule.id], { supertest, log });
        const allNewAlerts = await getAlerts(supertest, log, es, createdRule);
        expect(allNewAlerts.hits.hits).toHaveLength(1);
      });

      it("should run rule in the past and can generate duplicate alert if it's non de-duplicative esql query", async () => {
        const id = uuidv4();
        const firstTimestamp = moment();

        const firstDocument = {
          id,
          '@timestamp': moment(firstTimestamp).subtract(1, 'm').toISOString(),
          agent: {
            name: 'test-1',
          },
        };

        await indexListOfDocuments([firstDocument]);

        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          query: `from ecs_compliant ${internalIdPipe(id)} | where agent.name=="test-1"`,
          from: 'now-1h',
          interval: '1h',
        };

        const createdRule = await createRule(supertest, log, rule);
        const alerts = await getAlerts(supertest, log, es, createdRule);

        expect(alerts.hits.hits).toHaveLength(1);

        const backfill = await scheduleRuleRun(supertest, [createdRule.id], {
          startDate: moment(firstTimestamp).subtract(5, 'm'),
          endDate: moment(),
        });

        await waitForBackfillExecuted(backfill, [createdRule.id], { supertest, log });
        const allNewAlerts = await getAlerts(supertest, log, es, createdRule);
        expect(allNewAlerts.hits.hits).toHaveLength(1);
      });

      it('supression per rule execution should work for manual rule runs', async () => {
        const id = uuidv4();
        const firstTimestamp = moment(new Date()).subtract(3, 'h');
        const firstDocument = {
          id,
          '@timestamp': firstTimestamp.toISOString(),
          agent: {
            name: 'agent-1',
          },
        };
        const secondDocument = {
          id,
          '@timestamp': moment(firstTimestamp).add(1, 'm').toISOString(),
          agent: {
            name: 'agent-1',
          },
        };
        const thirdDocument = {
          id,
          '@timestamp': moment(firstTimestamp).add(3, 'm').toISOString(),
          agent: {
            name: 'agent-1',
          },
        };

        await indexListOfDocuments([firstDocument, secondDocument, thirdDocument]);

        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          query: `from ecs_compliant METADATA  _id, _index, _version ${internalIdPipe(
            id
          )} | where agent.name=="agent-1"`,
          from: 'now-1h',
          interval: '1h',
          alert_suppression: {
            group_by: ['agent.name'],
          },
        };

        const createdRule = await createRule(supertest, log, rule);
        const alerts = await getAlerts(supertest, log, es, createdRule);

        expect(alerts.hits.hits).toHaveLength(0);

        const backfill = await scheduleRuleRun(supertest, [createdRule.id], {
          startDate: moment(firstTimestamp).subtract(5, 'm'),
          endDate: moment(firstTimestamp).add(10, 'm'),
        });

        await waitForBackfillExecuted(backfill, [createdRule.id], { supertest, log });
        const allNewAlerts = await getAlerts(supertest, log, es, createdRule);
        expect(allNewAlerts.hits.hits).toHaveLength(1);
      });

      it('supression with time window should work for manual rule runs and update alert', async () => {
        const id = uuidv4();
        const firstTimestamp = moment(new Date()).subtract(3, 'h');
        const firstDocument = {
          id,
          '@timestamp': firstTimestamp.toISOString(),
          agent: {
            name: 'agent-1',
          },
        };

        await indexListOfDocuments([firstDocument]);

        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          query: `from ecs_compliant METADATA  _id, _index, _version ${internalIdPipe(
            id
          )} | where agent.name=="agent-1"`,
          from: 'now-1h',
          interval: '1h',
          alert_suppression: {
            group_by: ['agent.name'],
            duration: {
              value: 500,
              unit: 'm',
            },
          },
        };

        const createdRule = await createRule(supertest, log, rule);
        const alerts = await getAlerts(supertest, log, es, createdRule);

        expect(alerts.hits.hits).toHaveLength(0);

        // generate alert in the past
        const backfill = await scheduleRuleRun(supertest, [createdRule.id], {
          startDate: moment(firstTimestamp).subtract(5, 'm'),
          endDate: moment(firstTimestamp).add(5, 'm'),
        });

        await waitForBackfillExecuted(backfill, [createdRule.id], { supertest, log });
        const allNewAlerts = await getAlerts(supertest, log, es, createdRule);
        expect(allNewAlerts.hits.hits).toHaveLength(1);

        // now we will ingest new event, and manual rule run should update original alert
        const secondDocument = {
          id,
          '@timestamp': moment(firstTimestamp).add(5, 'm').toISOString(),
          agent: {
            name: 'agent-1',
          },
        };

        await indexListOfDocuments([secondDocument]);

        const secondBackfill = await scheduleRuleRun(supertest, [createdRule.id], {
          startDate: moment(firstTimestamp).add(1, 'm'),
          endDate: moment(firstTimestamp).add(120, 'm'),
        });

        await waitForBackfillExecuted(secondBackfill, [createdRule.id], { supertest, log });
        const updatedAlerts = await getAlerts(supertest, log, es, createdRule);
        expect(updatedAlerts.hits.hits).toHaveLength(1);

        expect(updatedAlerts.hits.hits).toHaveLength(1);
        expect(updatedAlerts.hits.hits[0]._source).toEqual({
          ...updatedAlerts.hits.hits[0]._source,
          [ALERT_SUPPRESSION_DOCS_COUNT]: 1,
        });
      });
    });

    describe('preview logged requests', () => {
      let rule: EsqlRuleCreateProps;
      let id: string;
      beforeEach(async () => {
        id = uuidv4();
        const interval: [string, string] = ['2020-10-28T06:00:00.000Z', '2020-10-28T06:10:00.000Z'];
        const doc1 = { agent: { name: 'test-1' } };

        rule = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          query: `from ecs_compliant metadata _id ${internalIdPipe(
            id
          )} | where agent.name=="test-1"`,
          from: 'now-1h',
          interval: '1h',
        };

        await indexEnhancedDocuments({ documents: [doc1], interval, id });
      });

      afterEach(async () => {
        await setAdvancedSettings(supertest, {
          [EXCLUDED_DATA_TIERS_FOR_RULE_EXECUTION]: [],
        });
      });

      it('should not return requests property when not enabled', async () => {
        const { logs } = await previewRule({
          supertest,
          rule,
          timeframeEnd: new Date('2020-10-28T06:30:00.000Z'),
        });

        expect(logs[0]).not.toHaveProperty('requests');
      });
      it('should return requests property when enable_logged_requests set to true', async () => {
        const { logs } = await previewRule({
          supertest,
          rule,
          timeframeEnd: new Date('2020-10-28T06:30:00.000Z'),
          enableLoggedRequests: true,
        });

        const requests = logs[0].requests;
        expect(requests).toHaveLength(2);

        expect(requests).toHaveProperty('0.description', 'ES|QL request to find all matches');
        expect(requests).toHaveProperty('0.duration', expect.any(Number));
        expect(requests![0].request).toContain(
          `"query": "FROM ecs_compliant METADATA _id | WHERE id == \\\"${id}\\\" | WHERE agent.name == \\\"test-1\\\" | limit 101",`
        );

        expect(requests).toHaveProperty(
          '1.description',
          'Retrieve source documents when ES|QL query is not aggregable'
        );
        expect(requests).toHaveProperty('1.duration', expect.any(Number));
        expect(requests![1].request).toContain(
          'POST /ecs_compliant/_search?ignore_unavailable=true'
        );
      });
      it('should not return requests with any data tier filter', async () => {
        const { logs } = await previewRule({
          supertest,
          rule,
          timeframeEnd: new Date('2020-10-28T06:30:00.000Z'),
          enableLoggedRequests: true,
        });

        const requests = logs[0].requests;

        expect(requests![0].request).not.toContain('data_frozen');
      });
      it('should return requests with included data tiers filters from advanced settings', async () => {
        await setAdvancedSettings(supertest, {
          [EXCLUDED_DATA_TIERS_FOR_RULE_EXECUTION]: ['data_frozen'],
        });
        const { logs } = await previewRule({
          supertest,
          rule,
          timeframeEnd: new Date('2020-10-28T06:30:00.000Z'),
          enableLoggedRequests: true,
        });

        const requests = logs[0].requests;

        expect(requests![0].request).toMatch(
          /"must_not":\s*\[\s*{\s*"terms":\s*{\s*"_tier":\s*\[\s*"data_frozen"\s*\]/
        );
      });
    });

    describe('shard failures', () => {
      const config = getService('config');
      const isServerless = config.get('serverless');
      const dataPathBuilder = new EsArchivePathBuilder(isServerless);
      const packetBeatPath = dataPathBuilder.getPath('packetbeat/default');

      before(async () => {
        await esArchiver.load(packetBeatPath);
        await setBrokenRuntimeField({ es, index: 'packetbeat-*' });
      });

      after(async () => {
        await unsetBrokenRuntimeField({ es, index: 'packetbeat-*' });
        await esArchiver.unload(packetBeatPath);
      });

      it('should handle shard failures and include warning in logs for query that is not aggregating', async () => {
        const doc1 = { agent: { name: 'test-1' } };
        await indexEnhancedDocuments({
          documents: [doc1],
          interval: ['2020-10-28T06:00:00.000Z', '2020-10-28T06:10:00.000Z'],
          id: uuidv4(),
        });

        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          query: `from packetbeat-*, ecs_compliant METADATA _id | limit 101`,
          from: 'now-100000h',
        };

        const { logs, previewId } = await previewRule({
          supertest,
          rule,
        });

        const previewAlerts = await getPreviewAlerts({ es, previewId });

        expect(logs).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              warnings: expect.arrayContaining([
                expect.stringContaining(
                  'The ES|QL event query was only executed on the available shards. The query failed to run successfully on the following shards'
                ),
              ]),
            }),
          ])
        );

        expect(previewAlerts).not.toHaveLength(0);
      });

      it('should handle shard failures and include errors in logs for query that is aggregating', async () => {
        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock(),
          query: `from packetbeat-* | stats _count=count(broken) by @timestamp`,
          from: 'now-100000h',
        };

        const { logs, previewId } = await previewRule({
          supertest,
          rule,
        });

        const previewAlerts = await getPreviewAlerts({ es, previewId });

        expect(logs).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              errors: expect.arrayContaining([
                expect.stringContaining('No field found for [non_existing] in mapping'),
              ]),
            }),
          ])
        );

        expect(previewAlerts).toHaveLength(0);
      });
    });

    describe('alerts on alerts', () => {
      let id: string;
      let ruleId: string;
      beforeEach(async () => {
        id = uuidv4();
        const doc1 = { id, agent: { name: 'test-1' }, '@timestamp': '2020-10-28T06:05:00.000Z' };
        const ruleQuery = `from ecs_compliant metadata _id ${internalIdPipe(
          id
        )} | where agent.name=="test-1"`;
        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          query: ruleQuery,
          from: '2020-10-28T06:00:00.000Z',
          interval: '1h',
        };

        await indexListOfDocuments([doc1]);

        const createdRule = await createRule(supertest, log, rule);
        await getOpenAlerts(supertest, log, es, createdRule);
        ruleId = createdRule.id;
      });

      it('should create alert on alert with correct ancestors', async () => {
        const ruleOnAlert: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock(),
          query: `from .alerts-security* metadata _id | where ${ALERT_RULE_UUID}=="${ruleId}"`,
          from: 'now-1h',
          interval: '1h',
        };

        const { previewId } = await previewRule({
          supertest,
          rule: ruleOnAlert,
          timeframeEnd: new Date(),
        });
        const previewAlerts = await getPreviewAlerts({ es, previewId });

        expect(previewAlerts[0]?._source?.[ALERT_ANCESTORS]).toHaveLength(2);
        expect(previewAlerts[0]?._source?.[ALERT_ANCESTORS]).toEqual([
          {
            depth: 0,
            id: expect.any(String),
            index: 'ecs_compliant',
            type: 'event',
          },
          {
            depth: 1,
            id: expect.any(String),
            index: expect.stringContaining('alerts'),
            rule: ruleId,
            type: 'signal',
          },
        ]);
      });

      it('should create alert on alert when properties dropped in ES|QL query', async () => {
        const ruleOnAlert: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock(),
          query: `from .alerts-security* metadata _id | where ${ALERT_RULE_UUID}=="${ruleId}" | keep _id`,
          from: 'now-1h',
          interval: '1h',
        };

        const { previewId } = await previewRule({
          supertest,
          rule: ruleOnAlert,
          timeframeEnd: new Date(),
        });
        const previewAlerts = await getPreviewAlerts({ es, previewId });

        expect(previewAlerts[0]?._source?.[ALERT_ANCESTORS]).toHaveLength(2);
        expect(previewAlerts[0]?._source?.[ALERT_ANCESTORS]).toEqual([
          {
            depth: 0,
            id: expect.any(String),
            index: 'ecs_compliant',
            type: 'event',
          },
          {
            depth: 1,
            id: expect.any(String),
            index: expect.stringContaining('alerts'),
            rule: ruleId,
            type: 'signal',
          },
        ]);
      });

      it('should create alert on alert for aggregating query', async () => {
        const ruleOnAlert: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock(),
          query: `from .alerts-security* | where ${ALERT_RULE_UUID}=="${ruleId}" | stats _count=count(agent.name) `,
          from: 'now-1h',
          interval: '1h',
        };

        const { previewId } = await previewRule({
          supertest,
          rule: ruleOnAlert,
          timeframeEnd: new Date(),
        });
        const previewAlerts = await getPreviewAlerts({ es, previewId });

        // since we don't fetch source document when using aggregating query, only one ancestors item is present
        expect(previewAlerts[0]?._source?.[ALERT_ANCESTORS]).toHaveLength(1);
        expect(previewAlerts[0]?._source?.[ALERT_ANCESTORS]).toEqual([
          { depth: 0, id: '', index: '', type: 'event' },
        ]);
      });
    });

    describe('with data stream namespace filter', () => {
      before(async () => {
        await esArchiver.load(
          'x-pack/solutions/security/test/fixtures/es_archives/security_solution/ecs_compliant'
        );
      });

      after(async () => {
        await esArchiver.unload(
          'x-pack/solutions/security/test/fixtures/es_archives/security_solution/ecs_compliant'
        );
        // Clean up UI setting
        await setAdvancedSettings(supertest, {
          [INCLUDED_DATA_STREAM_NAMESPACES_FOR_RULE_EXECUTION]: [],
        });
      });

      it('should only include documents from specified namespaces when filter is configured', async () => {
        const id = uuidv4();
        const timestamp = '2020-10-28T06:00:00.000Z';

        // Create documents with different namespaces
        const docNamespace1 = {
          id,
          '@timestamp': timestamp,
          data_stream: { namespace: 'namespace1' },
          agent: {
            name: 'agent-namespace1',
          },
        };
        const docNamespace2 = {
          id,
          '@timestamp': timestamp,
          data_stream: { namespace: 'namespace2' },
          agent: {
            name: 'agent-namespace2',
          },
        };
        const docNamespace3 = {
          id,
          '@timestamp': timestamp,
          data_stream: { namespace: 'namespace3' },
          agent: {
            name: 'agent-namespace3',
          },
        };

        await indexListOfDocuments([docNamespace1, docNamespace2, docNamespace3]);

        // Set UI setting to include only namespace1 and namespace2
        await setAdvancedSettings(supertest, {
          [INCLUDED_DATA_STREAM_NAMESPACES_FOR_RULE_EXECUTION]: ['namespace1', 'namespace2'],
        });

        const ruleQuery = `from ecs_compliant metadata _id, _index ${internalIdPipe(
          id
        )} | where agent.name=="agent-namespace1" or agent.name=="agent-namespace2" or agent.name=="agent-namespace3"`;
        const rule: EsqlRuleCreateProps = {
          ...getCreateEsqlRulesSchemaMock('rule-1', true),
          query: ruleQuery,
          from: '2020-10-28T06:00:00.000Z',
          interval: '1h',
        };

        const { previewId } = await previewRule({
          supertest,
          rule,
        });
        const previewAlerts = await getPreviewAlerts({
          es,
          previewId,
          size: 10,
        });

        // Should only get alerts from namespace1 and namespace2, not namespace3
        expect(previewAlerts.length).toEqual(2);
        const namespaces = previewAlerts.map((alert) => alert._source?.['data_stream.namespace']);
        expect(namespaces).toContain('namespace1');
        expect(namespaces).toContain('namespace2');
        expect(namespaces).not.toContain('namespace3');
      });
    });
  });
};
