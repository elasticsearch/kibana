/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from 'expect';
import moment from 'moment';
import { v4 as uuidv4 } from 'uuid';
import { ALERT_RULE_EXECUTION_TYPE, ALERT_SUPPRESSION_DOCS_COUNT } from '@kbn/rule-data-utils';
import type { NewTermsRuleCreateProps } from '@kbn/security-solution-plugin/common/api/detection_engine';
import { orderBy } from 'lodash';
import { getCreateNewTermsRulesSchemaMock } from '@kbn/security-solution-plugin/common/api/detection_engine/model/rule_schema/mocks';

import { getMaxSignalsWarning as getMaxAlertsWarning } from '@kbn/security-solution-plugin/server/lib/detection_engine/rule_types/utils/utils';
import { INCLUDED_DATA_STREAM_NAMESPACES_FOR_RULE_EXECUTION } from '@kbn/security-solution-plugin/common/constants';

import { createRule, deleteAllRules, deleteAllAlerts } from '@kbn/detections-response-ftr-services';
import {
  getAlerts,
  getPreviewAlerts,
  previewRule,
  dataGeneratorFactory,
  previewRuleWithExceptionEntries,
  removeRandomValuedPropertiesFromAlert,
  scheduleRuleRun,
  stopAllManualRuns,
  waitForBackfillExecuted,
  setAdvancedSettings,
} from '../../../../utils';
import { deleteAllExceptions } from '../../../../../lists_and_exception_lists/utils';
import type { FtrProviderContext } from '../../../../../../ftr_provider_context';
import { EsArchivePathBuilder } from '../../../../../../es_archive_path_builder';
import { EntityStoreV2EnrichmentSetup } from '../../entity_store_v2_enrichment_setup';

// host.id of the auditbeat record for zeek-newyork-sha-aa8df15 (first new term).
const ENRICHMENT_HOST_ID = '3729d06ce9964aa98549f41cbd99334d';
const ENRICHMENT_HOST_NAME = 'zeek-newyork-sha-aa8df15';
const ENRICHMENT_HOST_EUID = `host:${ENRICHMENT_HOST_ID}`;

const historicalWindowStart = '2022-10-13T05:00:04.000Z';
const ruleExecutionStart = '2022-10-19T05:00:04.000Z';

export default ({ getService }: FtrProviderContext) => {
  const supertest = getService('supertest');
  const esArchiver = getService('esArchiver');
  const es = getService('es');
  const log = getService('log');
  const entityStoreV2 = EntityStoreV2EnrichmentSetup(getService);
  const { indexEnhancedDocuments } = dataGeneratorFactory({
    es,
    index: 'new_terms',
    log,
  });
  // TODO: add a new service for loading archiver files similar to "getService('es')"
  const utils = getService('securitySolutionUtils');
  const config = getService('config');
  const isServerless = config.get('serverless');
  const dataPathBuilder = new EsArchivePathBuilder(isServerless);
  const path = dataPathBuilder.getPath('auditbeat/hosts');
  /**
   * indexes 2 sets of documents:
   * - documents in historical window
   * - documents in rule execution window
   * @returns id of documents
   */
  const newTermsTestExecutionSetup = async ({
    historicalDocuments,
    ruleExecutionDocuments,
  }: {
    historicalDocuments: Array<Record<string, unknown>>;
    ruleExecutionDocuments: Array<Record<string, unknown>>;
  }) => {
    const testId = uuidv4();

    await indexEnhancedDocuments({
      interval: [historicalWindowStart, ruleExecutionStart],
      id: testId,
      documents: historicalDocuments,
    });

    await indexEnhancedDocuments({
      id: testId,
      documents: ruleExecutionDocuments,
    });

    return testId;
  };

  describe('@ess @serverless @serverlessQA New terms type rules', () => {
    before(async () => {
      await esArchiver.load(path);
      await esArchiver.load(
        'x-pack/solutions/security/test/fixtures/es_archives/security_solution/new_terms'
      );
    });

    after(async () => {
      await esArchiver.unload(path);
      await esArchiver.unload(
        'x-pack/solutions/security/test/fixtures/es_archives/security_solution/new_terms'
      );
      await deleteAllAlerts(supertest, log, es);
      await deleteAllRules(supertest, log);
    });

    // First test creates a real rule - remaining tests use preview API

    // This test also tests that alerts are NOT created for terms that are not new: the host name
    // suricata-sensor-san-francisco appears in a document at 2019-02-19T20:42:08.230Z, but also appears
    // in earlier documents so is not new. An alert should not be generated for that term.
    it('should generate 1 alert with 1 selected field', async () => {
      const username = await utils.getUsername();
      const rule: NewTermsRuleCreateProps = {
        ...getCreateNewTermsRulesSchemaMock('rule-1', true),
        new_terms_fields: ['host.name'],
        from: '2019-02-19T20:42:00.000Z',
        history_window_start: '2019-01-19T20:42:00.000Z',
      };

      const createdRule = await createRule(supertest, log, rule);
      const alerts = await getAlerts(supertest, log, es, createdRule);

      expect(alerts.hits.hits).toHaveLength(1);
      expect(removeRandomValuedPropertiesFromAlert(alerts.hits.hits[0]._source)).toEqual({
        'kibana.alert.new_terms': ['zeek-newyork-sha-aa8df15'],
        'kibana.alert.rule.category': 'New Terms Rule',
        'kibana.alert.rule.consumer': 'siem',
        'kibana.alert.rule.name': 'Query with a rule id',
        'kibana.alert.rule.producer': 'siem',
        'kibana.alert.rule.rule_type_id': 'siem.newTermsRule',
        'kibana.space_ids': ['default'],
        'kibana.alert.rule.tags': [],
        agent: {
          ephemeral_id: '7cc2091a-72f1-4c63-843b-fdeb622f9c69',
          hostname: 'zeek-newyork-sha-aa8df15',
          id: '4b4462ef-93d2-409c-87a6-299d942e5047',
          type: 'auditbeat',
          version: '8.0.0',
        },
        cloud: { instance: { id: '139865230' }, provider: 'digitalocean', region: 'nyc1' },
        ecs: { version: '1.0.0-beta2' },
        host: {
          architecture: 'x86_64',
          hostname: 'zeek-newyork-sha-aa8df15',
          id: '3729d06ce9964aa98549f41cbd99334d',
          ip: ['157.230.208.30', '10.10.0.6', 'fe80::24ce:f7ff:fede:a571'],
          mac: ['26:ce:f7:de:a5:71'],
          name: 'zeek-newyork-sha-aa8df15',
          os: {
            codename: 'cosmic',
            family: 'debian',
            kernel: '4.18.0-10-generic',
            name: 'Ubuntu',
            platform: 'ubuntu',
            version: '18.10 (Cosmic Cuttlefish)',
          },
        },
        message: expect.stringMatching(
          /Login by user (root|bob) \(UID: (0|1)\) on pts\/0 \(PID: 20638\) from 8\.42\.77\.171 \(IP: 8\.42\.77\.171\)/
        ),
        process: { pid: 20638 },
        service: { type: 'system' },
        source: { ip: '8.42.77.171' },
        user: {
          id: expect.any(Number),
          name: expect.stringMatching(/(root|bob)/),
          terminal: 'pts/0',
        },
        event: {
          action: 'user_login',
          category: 'authentication',
          dataset: 'login',

          module: 'system',
          origin: '/var/log/wtmp',
          outcome: 'success',
          type: 'authentication_success',
        },
        'event.kind': 'signal',
        'kibana.alert.original_time': '2019-02-19T20:42:08.230Z',
        'kibana.alert.ancestors': [
          {
            id: expect.any(String),
            type: 'event',
            index: 'auditbeat-8.0.0-2019.02.19-000001',
            depth: 0,
          },
        ],
        'kibana.alert.status': 'active',
        'kibana.alert.workflow_status': 'open',
        'kibana.alert.workflow_tags': [],
        'kibana.alert.workflow_assignee_ids': [],
        'kibana.alert.depth': 1,
        'kibana.alert.reason': expect.stringMatching(
          /authentication event with source 8\.42\.77\.171 by (root|bob) on zeek-newyork-sha-aa8df15 created high alert Query with a rule id\./
        ),
        'kibana.alert.severity': 'high',
        'kibana.alert.risk_score': 55,
        'kibana.alert.rule.parameters': {
          description: 'Detecting root and admin users',
          risk_score: 55,
          severity: 'high',
          author: [],
          false_positives: [],
          from: '2019-02-19T20:42:00.000Z',
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
          related_integrations: [],
          required_fields: [],
          setup: '',
          type: 'new_terms',
          query: '*',
          new_terms_fields: ['host.name'],
          history_window_start: '2019-01-19T20:42:00.000Z',
          index: ['auditbeat-*'],
          language: 'kuery',
          rule_source: {
            type: 'internal',
          },
        },
        'kibana.alert.rule.actions': [],
        'kibana.alert.rule.author': [],
        'kibana.alert.rule.created_by': username,
        'kibana.alert.rule.description': 'Detecting root and admin users',
        'kibana.alert.rule.enabled': true,
        'kibana.alert.rule.exceptions_list': [],
        'kibana.alert.rule.false_positives': [],
        'kibana.alert.rule.from': '2019-02-19T20:42:00.000Z',
        'kibana.alert.rule.immutable': false,
        'kibana.alert.rule.indices': ['auditbeat-*'],
        'kibana.alert.rule.interval': '5m',
        'kibana.alert.rule.max_signals': 100,
        'kibana.alert.rule.references': [],
        'kibana.alert.rule.revision': 0,
        'kibana.alert.rule.risk_score_mapping': [],
        'kibana.alert.rule.rule_id': 'rule-1',
        'kibana.alert.rule.severity_mapping': [],
        'kibana.alert.rule.threat': [],
        'kibana.alert.rule.to': 'now',
        'kibana.alert.rule.type': 'new_terms',
        'kibana.alert.rule.updated_by': username,
        'kibana.alert.rule.version': 1,
        'kibana.alert.rule.risk_score': 55,
        'kibana.alert.rule.severity': 'high',
        'kibana.alert.original_event.action': 'user_login',
        'kibana.alert.original_event.category': 'authentication',
        'kibana.alert.original_event.dataset': 'login',
        'kibana.alert.original_event.kind': 'event',
        'kibana.alert.original_event.module': 'system',
        'kibana.alert.original_event.origin': '/var/log/wtmp',
        'kibana.alert.original_event.outcome': 'success',
        'kibana.alert.original_event.type': 'authentication_success',
        'kibana.alert.rule.execution.type': 'scheduled',
      });
    });

    it('generates max alerts warning when circuit breaker is exceeded', async () => {
      const rule: NewTermsRuleCreateProps = {
        ...getCreateNewTermsRulesSchemaMock('rule-1', true),
        new_terms_fields: ['process.pid'],
        from: '2018-02-19T20:42:00.000Z',
        // Set the history_window_start close to 'from' so we should alert on all terms in the time range
        history_window_start: '2018-02-19T20:41:59.000Z',
      };
      const { logs } = await previewRule({ supertest, rule });

      expect(logs[0].warnings).toContain(getMaxAlertsWarning());
    });

    it("doesn't generate max alerts warning when circuit breaker is met but not exceeded", async () => {
      const rule: NewTermsRuleCreateProps = {
        ...getCreateNewTermsRulesSchemaMock('rule-1', true),
        new_terms_fields: ['host.ip'],
        from: '2019-02-19T20:42:00.000Z',
        history_window_start: '2019-01-19T20:42:00.000Z',
        max_signals: 3,
      };
      const { logs } = await previewRule({ supertest, rule });

      expect(logs[0].warnings).not.toContain(getMaxAlertsWarning());
    });

    it('should generate 3 alerts when 1 document has 3 new values', async () => {
      const rule: NewTermsRuleCreateProps = {
        ...getCreateNewTermsRulesSchemaMock('rule-1', true),
        new_terms_fields: ['host.ip'],
        from: '2019-02-19T20:42:00.000Z',
        history_window_start: '2019-01-19T20:42:00.000Z',
      };

      const { previewId } = await previewRule({ supertest, rule });
      const previewAlerts = await getPreviewAlerts({ es, previewId });

      expect(previewAlerts.length).toEqual(3);
      const previewAlertsOrderedByHostIp = orderBy(
        previewAlerts,
        '_source.kibana.alert.new_terms',
        'asc'
      );
      expect(previewAlertsOrderedByHostIp[0]._source?.['kibana.alert.new_terms']).toEqual([
        '10.10.0.6',
      ]);
      expect(previewAlertsOrderedByHostIp[1]._source?.['kibana.alert.new_terms']).toEqual([
        '157.230.208.30',
      ]);
      expect(previewAlertsOrderedByHostIp[2]._source?.['kibana.alert.new_terms']).toEqual([
        'fe80::24ce:f7ff:fede:a571',
      ]);
    });

    it('should generate 3 alerts when 1 document has 3 new values for multiple fields', async () => {
      const rule: NewTermsRuleCreateProps = {
        ...getCreateNewTermsRulesSchemaMock('rule-1', true),
        new_terms_fields: ['host.name', 'host.ip'],
        from: '2019-02-19T20:42:00.000Z',
        history_window_start: '2019-01-19T20:42:00.000Z',
      };

      const { previewId } = await previewRule({ supertest, rule });
      const previewAlerts = await getPreviewAlerts({ es, previewId });

      expect(previewAlerts.length).toEqual(3);

      const newTerms = orderBy(
        previewAlerts.map((item) => item._source?.['kibana.alert.new_terms']),
        ['0', '1']
      );

      expect(newTerms).toEqual([
        ['zeek-newyork-sha-aa8df15', '10.10.0.6'],
        ['zeek-newyork-sha-aa8df15', '157.230.208.30'],
        ['zeek-newyork-sha-aa8df15', 'fe80::24ce:f7ff:fede:a571'],
      ]);
    });

    it('should generate 1 alert for unique combination of existing terms', async () => {
      // historical window documents
      const historicalDocuments = [
        {
          host: { name: 'host-0', ip: '127.0.0.1' },
        },
        {
          host: { name: 'host-1', ip: '127.0.0.2' },
        },
      ];

      // rule execution documents
      const ruleExecutionDocuments = [
        {
          host: { name: 'host-0', ip: '127.0.0.2' },
        },
      ];

      const testId = await newTermsTestExecutionSetup({
        historicalDocuments,
        ruleExecutionDocuments,
      });

      // ensure there are no alerts for single new terms fields, it means values are not new
      const rule: NewTermsRuleCreateProps = {
        ...getCreateNewTermsRulesSchemaMock('rule-1', true),
        index: ['new_terms'],
        new_terms_fields: ['host.name', 'host.ip'],
        from: ruleExecutionStart,
        history_window_start: historicalWindowStart,
        query: `id: "${testId}"`,
      };
      // shouldn't be terms for 'host.ip'
      const hostIpPreview = await previewRule({
        supertest,
        rule: { ...rule, new_terms_fields: ['host.ip'] },
      });
      const hostIpPreviewAlerts = await getPreviewAlerts({
        es,
        previewId: hostIpPreview.previewId,
      });
      expect(hostIpPreviewAlerts.length).toEqual(0);

      // shouldn't be terms for 'host.name'
      const hostNamePreview = await previewRule({
        supertest,
        rule: { ...rule, new_terms_fields: ['host.name'] },
      });
      const hostNamePreviewAlerts = await getPreviewAlerts({
        es,
        previewId: hostNamePreview.previewId,
      });
      expect(hostNamePreviewAlerts.length).toEqual(0);

      const { previewId } = await previewRule({ supertest, rule });
      const previewAlerts = await getPreviewAlerts({ es, previewId });

      expect(previewAlerts.length).toEqual(1);

      expect(previewAlerts[0]._source?.['kibana.alert.new_terms']).toEqual(['host-0', '127.0.0.2']);
    });

    it('should generate 5 alerts, 1 for each new unique combination in 2 fields', async () => {
      const historicalDocuments = [
        {
          'source.ip': ['192.168.1.1'],
          tags: ['tag-1', 'tag-2'],
        },
        {
          'source.ip': ['192.168.1.1'],
          tags: ['tag-1'],
        },
      ];

      const ruleExecutionDocuments = [
        {
          'source.ip': ['192.168.1.1', '192.168.1.2'],
          tags: ['tag-new-1', 'tag-2', 'tag-new-3'],
        },
      ];

      const testId = await newTermsTestExecutionSetup({
        historicalDocuments,
        ruleExecutionDocuments,
      });

      const rule: NewTermsRuleCreateProps = {
        ...getCreateNewTermsRulesSchemaMock('rule-1', true),
        index: ['new_terms'],
        new_terms_fields: ['source.ip', 'tags'],
        from: ruleExecutionStart,
        history_window_start: historicalWindowStart,
        query: `id: "${testId}"`,
      };

      const { previewId } = await previewRule({ supertest, rule });
      const previewAlerts = await getPreviewAlerts({ es, previewId });

      expect(previewAlerts.length).toEqual(5);

      const newTerms = orderBy(
        previewAlerts.map((item) => item._source?.['kibana.alert.new_terms']),
        ['0', '1']
      );

      expect(newTerms).toEqual([
        ['192.168.1.1', 'tag-new-1'],
        ['192.168.1.1', 'tag-new-3'],
        ['192.168.1.2', 'tag-2'],
        ['192.168.1.2', 'tag-new-1'],
        ['192.168.1.2', 'tag-new-3'],
      ]);
    });

    it('should generate 1 alert for unique combination of terms, one of which is a number', async () => {
      const historicalDocuments = [
        { user: { name: 'user-0', id: 0 } },
        { user: { name: 'user-1', id: 1 } },
      ];
      const ruleExecutionDocuments = [{ user: { name: 'user-0', id: 1 } }];

      const testId = await newTermsTestExecutionSetup({
        historicalDocuments,
        ruleExecutionDocuments,
      });

      const rule: NewTermsRuleCreateProps = {
        ...getCreateNewTermsRulesSchemaMock('rule-1', true),
        index: ['new_terms'],
        new_terms_fields: ['user.name', 'user.id'],
        from: ruleExecutionStart,
        history_window_start: historicalWindowStart,
        query: `id: "${testId}"`,
      };

      const { previewId } = await previewRule({ supertest, rule });
      const previewAlerts = await getPreviewAlerts({ es, previewId });

      expect(previewAlerts.length).toEqual(1);
      expect(previewAlerts[0]._source?.['kibana.alert.new_terms']).toEqual(['user-0', 1]);
    });

    it('should generate 1 alert for unique combination of terms, one of which is a boolean', async () => {
      const rule: NewTermsRuleCreateProps = {
        ...getCreateNewTermsRulesSchemaMock('rule-1', true),
        index: ['new_terms'],
        new_terms_fields: ['user.name', 'user.enabled'],
        from: '2020-10-19T05:00:04.000Z',
        history_window_start: '2020-10-13T05:00:04.000Z',
      };

      const { previewId } = await previewRule({ supertest, rule });
      const previewAlerts = await getPreviewAlerts({ es, previewId });

      expect(previewAlerts.length).toEqual(1);
      expect(previewAlerts[0]._source?.['kibana.alert.new_terms']).toEqual(['user-0', false]);
    });

    it('should generate alerts for every term when history window is small', async () => {
      const rule: NewTermsRuleCreateProps = {
        ...getCreateNewTermsRulesSchemaMock('rule-1', true),
        new_terms_fields: ['host.name'],
        from: '2019-02-19T20:42:00.000Z',
        // Set the history_window_start close to 'from' so we should alert on all terms in the time range
        history_window_start: '2019-02-19T20:41:59.000Z',
      };

      const { previewId } = await previewRule({ supertest, rule });
      const previewAlerts = await getPreviewAlerts({ es, previewId });

      expect(previewAlerts.length).toEqual(5);
      const hostNames = previewAlerts
        .map((signal) => signal._source?.['kibana.alert.new_terms'])
        .sort();
      expect(hostNames[0]).toEqual(['suricata-sensor-amsterdam']);
      expect(hostNames[1]).toEqual(['suricata-sensor-san-francisco']);
      expect(hostNames[2]).toEqual(['zeek-newyork-sha-aa8df15']);
      expect(hostNames[3]).toEqual(['zeek-sensor-amsterdam']);
      expect(hostNames[4]).toEqual(['zeek-sensor-san-francisco']);
    });

    // github.com/elastic/kibana/issues/149920
    it('should generate 1 alert for new terms if query has wildcard in field path', async () => {
      // historical window documents
      const historicalDocuments = [
        {
          host: { name: 'host-0', ip: '127.0.0.1' },
        },
        {
          host: { name: 'host-1', ip: '127.0.0.2' },
        },
      ];

      // rule execution documents
      const ruleExecutionDocuments = [
        {
          host: { name: 'host-0', ip: '127.0.0.2' },
        },
        {
          host: { name: 'host-1', ip: '127.0.0.1' },
        },
      ];

      const testId = await newTermsTestExecutionSetup({
        historicalDocuments,
        ruleExecutionDocuments,
      });

      const rule: NewTermsRuleCreateProps = {
        ...getCreateNewTermsRulesSchemaMock('rule-1', true),
        index: ['new_terms'],
        new_terms_fields: ['host.name', 'host.ip'],
        from: ruleExecutionStart,
        history_window_start: historicalWindowStart,
        query: `id: "${testId}" and host.n*: host-0`,
      };

      const { previewId } = await previewRule({ supertest, rule });
      const previewAlerts = await getPreviewAlerts({ es, previewId });

      expect(previewAlerts.length).toEqual(1);

      expect(previewAlerts[0]._source?.['kibana.alert.new_terms']).toEqual(['host-0', '127.0.0.2']);
    });
    describe('null values', () => {
      it('should not generate alerts with null values for single field', async () => {
        const rule: NewTermsRuleCreateProps = {
          ...getCreateNewTermsRulesSchemaMock('rule-1', true),
          index: ['new_terms'],
          new_terms_fields: ['possibly_null_field'],
          from: '2020-10-19T05:00:04.000Z',
          history_window_start: '2020-10-13T05:00:04.000Z',
        };

        const { previewId } = await previewRule({ supertest, rule });
        const previewAlerts = await getPreviewAlerts({ es, previewId });

        expect(previewAlerts.length).toEqual(0);
      });

      it('should not generate alerts with null values for multiple fields', async () => {
        const rule: NewTermsRuleCreateProps = {
          ...getCreateNewTermsRulesSchemaMock('rule-1', true),
          index: ['new_terms'],
          new_terms_fields: ['possibly_null_field', 'host.name'],
          from: '2020-10-19T05:00:04.000Z',
          history_window_start: '2020-10-13T05:00:04.000Z',
        };

        const { previewId } = await previewRule({ supertest, rule });
        const previewAlerts = await getPreviewAlerts({ es, previewId });

        expect(previewAlerts.length).toEqual(0);
      });
    });

    describe('large arrays values', () => {
      it('should generate alerts for unique values in large array for single field from a single document', async () => {
        const rule: NewTermsRuleCreateProps = {
          ...getCreateNewTermsRulesSchemaMock('rule-1', true),
          index: ['new_terms'],
          new_terms_fields: ['large_array_20'],
          from: '2020-10-19T05:00:04.000Z',
          history_window_start: '2020-10-13T05:00:04.000Z',
        };

        const { previewId } = await previewRule({ supertest, rule });
        const previewAlerts = await getPreviewAlerts({ es, previewId, size: 100 });

        expect(previewAlerts.length).toEqual(20);
      });

      // There is a limit in ES for a number of emitted values in runtime field (100)
      // This test ensures rule run doesn't fail if processed fields in runtime script generates 100 values, hard limit for ES
      // For this test case: large_array_10 & large_array_5 have 100 unique combination in total
      it('should generate alerts for array fields that have 100 unique combination of values in runtime field', async () => {
        const rule: NewTermsRuleCreateProps = {
          ...getCreateNewTermsRulesSchemaMock('rule-1', true),
          index: ['new_terms'],
          new_terms_fields: ['large_array_10', 'large_array_5'],
          from: '2020-10-19T05:00:04.000Z',
          history_window_start: '2020-10-13T05:00:04.000Z',
        };

        const { previewId } = await previewRule({ supertest, rule });
        const previewAlerts = await getPreviewAlerts({ es, previewId, size: 200 });

        expect(previewAlerts.length).toEqual(100);
      });

      // There is a limit in ES for a number of emitted values in runtime field (100)
      // This test ensures rule run doesn't fail if processed fields in runtime script generates 200 values
      // In case of this test case: large_array_10 & large_array_20 have 200 unique combination in total
      // Rule run should not fail and should generate alerts
      it('should generate alert for array fields that have more than 200 unique combination of values in runtime field', async () => {
        const rule: NewTermsRuleCreateProps = {
          ...getCreateNewTermsRulesSchemaMock('rule-1', true),
          index: ['new_terms'],
          new_terms_fields: ['large_array_10', 'large_array_20'],
          from: '2020-10-19T05:00:04.000Z',
          history_window_start: '2020-10-13T05:00:04.000Z',
        };

        const { previewId } = await previewRule({ supertest, rule });
        const previewAlerts = await getPreviewAlerts({ es, previewId, size: 200 });

        expect(previewAlerts.length).toEqual(100);
      });

      it('should not miss alerts if rule execution value combinations number is greater than 100', async () => {
        // historical window documents
        // 100 combinations for 127.0.0.1 x host-0, host-1, ..., host-100
        const historicalDocuments = [
          {
            host: {
              name: Array.from(Array(100)).map((_, i) => `host-${100 + i}`),
              ip: ['127.0.0.1'],
            },
          },
        ];

        // rule execution documents
        // 100 old combinations for 127.0.0.1 x host-0, host-1, ..., host-99
        // 10 new combinations 127.0.0.1 x a-0, a-1, ..., a-9
        const ruleExecutionDocuments = [
          {
            host: {
              name: [
                ...Array.from(Array(100)).map((_, i) => `host-${100 + i}`),
                ...Array.from(Array(10)).map((_, i) => `a-${i}`),
              ],
              ip: ['127.0.0.1'],
            },
          },
        ];

        const testId = await newTermsTestExecutionSetup({
          historicalDocuments,
          ruleExecutionDocuments,
        });

        const rule: NewTermsRuleCreateProps = {
          ...getCreateNewTermsRulesSchemaMock('rule-1', true),
          index: ['new_terms'],
          new_terms_fields: ['host.name', 'host.ip'],
          from: ruleExecutionStart,
          history_window_start: historicalWindowStart,
          query: `id: "${testId}"`,
        };

        const { previewId } = await previewRule({ supertest, rule });
        const previewAlerts = await getPreviewAlerts({ es, previewId, size: 200 });

        // 10 alerts (with host.names a-[0-9]) should be generated
        expect(previewAlerts.length).toEqual(10);
      });

      it('should not miss alerts for high cardinality values in arrays, over 10.000 composite page size', async () => {
        // historical window documents
        // number of combinations is 50,000
        const historicalDocuments = [
          {
            host: {
              name: Array.from(Array(100)).map((_, i) => `host-${100 + i}`),
              domain: Array.from(Array(100)).map((_, i) => `domain-${100 + i}`),
            },
            user: {
              name: Array.from(Array(5)).map((_, i) => `user-${100 + i}`),
            },
          },
        ];

        // rule execution documents
        // number of combinations is 50,000 + new one
        const ruleExecutionDocuments = [
          {
            host: {
              name: Array.from(Array(100)).map((_, i) => `host-${100 + i}`),
              domain: Array.from(Array(100)).map((_, i) => `domain-${100 + i}`),
            },
            user: {
              name: Array.from(Array(5)).map((_, i) => `user-${100 + i}`),
            },
          },
          {
            host: {
              name: 'host-140',
              domain: 'domain-9999',
            },
            user: {
              name: 'user-9999',
            },
          },
        ];

        const testId = await newTermsTestExecutionSetup({
          historicalDocuments,
          ruleExecutionDocuments,
        });

        const rule: NewTermsRuleCreateProps = {
          ...getCreateNewTermsRulesSchemaMock('rule-1', true),
          index: ['new_terms'],
          new_terms_fields: ['host.name', 'host.domain', 'user.name'],
          from: ruleExecutionStart,
          history_window_start: historicalWindowStart,
          query: `id: "${testId}"`,
        };

        const { previewId } = await previewRule({ supertest, rule });
        const previewAlerts = await getPreviewAlerts({ es, previewId, size: 200 });

        // only 1 alert should be generated
        expect(previewAlerts.length).toEqual(1);
      });

      it('should not miss alerts for high cardinality values in arrays, over 10.000 composite page size spread over multiple pages', async () => {
        // historical window documents
        // number of combinations is 50,000
        const historicalDocuments = [
          {
            host: {
              name: Array.from(Array(100)).map((_, i) => `host-${100 + i}`),
              domain: Array.from(Array(100)).map((_, i) => `domain-${100 + i}`),
            },
            user: {
              name: Array.from(Array(5)).map((_, i) => `user-${100 + i}`),
            },
          },
        ];

        // rule execution documents
        // number of combinations is 50,000 + 4 new ones
        const ruleExecutionDocuments = [
          {
            host: {
              name: Array.from(Array(100)).map((_, i) => `host-${100 + i}`),
              domain: Array.from(Array(100)).map((_, i) => `domain-${100 + i}`),
            },
            user: {
              name: Array.from(Array(5)).map((_, i) => `user-${100 + i}`),
            },
          },
          {
            host: {
              name: 'host-102',
              domain: 'domain-9999',
            },
            user: {
              name: 'user-9999',
            },
          },
          {
            host: {
              name: 'host-140',
              domain: 'domain-9999',
            },
            user: {
              name: 'user-9999',
            },
          },
          {
            host: {
              name: 'host-133',
              domain: 'domain-9999',
            },
            user: {
              name: 'user-9999',
            },
          },
          {
            host: {
              name: 'host-132',
              domain: 'domain-9999',
            },
            user: {
              name: 'user-9999',
            },
          },
        ];

        const testId = await newTermsTestExecutionSetup({
          historicalDocuments,
          ruleExecutionDocuments,
        });

        const rule: NewTermsRuleCreateProps = {
          ...getCreateNewTermsRulesSchemaMock('rule-1', true),
          index: ['new_terms'],
          new_terms_fields: ['host.name', 'host.domain', 'user.name'],
          from: ruleExecutionStart,
          history_window_start: historicalWindowStart,
          query: `id: "${testId}"`,
        };

        const { previewId } = await previewRule({ supertest, rule });
        const previewAlerts = await getPreviewAlerts({ es, previewId, size: 200 });

        // only 4 alerts should be generated
        expect(previewAlerts.length).toEqual(4);
      });

      it('should not generate false positive alerts if rule historical window combinations overlap execution ones, which have more than 100', async () => {
        // historical window documents
        // number of combinations 400: [a, b] x domain-100, domain-101, ..., domain-299
        const historicalDocuments = [
          {
            host: {
              name: ['a', 'b'],
              domain: Array.from(Array(200)).map((_, i) => `domain-${100 + i}`),
            },
          },
        ];

        // rule execution documents
        // number of combinations 101: [a] x domain-100, domain-101, ..., domain-199 + b x domain-201
        // no new combination of values emitted
        const ruleExecutionDocuments = [
          {
            host: {
              name: 'a',
              domain: Array.from(Array(100)).map((_, i) => `domain-${100 + i}`),
            },
          },
          {
            host: {
              name: 'b',
              domain: 'domain-201',
            },
          },
        ];

        const testId = await newTermsTestExecutionSetup({
          historicalDocuments,
          ruleExecutionDocuments,
        });

        const rule: NewTermsRuleCreateProps = {
          ...getCreateNewTermsRulesSchemaMock('rule-1', true),
          index: ['new_terms'],
          new_terms_fields: ['host.name', 'host.domain'],
          from: ruleExecutionStart,
          history_window_start: historicalWindowStart,
          query: `id: "${testId}"`,
        };

        const { previewId } = await previewRule({ supertest, rule });
        const previewAlerts = await getPreviewAlerts({ es, previewId, size: 200 });

        expect(previewAlerts.length).toEqual(0);
      });

      it('should not generate false positive alerts if rule historical window combinations overlap execution ones, which have precisely 100', async () => {
        // historical window documents
        // number of combinations 400: [a, b] x domain-100, domain-101, ..., domain-299
        const historicalDocuments = [
          {
            host: {
              name: ['a', 'b'],
              domain: Array.from(Array(200)).map((_, i) => `domain-${100 + i}`),
            },
          },
        ];

        // rule execution documents
        // number of combinations 100: [a] x domain-100, domain-101, ..., domain-199
        // no new combination of values emitted
        const ruleExecutionDocuments = [
          {
            host: {
              name: 'a',
              domain: Array.from(Array(100)).map((_, i) => `domain-${100 + i}`),
            },
          },
        ];

        const testId = await newTermsTestExecutionSetup({
          historicalDocuments,
          ruleExecutionDocuments,
        });

        const rule: NewTermsRuleCreateProps = {
          ...getCreateNewTermsRulesSchemaMock('rule-1', true),
          index: ['new_terms'],
          new_terms_fields: ['host.name', 'host.domain'],
          from: ruleExecutionStart,
          history_window_start: historicalWindowStart,
          query: `id: "${testId}"`,
        };

        const { previewId } = await previewRule({ supertest, rule });
        const previewAlerts = await getPreviewAlerts({ es, previewId, size: 200 });

        expect(previewAlerts.length).toEqual(0);
      });
    });

    describe('timestamp override and fallback', () => {
      before(async () => {
        await esArchiver.load(
          'x-pack/solutions/security/test/fixtures/es_archives/security_solution/timestamp_fallback'
        );
        await esArchiver.load(
          'x-pack/solutions/security/test/fixtures/es_archives/security_solution/timestamp_override_3'
        );
      });
      after(async () => {
        await esArchiver.unload(
          'x-pack/solutions/security/test/fixtures/es_archives/security_solution/timestamp_fallback'
        );
        await esArchiver.unload(
          'x-pack/solutions/security/test/fixtures/es_archives/security_solution/timestamp_override_3'
        );
      });

      it('should generate the correct alerts', async () => {
        const rule: NewTermsRuleCreateProps = {
          ...getCreateNewTermsRulesSchemaMock('rule-1', true),
          // myfakeindex-3 does not have event.ingested mapped so we can test if the runtime field
          // 'kibana.combined_timestamp' handles unmapped fields properly
          index: ['timestamp-fallback-test', 'myfakeindex-3'],
          new_terms_fields: ['host.name'],
          from: '2020-12-16T16:00:00.000Z',
          // Set the history_window_start close to 'from' so we should alert on all terms in the time range
          history_window_start: '2020-12-16T15:59:00.000Z',
          timestamp_override: 'event.ingested',
        };

        const { previewId } = await previewRule({ supertest, rule });
        const previewAlerts = await getPreviewAlerts({ es, previewId });

        expect(previewAlerts.length).toEqual(2);
        const hostNames = previewAlerts
          .map((signal) => signal._source?.['kibana.alert.new_terms'])
          .sort();
        expect(hostNames[0]).toEqual(['host-3']);
        expect(hostNames[1]).toEqual(['host-4']);
      });
    });

    describe('with exceptions', () => {
      afterEach(async () => {
        await deleteAllExceptions(supertest, log);
      });

      it('should apply exceptions', async () => {
        const rule: NewTermsRuleCreateProps = {
          ...getCreateNewTermsRulesSchemaMock('rule-1', true),
          new_terms_fields: ['host.name'],
          from: '2019-02-19T20:42:00.000Z',
          // Set the history_window_start close to 'from' so we should alert on all terms in the time range
          history_window_start: '2019-02-19T20:41:59.000Z',
        };

        const { previewId } = await previewRuleWithExceptionEntries({
          supertest,
          log,
          rule,
          entries: [
            [
              {
                field: 'host.name',
                operator: 'included',
                type: 'match',
                value: 'zeek-sensor-san-francisco',
              },
            ],
          ],
        });
        const previewAlerts = await getPreviewAlerts({ es, previewId });

        expect(previewAlerts.length).toEqual(4);
        const hostNames = previewAlerts
          .map((signal) => signal._source?.['kibana.alert.new_terms'])
          .sort();
        expect(hostNames[0]).toEqual(['suricata-sensor-amsterdam']);
        expect(hostNames[1]).toEqual(['suricata-sensor-san-francisco']);
        expect(hostNames[2]).toEqual(['zeek-newyork-sha-aa8df15']);
        expect(hostNames[3]).toEqual(['zeek-sensor-amsterdam']);
      });
    });

    it('should work for max alerts > 100', async () => {
      const maxAlerts = 200;
      const rule: NewTermsRuleCreateProps = {
        ...getCreateNewTermsRulesSchemaMock('rule-1', true),
        new_terms_fields: ['process.pid'],
        from: '2018-02-19T20:42:00.000Z',
        // Set the history_window_start close to 'from' so we should alert on all terms in the time range
        history_window_start: '2018-02-19T20:41:59.000Z',
        max_signals: maxAlerts,
      };

      const { previewId } = await previewRule({ supertest, rule });
      const previewAlerts = await getPreviewAlerts({ es, previewId, size: maxAlerts * 2 });

      expect(previewAlerts.length).toEqual(maxAlerts);
      const processPids = previewAlerts
        .map((signal) => signal._source?.['kibana.alert.new_terms'])
        .sort();
      expect(processPids[0]).toEqual([1]);
    });

    describe('alerts should be be enriched', () => {
      before(async () => {
        // The first new term alert uses auditbeat data (host.id present), so EUID is id-based.
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
          ],
        });
      });

      after(async () => {
        await entityStoreV2.teardown();
      });

      it('should be enriched with host risk score', async () => {
        const rule: NewTermsRuleCreateProps = {
          ...getCreateNewTermsRulesSchemaMock('rule-1', true),
          new_terms_fields: ['host.name'],
          from: '2019-02-19T20:42:00.000Z',
          history_window_start: '2019-01-19T20:42:00.000Z',
        };

        const { previewId } = await previewRule({ supertest, rule });
        const previewAlerts = await getPreviewAlerts({ es, previewId });

        expect(previewAlerts[0]?._source?.host?.risk?.calculated_level).toEqual('Low');
        expect(previewAlerts[0]?._source?.host?.risk?.calculated_score_norm).toEqual(23);
      });
    });

    describe('with asset criticality', () => {
      before(async () => {
        await esArchiver.load(
          'x-pack/solutions/security/test/fixtures/es_archives/security_solution/ecs_compliant'
        );
        await entityStoreV2.setup({
          hosts: [
            {
              host: { name: ENRICHMENT_HOST_NAME },
              entity: { id: `host:${ENRICHMENT_HOST_NAME}`, type: 'host' },
              asset: { criticality: 'medium_impact' },
            },
          ],
        });
      });

      after(async () => {
        await esArchiver.unload(
          'x-pack/solutions/security/test/fixtures/es_archives/security_solution/ecs_compliant'
        );
        await entityStoreV2.teardown();
      });

      const { indexListOfDocuments } = dataGeneratorFactory({
        es,
        index: 'ecs_compliant',
        log,
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
          history_window_start: '2019-10-13T05:00:04.000Z',
          from: 'now-35m',
          interval: '30m',
        };

        const { previewId } = await previewRule({
          supertest,
          rule,
          timeframeEnd: new Date('2020-10-28T07:00:00.000Z'),
        });
        const previewAlerts = await getPreviewAlerts({ es, previewId });
        expect(previewAlerts.length).toBe(1);
        const fullAlert = previewAlerts[0]._source;

        expect(fullAlert?.['host.asset.criticality']).toBe('medium_impact');
      });
    });

    // skipped on MKI since feature flags are not supported there
    describe('@skipInServerlessMKI manual rule run', () => {
      beforeEach(async () => {
        await stopAllManualRuns(supertest);
        await esArchiver.load(
          'x-pack/solutions/security/test/fixtures/es_archives/security_solution/ecs_compliant'
        );
      });

      afterEach(async () => {
        await stopAllManualRuns(supertest);
        await deleteAllRules(supertest, log);
        await esArchiver.unload(
          'x-pack/solutions/security/test/fixtures/es_archives/security_solution/ecs_compliant'
        );
      });

      const { indexListOfDocuments } = dataGeneratorFactory({
        es,
        index: 'ecs_compliant',
        log,
      });

      it('alerts when run on a time range that the rule has not previously seen, and deduplicates if run there more than once', async () => {
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
          '@timestamp': moment().subtract(5, 'm').toISOString(),
          agent: {
            name: 'agent-1',
          },
        };

        await indexListOfDocuments([firstDocument, secondDocument]);

        const rule: NewTermsRuleCreateProps = {
          ...getCreateNewTermsRulesSchemaMock('rule-1', true),
          new_terms_fields: ['agent.name'],
          query: `id: "${id}"`,
          index: ['ecs_compliant'],
          history_window_start: 'now-1h',
          from: 'now-35m',
          interval: '30m',
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
        expect(allNewAlertsAfter2ManualRuns.hits.hits.length).toEqual(2);
      });

      it('does not alert if the manual run overlaps with a previous scheduled rule execution', async () => {
        const id = uuidv4();
        const firstTimestamp = moment(new Date());

        const firstDocument = {
          id,
          '@timestamp': firstTimestamp.toISOString(),
          agent: {
            name: 'agent-1',
          },
        };

        await indexListOfDocuments([firstDocument]);

        const rule: NewTermsRuleCreateProps = {
          ...getCreateNewTermsRulesSchemaMock('rule-1', true),
          new_terms_fields: ['agent.name'],
          query: `id: "${id}"`,
          index: ['ecs_compliant'],
          history_window_start: 'now-1h',
          from: 'now-35m',
          interval: '30m',
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

        const rule: NewTermsRuleCreateProps = {
          ...getCreateNewTermsRulesSchemaMock('rule-1', true),
          new_terms_fields: ['agent.name'],
          query: `id: "${id}"`,
          index: ['ecs_compliant'],
          history_window_start: 'now-1h',
          from: 'now-35m',
          interval: '30m',
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

        const rule: NewTermsRuleCreateProps = {
          ...getCreateNewTermsRulesSchemaMock('rule-1', true),
          new_terms_fields: ['agent.name'],
          query: `id: "${id}"`,
          index: ['ecs_compliant'],
          history_window_start: 'now-31m',
          from: 'now-30m',
          interval: '30m',
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
          '@timestamp': moment(firstTimestamp).add(40, 'm').toISOString(),
          agent: {
            name: 'agent-1',
          },
        };

        await indexListOfDocuments([secondDocument]);

        const secondBackfill = await scheduleRuleRun(supertest, [createdRule.id], {
          startDate: moment(firstTimestamp).add(39, 'm'),
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
      const rule: NewTermsRuleCreateProps = {
        ...getCreateNewTermsRulesSchemaMock('rule-1', true),
        index: ['new_terms'],
        new_terms_fields: ['host.name', 'host.ip'],
        from: ruleExecutionStart,
        history_window_start: historicalWindowStart,
        query: '*',
      };

      it('should not return requests property when not enabled', async () => {
        const { logs } = await previewRule({
          supertest,
          rule,
        });

        expect(logs[0].requests).toEqual(undefined);
      });

      it('should return requests property when enable_logged_requests set to true for single new term field', async () => {
        // historical window documents
        const historicalDocuments = [
          {
            host: { name: 'host-0', ip: '127.0.0.1' },
          },
          {
            host: { name: 'host-1', ip: '127.0.0.2' },
          },
        ];

        // rule execution documents
        const ruleExecutionDocuments = [
          {
            host: { name: 'host-0', ip: '127.0.0.2' },
          },
          {
            host: { name: 'host-2', ip: '127.0.0.1' },
          },
        ];

        const testId = await newTermsTestExecutionSetup({
          historicalDocuments,
          ruleExecutionDocuments,
        });

        const { logs } = await previewRule({
          supertest,
          rule: { ...rule, query: `id: "${testId}"`, new_terms_fields: ['host.name'] },
          enableLoggedRequests: true,
        });

        expect(logs[0].requests?.length).toEqual(4);
        const requests = logs[0].requests ?? [];

        expect(requests[0].description).toBe('Find all values');
        expect(requests[0].request_type).toBe('findAllTerms');

        expect(requests[1].description).toBe('Find new values');
        expect(requests[1].request_type).toBe('findNewTerms');

        expect(requests[2].description).toBe('Find documents associated with new values');
        expect(requests[2].request_type).toBe('findDocuments');

        expect(requests[3].description).toBe('Find all values after host.name: host-2');
      });

      it('should return requests property when enable_logged_requests set to true for multiple fields', async () => {
        // historical window documents
        const historicalDocuments = [
          {
            host: { name: 'host-0', ip: '127.0.0.1' },
          },
          {
            host: { name: 'host-1', ip: '127.0.0.2' },
          },
        ];

        // rule execution documents
        const ruleExecutionDocuments = [
          {
            host: { name: 'host-0', ip: '127.0.0.2' },
          },
          {
            host: { name: 'host-1', ip: '127.0.0.1' },
          },
        ];

        const testId = await newTermsTestExecutionSetup({
          historicalDocuments,
          ruleExecutionDocuments,
        });

        const { logs } = await previewRule({
          supertest,
          rule: { ...rule, query: `id: "${testId}"` },
          enableLoggedRequests: true,
        });

        expect(logs[0].requests?.length).toEqual(4);
        const requests = logs[0].requests ?? [];

        expect(requests[0].description).toBe('Find all values');
        expect(requests[0].request_type).toBe('findAllTerms');

        expect(requests[1].description).toBe('Find new values');
        expect(requests[1].request_type).toBe('findNewTerms');

        expect(requests[2].description).toBe('Find documents associated with new values');
        expect(requests[2].request_type).toBe('findDocuments');
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
        const timestamp = new Date().toISOString();

        // Historical documents with different namespaces
        const historicalDocNamespace1 = {
          id,
          '@timestamp': moment(timestamp).subtract(2, 'days').toISOString(),
          data_stream: { namespace: 'namespace1' },
          host: { name: 'host-historical-1' },
        };
        const historicalDocNamespace2 = {
          id,
          '@timestamp': moment(timestamp).subtract(2, 'days').toISOString(),
          data_stream: { namespace: 'namespace2' },
          host: { name: 'host-historical-2' },
        };

        // Rule execution documents with different namespaces
        const ruleExecutionDocNamespace1 = {
          id,
          '@timestamp': timestamp,
          data_stream: { namespace: 'namespace1' },
          host: { name: 'host-new-1' },
        };
        const ruleExecutionDocNamespace2 = {
          id,
          '@timestamp': timestamp,
          data_stream: { namespace: 'namespace2' },
          host: { name: 'host-new-2' },
        };
        const ruleExecutionDocNamespace3 = {
          id,
          '@timestamp': timestamp,
          data_stream: { namespace: 'namespace3' },
          host: { name: 'host-new-3' },
        };

        await indexEnhancedDocuments({
          interval: [moment(timestamp).subtract(2, 'days').toISOString(), timestamp],
          id,
          documents: [historicalDocNamespace1, historicalDocNamespace2],
        });

        await indexEnhancedDocuments({
          id,
          documents: [
            ruleExecutionDocNamespace1,
            ruleExecutionDocNamespace2,
            ruleExecutionDocNamespace3,
          ],
        });

        // Set UI setting to include only namespace1 and namespace2
        await setAdvancedSettings(supertest, {
          [INCLUDED_DATA_STREAM_NAMESPACES_FOR_RULE_EXECUTION]: ['namespace1', 'namespace2'],
        });

        const rule: NewTermsRuleCreateProps = {
          ...getCreateNewTermsRulesSchemaMock('rule-1', true),
          query: `id: "${id}"`,
          index: ['new_terms'],
          new_terms_fields: ['host.name'],
          from: 'now-2d',
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
        expect(previewAlerts.length).toEqual(4);
        // @ts-expect-error namespace does not exist on type
        const namespaces = previewAlerts.map((alert) => alert._source?.data_stream?.namespace);
        expect(namespaces).toContain('namespace1');
        expect(namespaces).toContain('namespace2');
        expect(namespaces).not.toContain('namespace3');
      });
    });
  });
};
