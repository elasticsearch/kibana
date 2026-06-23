/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import { get, omit } from 'lodash';
import moment from 'moment';
import expect from 'expect';

import {
  ALERT_REASON,
  ALERT_RULE_UUID,
  ALERT_STATUS,
  ALERT_RULE_NAMESPACE,
  ALERT_RULE_UPDATED_AT,
  ALERT_UUID,
  ALERT_WORKFLOW_STATUS,
  SPACE_IDS,
  VERSION,
  ALERT_WORKFLOW_TAGS,
  ALERT_WORKFLOW_ASSIGNEE_IDS,
  ALERT_SUPPRESSION_DOCS_COUNT,
  ALERT_RULE_EXECUTION_TYPE,
} from '@kbn/rule-data-utils';
import { flattenWithPrefix } from '@kbn/securitysolution-rules';
import type { ThreatMapping } from '@kbn/security-solution-plugin/common/api/detection_engine/model/rule_schema';

import type { ThreatMatchRuleCreateProps } from '@kbn/security-solution-plugin/common/api/detection_engine';

import { ENRICHMENT_TYPES } from '@kbn/security-solution-plugin/common/cti/constants';
import { INCLUDED_DATA_STREAM_NAMESPACES_FOR_RULE_EXECUTION } from '@kbn/security-solution-plugin/common/constants';
import type { Ancestor } from '@kbn/security-solution-plugin/server/lib/detection_engine/rule_types/types';
import {
  ALERT_ANCESTORS,
  ALERT_DEPTH,
  ALERT_ORIGINAL_EVENT_ACTION,
  ALERT_ORIGINAL_EVENT_CATEGORY,
  ALERT_ORIGINAL_EVENT_MODULE,
  ALERT_ORIGINAL_TIME,
} from '@kbn/security-solution-plugin/common/field_maps/field_names';
import { RuleExecutionStatusEnum } from '@kbn/security-solution-plugin/common/api/detection_engine/rule_monitoring';
import { getMaxSignalsWarning as getMaxAlertsWarning } from '@kbn/security-solution-plugin/server/lib/detection_engine/rule_types/utils/utils';
import { deleteAllAlerts, deleteAllRules, createRule } from '@kbn/detections-response-ftr-services';
import {
  previewRule,
  getAlerts,
  getPreviewAlerts,
  dataGeneratorFactory,
  getThreatMatchRuleForAlertTesting,
  scheduleRuleRun,
  stopAllManualRuns,
  waitForBackfillExecuted,
  setAdvancedSettings,
} from '../../../../utils';
import type { FtrProviderContext } from '../../../../../../ftr_provider_context';
import { EsArchivePathBuilder } from '../../../../../../es_archive_path_builder';
import { EntityStoreV2EnrichmentSetup } from '../../entity_store_v2_enrichment_setup';

// Entity fields for the auditbeat record with ancestor _id = '7yJ-B2kBR346wHgnhlMn'.
const ENRICHMENT_HOST_ID = '2ce8b1e7d69e4a1d9c6bcddc473da9d9';
const ENRICHMENT_HOST_NAME = 'zeek-sensor-amsterdam';
const ENRICHMENT_HOST_EUID = `host:${ENRICHMENT_HOST_ID}`;

const createThreatMatchRule = ({
  name = 'Query with a rule id',
  index = ['auditbeat-*'],
  query = '*:*',
  rule_id = 'rule-1',
  threat_indicator_path = 'threat.indicator',
  threat_query = 'source.ip: "188.166.120.93"', // narrow things down with a query to a specific source ip
  threat_index = ['auditbeat-*'],
  threat_mapping = [
    // We match host.name against host.name
    {
      entries: [
        {
          field: 'host.name',
          value: 'host.name',
          type: 'mapping',
        },
      ],
    },
  ],
  override = {},
}: {
  threat_mapping?: ThreatMapping;
  name?: string;
  query?: string;
  rule_id?: string;
  index?: string[];
  threat_index?: string[];
  threat_query?: string;
  threat_indicator_path?: string;
  override?: any;
} = {}): ThreatMatchRuleCreateProps => ({
  description: 'Detecting root and admin users',
  name,
  severity: 'high',
  index,
  type: 'threat_match',
  risk_score: 55,
  language: 'kuery',
  rule_id,
  from: '1900-01-01T00:00:00.000Z',
  query,
  threat_query,
  threat_index,
  threat_mapping,
  threat_filters: [],
  ...override,
  threat_indicator_path,
});

const threatMatchRuleEcsComplaint = (id: string): ThreatMatchRuleCreateProps => ({
  ...getThreatMatchRuleForAlertTesting(['ecs_compliant']),
  query: `id:${id} and NOT agent.type:threat`,
  threat_query: `id:${id} and agent.type:threat`,
  name: 'ALert suppression IM test rule',
  from: 'now-35m',
  interval: '30m',
  timestamp_override: 'event.ingested',
  timestamp_override_fallback_disabled: false,
});

function alertsAreTheSame(alertsA: any[], alertsB: any[]): void {
  const mapAlert = (alert: any) => {
    return omit(alert._source, [
      '@timestamp',
      'kibana.alert.last_detected',
      'kibana.rule.created_at',
      'kibana.rule.execution.uuid',
      'kibana.name.execution.uuid',
      'kibana.alert.rule.parameters',
      'kibana.alert.rule.rule_id',
      'kibana.alert.rule.name',
      'kibana.alert.rule.created_at',
      'kibana.alert.rule.updated_at',
      'kibana.alert.rule.uuid',
      'kibana.alert.rule.execution.uuid',
      'kibana.alert.rule.execution.timestamp',
      'kibana.alert.intended_timestamp',
      'kibana.alert.start',
      'kibana.alert.reason',
      'kibana.alert.uuid',
      'kibana.alert.url',
    ]);
  };

  const sort = (alerts: any[]) =>
    alerts.sort((a: any, b: any) => a.message.localeCompare(b.message));

  expect(sort(alertsA.map(mapAlert))).toEqual(sort(alertsB.map(mapAlert)));
}

const eventDoc = (id: string, timestamp: string) => ({
  id,
  '@timestamp': timestamp,
  host: { name: 'host-a' },
});

const threatDoc = (id: string, timestamp: string) => ({
  id,
  '@timestamp': timestamp,
  host: { name: 'host-a' },
  'agent.type': 'threat',
});

export default ({ getService }: FtrProviderContext) => {
  const esArchiver = getService('esArchiver');
  const supertest = getService('supertest');
  const es = getService('es');
  const log = getService('log');
  // TODO: add a new service for loading archiver files similar to "getService('es')"
  const config = getService('config');
  const isServerless = config.get('serverless');
  const utils = getService('securitySolutionUtils');
  const entityStoreV2 = EntityStoreV2EnrichmentSetup(getService);
  const dataPathBuilder = new EsArchivePathBuilder(isServerless);
  const audibeatHostsPath = dataPathBuilder.getPath('auditbeat/hosts');
  const threatIntelPath = dataPathBuilder.getPath('filebeat/threat_intel');

  const { indexListOfDocuments } = dataGeneratorFactory({
    es,
    index: 'ecs_compliant',
    log,
  });

  /**
   * Specific api integration tests for threat matching rule type
   */
  describe('@ess @serverless @serverlessQA Threat match type rules', () => {
    before(async () => {
      await esArchiver.load(audibeatHostsPath);
      await esArchiver.load(
        'x-pack/solutions/security/test/fixtures/es_archives/security_solution/ecs_compliant'
      );
    });

    after(async () => {
      await esArchiver.unload(audibeatHostsPath);
      await deleteAllAlerts(supertest, log, es);
      await deleteAllRules(supertest, log);
      await esArchiver.unload(
        'x-pack/solutions/security/test/fixtures/es_archives/security_solution/ecs_compliant'
      );
    });

    // First 2 test creates a real rule - remaining tests use preview API
    it('should be able to execute and get all alerts when doing a specific query (terms query)', async () => {
      const username = await utils.getUsername();
      const rule: ThreatMatchRuleCreateProps = createThreatMatchRule();

      const createdRule = await createRule(supertest, log, rule);
      const alerts = await getAlerts(
        supertest,
        log,
        es,
        createdRule,
        RuleExecutionStatusEnum.succeeded,
        100
      );
      expect(alerts.hits.hits).toHaveLength(88);
      const fullSource = alerts.hits.hits.find(
        (alert) => (alert._source?.[ALERT_ANCESTORS] as Ancestor[])[0].id === '7yJ-B2kBR346wHgnhlMn'
      );
      const fullAlert = fullSource?._source;
      if (!fullAlert) {
        return expect(fullAlert).toBeTruthy();
      }
      expect(fullAlert).toEqual({
        ...fullAlert,
        '@timestamp': fullAlert['@timestamp'],
        agent: {
          ephemeral_id: '1b4978a0-48be-49b1-ac96-323425b389ab',
          hostname: 'zeek-sensor-amsterdam',
          id: 'e52588e6-7aa3-4c89-a2c4-d6bc5c286db1',
          type: 'auditbeat',
          version: '8.0.0',
        },
        auditd: {
          data: {
            hostname: '46.101.47.213',
            op: 'PAM:bad_ident',
            terminal: 'ssh',
          },
          message_type: 'user_err',
          result: 'fail',
          sequence: 2267,
          session: 'unset',
          summary: {
            actor: {
              primary: 'unset',
              secondary: 'root',
            },
            how: '/usr/sbin/sshd',
            object: {
              primary: 'ssh',
              secondary: '46.101.47.213',
              type: 'user-session',
            },
          },
        },
        cloud: {
          instance: {
            id: '133551048',
          },
          provider: 'digitalocean',
          region: 'ams3',
        },
        ecs: {
          version: '1.0.0-beta2',
        },
        event: {
          action: 'error',
          category: 'user-login',
          module: 'auditd',
        },
        'event.kind': 'signal',
        host: {
          architecture: 'x86_64',
          containerized: false,
          hostname: 'zeek-sensor-amsterdam',
          id: '2ce8b1e7d69e4a1d9c6bcddc473da9d9',
          name: 'zeek-sensor-amsterdam',
          os: {
            codename: 'bionic',
            family: 'debian',
            kernel: '4.15.0-45-generic',
            name: 'Ubuntu',
            platform: 'ubuntu',
            version: '18.04.2 LTS (Bionic Beaver)',
          },
        },
        network: {
          direction: 'incoming',
        },
        process: {
          executable: '/usr/sbin/sshd',
          pid: 32739,
        },
        service: {
          type: 'auditd',
        },
        source: {
          ip: '46.101.47.213',
        },
        user: {
          audit: {
            id: 'unset',
          },
          id: '0',
          name: 'root',
        },
        [ALERT_ANCESTORS]: [
          {
            id: '7yJ-B2kBR346wHgnhlMn',
            type: 'event',
            index: 'auditbeat-8.0.0-2019.02.19-000001',
            depth: 0,
          },
        ],
        [ALERT_DEPTH]: 1,
        [ALERT_ORIGINAL_EVENT_ACTION]: 'error',
        [ALERT_ORIGINAL_EVENT_CATEGORY]: 'user-login',
        [ALERT_ORIGINAL_EVENT_MODULE]: 'auditd',
        [ALERT_ORIGINAL_TIME]: fullAlert[ALERT_ORIGINAL_TIME],
        [ALERT_REASON]:
          'user-login event with source 46.101.47.213 by root on zeek-sensor-amsterdam created high alert Query with a rule id.',
        [ALERT_RULE_UUID]: fullAlert[ALERT_RULE_UUID],
        [ALERT_STATUS]: 'active',
        [ALERT_UUID]: fullAlert[ALERT_UUID],
        [ALERT_WORKFLOW_STATUS]: 'open',
        [ALERT_WORKFLOW_TAGS]: [],
        [ALERT_WORKFLOW_ASSIGNEE_IDS]: [],
        [SPACE_IDS]: ['default'],
        [VERSION]: fullAlert[VERSION],
        threat: {
          enrichments: get(fullAlert, 'threat.enrichments'),
        },
        ...flattenWithPrefix(ALERT_RULE_NAMESPACE, {
          actions: [],
          author: [],
          category: 'Indicator Match Rule',
          consumer: 'siem',
          created_by: username,
          description: 'Detecting root and admin users',
          enabled: true,
          exceptions_list: [],
          false_positives: [],
          from: '1900-01-01T00:00:00.000Z',
          immutable: false,
          interval: '5m',
          max_signals: 100,
          name: 'Query with a rule id',
          producer: 'siem',
          references: [],
          risk_score: 55,
          risk_score_mapping: [],
          rule_type_id: 'siem.indicatorRule',
          severity: 'high',
          severity_mapping: [],
          tags: [],
          threat: [],
          to: 'now',
          type: 'threat_match',
          updated_at: fullAlert[ALERT_RULE_UPDATED_AT],
          updated_by: username,
          uuid: fullAlert[ALERT_RULE_UUID],
          version: 1,
        }),
      });
    });
    it('should be able to execute and get all alerts when doing a specific query (match query)', async () => {
      const username = await utils.getUsername();
      const rule: ThreatMatchRuleCreateProps = createThreatMatchRule({
        threat_mapping: [
          // We match host.name against host.name
          {
            entries: [
              {
                field: 'host.name',
                value: 'host.name',
                type: 'mapping',
              },
              {
                field: 'host.name',
                value: 'host.name',
                type: 'mapping',
              },
            ],
          },
        ],
      });

      const createdRule = await createRule(supertest, log, rule);
      const alerts = await getAlerts(
        supertest,
        log,
        es,
        createdRule,
        RuleExecutionStatusEnum.succeeded,
        100
      );
      expect(alerts.hits.hits).toHaveLength(88);
      const fullSource = alerts.hits.hits.find(
        (alert) => (alert._source?.[ALERT_ANCESTORS] as Ancestor[])[0].id === '7yJ-B2kBR346wHgnhlMn'
      );
      const fullAlert = fullSource?._source;
      if (!fullAlert) {
        return expect(fullAlert).toBeTruthy();
      }
      expect(fullAlert).toEqual({
        ...fullAlert,
        '@timestamp': fullAlert['@timestamp'],
        agent: {
          ephemeral_id: '1b4978a0-48be-49b1-ac96-323425b389ab',
          hostname: 'zeek-sensor-amsterdam',
          id: 'e52588e6-7aa3-4c89-a2c4-d6bc5c286db1',
          type: 'auditbeat',
          version: '8.0.0',
        },
        auditd: {
          data: {
            hostname: '46.101.47.213',
            op: 'PAM:bad_ident',
            terminal: 'ssh',
          },
          message_type: 'user_err',
          result: 'fail',
          sequence: 2267,
          session: 'unset',
          summary: {
            actor: {
              primary: 'unset',
              secondary: 'root',
            },
            how: '/usr/sbin/sshd',
            object: {
              primary: 'ssh',
              secondary: '46.101.47.213',
              type: 'user-session',
            },
          },
        },
        cloud: {
          instance: {
            id: '133551048',
          },
          provider: 'digitalocean',
          region: 'ams3',
        },
        ecs: {
          version: '1.0.0-beta2',
        },
        event: {
          action: 'error',
          category: 'user-login',
          module: 'auditd',
        },
        'event.kind': 'signal',
        host: {
          architecture: 'x86_64',
          containerized: false,
          hostname: 'zeek-sensor-amsterdam',
          id: '2ce8b1e7d69e4a1d9c6bcddc473da9d9',
          name: 'zeek-sensor-amsterdam',
          os: {
            codename: 'bionic',
            family: 'debian',
            kernel: '4.15.0-45-generic',
            name: 'Ubuntu',
            platform: 'ubuntu',
            version: '18.04.2 LTS (Bionic Beaver)',
          },
        },
        network: {
          direction: 'incoming',
        },
        process: {
          executable: '/usr/sbin/sshd',
          pid: 32739,
        },
        service: {
          type: 'auditd',
        },
        source: {
          ip: '46.101.47.213',
        },
        user: {
          audit: {
            id: 'unset',
          },
          id: '0',
          name: 'root',
        },
        [ALERT_ANCESTORS]: [
          {
            id: '7yJ-B2kBR346wHgnhlMn',
            type: 'event',
            index: 'auditbeat-8.0.0-2019.02.19-000001',
            depth: 0,
          },
        ],
        [ALERT_DEPTH]: 1,
        [ALERT_ORIGINAL_EVENT_ACTION]: 'error',
        [ALERT_ORIGINAL_EVENT_CATEGORY]: 'user-login',
        [ALERT_ORIGINAL_EVENT_MODULE]: 'auditd',
        [ALERT_ORIGINAL_TIME]: fullAlert[ALERT_ORIGINAL_TIME],
        [ALERT_REASON]:
          'user-login event with source 46.101.47.213 by root on zeek-sensor-amsterdam created high alert Query with a rule id.',
        [ALERT_RULE_UUID]: fullAlert[ALERT_RULE_UUID],
        [ALERT_STATUS]: 'active',
        [ALERT_UUID]: fullAlert[ALERT_UUID],
        [ALERT_WORKFLOW_STATUS]: 'open',
        [SPACE_IDS]: ['default'],
        [VERSION]: fullAlert[VERSION],
        threat: {
          enrichments: get(fullAlert, 'threat.enrichments'),
        },
        ...flattenWithPrefix(ALERT_RULE_NAMESPACE, {
          actions: [],
          author: [],
          category: 'Indicator Match Rule',
          consumer: 'siem',
          created_by: username,
          description: 'Detecting root and admin users',
          enabled: true,
          exceptions_list: [],
          false_positives: [],
          from: '1900-01-01T00:00:00.000Z',
          immutable: false,
          interval: '5m',
          max_signals: 100,
          name: 'Query with a rule id',
          producer: 'siem',
          references: [],
          risk_score: 55,
          risk_score_mapping: [],
          rule_type_id: 'siem.indicatorRule',
          severity: 'high',
          severity_mapping: [],
          tags: [],
          threat: [],
          to: 'now',
          type: 'threat_match',
          updated_at: fullAlert[ALERT_RULE_UPDATED_AT],
          updated_by: username,
          uuid: fullAlert[ALERT_RULE_UUID],
          version: 1,
        }),
      });
    });

    it('generates max alerts warning when circuit breaker is hit', async () => {
      const rule: ThreatMatchRuleCreateProps = { ...createThreatMatchRule(), max_signals: 87 }; // Query generates 88 alerts with current esArchive
      const { logs } = await previewRule({ supertest, rule });
      expect(logs[0].warnings).toContain(getMaxAlertsWarning());
    });

    it('terms and match should have the same alerts with pagination', async () => {
      const termRule: ThreatMatchRuleCreateProps = createThreatMatchRule({
        query: 'source.ip: 8.42.77.171', // narrow amount of alerts to 6
        override: {
          items_per_search: 2,
          concurrent_searches: 1,
        },
      });

      const matchRule: ThreatMatchRuleCreateProps = createThreatMatchRule({
        override: {
          items_per_search: 1,
          concurrent_searches: 1,
        },
        query: 'source.ip: 8.42.77.171', // narrow amount of alerts to 6
        name: 'Math rule',
        rule_id: 'rule-2',
        threat_mapping: [
          // We match host.name against host.name
          {
            entries: [
              {
                field: 'host.name',
                value: 'host.name',
                type: 'mapping',
              },
              {
                field: 'host.name',
                value: 'host.name',
                type: 'mapping',
              },
            ],
          },
        ],
      });

      const createdRuleTerm = await createRule(supertest, log, termRule);
      const createdRuleMatch = await createRule(supertest, log, matchRule);
      const alertsTerm = await getAlerts(
        supertest,
        log,
        es,
        createdRuleTerm,
        RuleExecutionStatusEnum.succeeded,
        100
      );
      const alertsMatch = await getAlerts(
        supertest,
        log,
        es,
        createdRuleMatch,
        RuleExecutionStatusEnum.succeeded,
        100
      );

      alertsAreTheSame(alertsTerm.hits.hits, alertsMatch.hits.hits);
    });

    it('should return 0 matches if the mapping does not match against anything in the mapping', async () => {
      const rule: ThreatMatchRuleCreateProps = createThreatMatchRule({
        threat_mapping: [
          // We match host.name against host.name
          {
            entries: [
              {
                field: 'host.name',
                value: 'invalid.mapping.value', // invalid mapping value
                type: 'mapping',
              },
            ],
          },
        ],
      });

      const { previewId } = await previewRule({ supertest, rule });
      const previewAlerts = await getPreviewAlerts({ es, previewId });
      expect(previewAlerts).toHaveLength(0);
    });

    it('should return 0 alerts when using an AND and one of the clauses does not have data', async () => {
      const rule: ThreatMatchRuleCreateProps = createThreatMatchRule({
        threat_mapping: [
          {
            entries: [
              {
                field: 'source.ip',
                value: 'source.ip',
                type: 'mapping',
              },
              {
                field: 'source.ip',
                value: 'destination.ip', // All records from the threat query do NOT have destination.ip, so those records that do not should drop this entire AND clause.
                type: 'mapping',
              },
            ],
          },
        ],
      });

      const { previewId } = await previewRule({ supertest, rule });
      const previewAlerts = await getPreviewAlerts({ es, previewId });
      expect(previewAlerts).toHaveLength(0);
    });

    it('should return 0 alerts when using an AND and one of the clauses has a made up value that does not exist', async () => {
      const rule: ThreatMatchRuleCreateProps = createThreatMatchRule({
        threat_mapping: [
          {
            entries: [
              {
                field: 'source.ip',
                value: 'source.ip',
                type: 'mapping',
              },
              {
                field: 'source.ip',
                value: 'made.up.non.existent.field', // made up field should not match
                type: 'mapping',
              },
            ],
          },
        ],
      });

      const { previewId } = await previewRule({ supertest, rule });
      const previewAlerts = await getPreviewAlerts({ es, previewId });
      expect(previewAlerts).toHaveLength(0);
    });

    describe('timeout behavior', () => {
      // TODO: unskip this and see if we can make it not flaky
      it('will return an error if a rule execution exceeds the rule interval', async () => {
        const rule: ThreatMatchRuleCreateProps = createThreatMatchRule({
          override: {
            concurrent_searches: 1,
            interval: '1s', // short interval
            items_per_search: 1, // iterate only 1 threat item per loop to ensure we're slow
          },
        });

        const { logs } = await previewRule({ supertest, rule });
        expect(logs[0].errors[0]).toContain('execution has exceeded its allotted interval');
      });
    });

    describe('indicator enrichment: threat-first search', () => {
      before(async () => {
        await esArchiver.load(threatIntelPath);
      });

      after(async () => {
        await esArchiver.unload(threatIntelPath);
      });

      it('enriches alerts with the single indicator that matched', async () => {
        const rule: ThreatMatchRuleCreateProps = createThreatMatchRule({
          threat_mapping: [
            {
              entries: [
                {
                  value: 'threat.indicator.domain',
                  field: 'destination.ip',
                  type: 'mapping',
                },
              ],
            },
          ],
          threat_query: 'threat.indicator.domain: 159.89.119.67', // narrow things down to indicators with a domain
          threat_index: ['filebeat-*'],
        });

        const { previewId } = await previewRule({ supertest, rule });
        const previewAlerts = await getPreviewAlerts({ es, previewId });
        expect(previewAlerts).toHaveLength(2);

        const threats = previewAlerts.map((hit) => hit._source?.threat);
        expect(threats).toEqual([
          {
            enrichments: [
              {
                indicator: {
                  description: "domain should match the auditbeat hosts' data's source.ip",
                  domain: '159.89.119.67',
                  first_seen: '2021-01-26T11:09:04.000Z',
                  provider: 'geenensp',
                  url: {
                    full: 'http://159.89.119.67:59600/bin.sh',
                    scheme: 'http',
                  },
                  type: 'url',
                },
                matched: {
                  atomic: '159.89.119.67',
                  id: '978783',
                  index: 'filebeat-8.0.0-2021.01.26-000001',
                  field: 'destination.ip',
                  type: ENRICHMENT_TYPES.IndicatorMatchRule,
                },
              },
            ],
          },
          {
            enrichments: [
              {
                indicator: {
                  description: "domain should match the auditbeat hosts' data's source.ip",
                  domain: '159.89.119.67',
                  first_seen: '2021-01-26T11:09:04.000Z',
                  provider: 'geenensp',
                  url: {
                    full: 'http://159.89.119.67:59600/bin.sh',
                    scheme: 'http',
                  },
                  type: 'url',
                },
                matched: {
                  atomic: '159.89.119.67',
                  id: '978783',
                  index: 'filebeat-8.0.0-2021.01.26-000001',
                  field: 'destination.ip',
                  type: ENRICHMENT_TYPES.IndicatorMatchRule,
                },
              },
            ],
          },
        ]);
      });

      it('enriches alerts with multiple indicators if several matched', async () => {
        const rule: ThreatMatchRuleCreateProps = createThreatMatchRule({
          query: 'NOT source.port:35326', // specify query to have alerts more than treat indicators, but only 1 will match
          threat_query: 'threat.indicator.ip: *',
          threat_index: ['filebeat-*'], // Mimics indicators from the filebeat MISP module
          threat_mapping: [
            {
              entries: [
                {
                  value: 'threat.indicator.ip',
                  field: 'source.ip',
                  type: 'mapping',
                },
              ],
            },
          ],
        });
        const { previewId } = await previewRule({ supertest, rule });
        const previewAlerts = await getPreviewAlerts({ es, previewId });
        expect(previewAlerts).toHaveLength(1);

        const [threat] = previewAlerts.map((hit) => hit._source?.threat) as Array<{
          enrichments: unknown[];
        }>;

        expect(threat.enrichments).toEqual(
          expect.arrayContaining([
            {
              indicator: {
                description: 'this should match auditbeat/hosts on both port and ip',
                first_seen: '2021-01-26T11:06:03.000Z',
                ip: '45.115.45.3',
                port: 57324,
                provider: 'geenensp',
                type: 'url',
              },
              matched: {
                atomic: '45.115.45.3',
                id: '978785',
                index: 'filebeat-8.0.0-2021.01.26-000001',
                field: 'source.ip',
                type: ENRICHMENT_TYPES.IndicatorMatchRule,
              },
            },
            {
              indicator: {
                description: 'this should match auditbeat/hosts on ip',
                first_seen: '2021-01-26T11:06:03.000Z',
                ip: '45.115.45.3',
                provider: 'other_provider',
                type: 'ip',
              },

              matched: {
                atomic: '45.115.45.3',
                id: '978787',
                index: 'filebeat-8.0.0-2021.01.26-000001',
                field: 'source.ip',
                type: ENRICHMENT_TYPES.IndicatorMatchRule,
              },
            },
          ])
        );
      });

      it('adds a single indicator that matched multiple fields', async () => {
        const rule: ThreatMatchRuleCreateProps = createThreatMatchRule({
          query: 'NOT source.port:35326', // specify query to have alerts more than treat indicators, but only 1 will match
          threat_query: 'threat.indicator.port: 57324 or threat.indicator.ip:45.115.45.3', // narrow our query to a single indicator
          threat_index: ['filebeat-*'], // Mimics indicators from the filebeat MISP module
          threat_mapping: [
            {
              entries: [
                {
                  value: 'threat.indicator.port',
                  field: 'source.port',
                  type: 'mapping',
                },
              ],
            },
            {
              entries: [
                {
                  value: 'threat.indicator.ip',
                  field: 'source.ip',
                  type: 'mapping',
                },
              ],
            },
          ],
        });

        const { previewId } = await previewRule({ supertest, rule });
        const previewAlerts = await getPreviewAlerts({ es, previewId });
        expect(previewAlerts).toHaveLength(1);

        const [threat] = previewAlerts.map((hit) => hit._source?.threat) as Array<{
          enrichments: unknown[];
        }>;

        expect(threat.enrichments).toEqual(
          expect.arrayContaining([
            {
              indicator: {
                description: 'this should match auditbeat/hosts on both port and ip',
                first_seen: '2021-01-26T11:06:03.000Z',
                ip: '45.115.45.3',
                port: 57324,
                provider: 'geenensp',
                type: 'url',
              },
              matched: {
                atomic: '45.115.45.3',
                id: '978785',
                index: 'filebeat-8.0.0-2021.01.26-000001',
                field: 'source.ip',
                type: ENRICHMENT_TYPES.IndicatorMatchRule,
              },
            },
            // We do not merge matched indicators during enrichment, so in
            // certain circumstances a given indicator document could appear
            // multiple times in an enriched alert (albeit with different
            // threat.indicator.matched data). That's the case with the
            // first and third indicators matched, here.
            {
              indicator: {
                description: 'this should match auditbeat/hosts on both port and ip',
                first_seen: '2021-01-26T11:06:03.000Z',
                ip: '45.115.45.3',
                port: 57324,
                provider: 'geenensp',
                type: 'url',
              },

              matched: {
                atomic: 57324,
                id: '978785',
                index: 'filebeat-8.0.0-2021.01.26-000001',
                field: 'source.port',
                type: ENRICHMENT_TYPES.IndicatorMatchRule,
              },
            },
            {
              indicator: {
                description: 'this should match auditbeat/hosts on ip',
                first_seen: '2021-01-26T11:06:03.000Z',
                ip: '45.115.45.3',
                provider: 'other_provider',
                type: 'ip',
              },
              matched: {
                atomic: '45.115.45.3',
                id: '978787',
                index: 'filebeat-8.0.0-2021.01.26-000001',
                field: 'source.ip',
                type: ENRICHMENT_TYPES.IndicatorMatchRule,
              },
            },
          ])
        );
      });

      it('generates multiple alerts with multiple matches', async () => {
        const rule: ThreatMatchRuleCreateProps = createThreatMatchRule({
          threat_query: '*:*',
          threat_index: ['filebeat-*'], // Mimics indicators from the filebeat MISP module
          threat_mapping: [
            {
              entries: [
                {
                  value: 'threat.indicator.port',
                  field: 'source.port',
                  type: 'mapping',
                },
                {
                  value: 'threat.indicator.ip',
                  field: 'source.ip',
                  type: 'mapping',
                },
              ],
            },
            {
              entries: [
                {
                  value: 'threat.indicator.domain',
                  field: 'destination.ip',
                  type: 'mapping',
                },
              ],
            },
          ],
        });

        const { previewId } = await previewRule({ supertest, rule });
        const previewAlerts = await getPreviewAlerts({ es, previewId });
        expect(previewAlerts).toHaveLength(2);

        const threats = previewAlerts.map((hit) => hit._source?.threat) as Array<{
          enrichments: unknown[];
        }>;

        expect(threats[0].enrichments).toEqual(
          expect.arrayContaining([
            {
              indicator: {
                description: "domain should match the auditbeat hosts' data's source.ip",
                domain: '159.89.119.67',
                first_seen: '2021-01-26T11:09:04.000Z',
                provider: 'geenensp',
                type: 'url',
                url: {
                  full: 'http://159.89.119.67:59600/bin.sh',
                  scheme: 'http',
                },
              },
              matched: {
                atomic: '159.89.119.67',
                id: '978783',
                index: 'filebeat-8.0.0-2021.01.26-000001',
                field: 'destination.ip',
                type: ENRICHMENT_TYPES.IndicatorMatchRule,
              },
            },
            {
              indicator: {
                description: 'this should match auditbeat/hosts on both port and ip',
                first_seen: '2021-01-26T11:06:03.000Z',
                ip: '45.115.45.3',
                port: 57324,
                provider: 'geenensp',
                type: 'url',
              },
              matched: {
                atomic: '45.115.45.3',
                id: '978785',
                index: 'filebeat-8.0.0-2021.01.26-000001',
                field: 'source.ip',
                type: ENRICHMENT_TYPES.IndicatorMatchRule,
              },
            },
            {
              indicator: {
                description: 'this should match auditbeat/hosts on both port and ip',
                first_seen: '2021-01-26T11:06:03.000Z',
                ip: '45.115.45.3',
                port: 57324,
                provider: 'geenensp',
                type: 'url',
              },
              matched: {
                atomic: 57324,
                id: '978785',
                index: 'filebeat-8.0.0-2021.01.26-000001',
                field: 'source.port',
                type: ENRICHMENT_TYPES.IndicatorMatchRule,
              },
            },
          ])
        );

        expect(threats[1].enrichments).toEqual(
          expect.arrayContaining([
            {
              indicator: {
                description: "domain should match the auditbeat hosts' data's source.ip",
                domain: '159.89.119.67',
                first_seen: '2021-01-26T11:09:04.000Z',
                provider: 'geenensp',
                type: 'url',
                url: {
                  full: 'http://159.89.119.67:59600/bin.sh',
                  scheme: 'http',
                },
              },
              matched: {
                atomic: '159.89.119.67',
                id: '978783',
                index: 'filebeat-8.0.0-2021.01.26-000001',
                field: 'destination.ip',
                type: ENRICHMENT_TYPES.IndicatorMatchRule,
              },
            },
          ])
        );
      });

      // https://github.com/elastic/kibana/issues/149920
      // generates same number of alerts similarly to "enriches alerts with the single indicator that matches" test
      it('generates alerts with single match if queries contain field path wildcards', async () => {
        const rule: ThreatMatchRuleCreateProps = createThreatMatchRule({
          // still matches all documents as default *:*
          query: 'agent.ty*:auditbeat',
          threat_mapping: [
            {
              entries: [
                {
                  value: 'threat.indicator.domain',
                  field: 'destination.ip',
                  type: 'mapping',
                },
              ],
            },
          ],
          threat_query: 'threat.indicator.dom*: 159.89.119.67', // still matches only domain field, which is enough to ensure wildcard in path works correctly
          threat_index: ['filebeat-*'],
        });

        const { previewId } = await previewRule({ supertest, rule });
        const previewAlerts = await getPreviewAlerts({ es, previewId });
        expect(previewAlerts).toHaveLength(2);
      });

      // Similar to https://github.com/elastic/kibana/issues/259169, but with indicators first
      // We seed 2 matching events followed by 10 non-matching events and force 1 event/page.
      // The first page of indicators creates 2 alerts; later no-op pages verify that the count of created alerts doesn't
      // get inflated and trigger a false max-signals warning despite only 2 created preview alerts.
      it('reproduces false max alerts warning when later event pages have no threat matches', async () => {
        const id = uuidv4();
        const baseTs = moment();

        const matchingEvents = [
          {
            id,
            user: { name: 'matchuser' },
            '@timestamp': baseTs.clone().subtract(1, 's').toISOString(),
            'event.ingested': baseTs.clone().subtract(1, 's').toISOString(),
          },
          {
            id,
            user: { name: 'matchuser' },
            '@timestamp': baseTs.clone().subtract(2, 's').toISOString(),
            'event.ingested': baseTs.clone().subtract(2, 's').toISOString(),
          },
        ];
        const nonMatchingEvents = Array.from({ length: 100 }, (_, i) => ({
          id,
          user: { name: `eventmiss${i + 1}` },
          '@timestamp': baseTs
            .clone()
            .subtract(i + 3, 's')
            .toISOString(),
          'event.ingested': baseTs
            .clone()
            .subtract(i + 3, 's')
            .toISOString(),
        }));
        const numThreats = 20;
        const threats = [
          {
            ...threatDoc(id, baseTs.clone().subtract(numThreats, 'm').toISOString()),
            user: { name: 'matchuser' },
          },
          ...Array.from({ length: numThreats - 1 }, (_, i) => ({
            ...threatDoc(id, baseTs.clone().subtract(i, 'm').toISOString()),
          })),
        ];

        await indexListOfDocuments([...matchingEvents, ...nonMatchingEvents, ...threats]);

        const rule: ThreatMatchRuleCreateProps = {
          ...threatMatchRuleEcsComplaint(id),
          threat_mapping: [
            {
              entries: [{ field: 'user.name', value: 'user.name', type: 'mapping' }],
            },
          ],
          items_per_search: 1,
          concurrent_searches: 1,
        };

        const { logs, previewId } = await previewRule({ supertest, rule });
        const previewAlerts = await getPreviewAlerts({ es, previewId, size: 1000 });
        const allWarnings = logs.flatMap((l) => l.warnings ?? []);

        expect(previewAlerts.length).toEqual(2);
        expect(allWarnings).not.toContain(getMaxAlertsWarning());
      });
    });

    describe('indicator enrichment: event-first search', () => {
      before(async () => {
        await esArchiver.load(threatIntelPath);
      });

      after(async () => {
        await esArchiver.unload(threatIntelPath);
      });

      it('enriches alerts with the single indicator that matched', async () => {
        const termRule: ThreatMatchRuleCreateProps = createThreatMatchRule({
          query: 'destination.ip:159.89.119.67',
          threat_query: 'threat.indicator.domain: *', // narrow things down to indicators with a domain
          threat_index: ['filebeat-*'], // Mimics indicators from the filebeat MISP module
          threat_mapping: [
            {
              entries: [
                {
                  value: 'threat.indicator.domain',
                  field: 'destination.ip',
                  type: 'mapping',
                },
              ],
            },
          ],
        });
        const matchRule: ThreatMatchRuleCreateProps = createThreatMatchRule({
          query: 'destination.ip:159.89.119.67',
          threat_query: 'threat.indicator.domain: *', // narrow things down to indicators with a domain
          threat_index: ['filebeat-*'], // Mimics indicators from the filebeat MISP module
          threat_mapping: [
            {
              entries: [
                {
                  value: 'threat.indicator.domain',
                  field: 'destination.ip',
                  type: 'mapping',
                },
                {
                  value: 'threat.indicator.domain',
                  field: 'destination.ip',
                  type: 'mapping',
                },
              ],
            },
          ],
        });

        const { previewId: termPrevieId } = await previewRule({ supertest, rule: termRule });
        const termPreviewAlerts = await getPreviewAlerts({ es, previewId: termPrevieId });
        const { previewId: matchPreviewId } = await previewRule({ supertest, rule: matchRule });
        const matchPrevieAlerts = await getPreviewAlerts({ es, previewId: matchPreviewId });
        expect(termPreviewAlerts).toHaveLength(2);

        const threats = termPreviewAlerts.map((hit) => hit._source?.threat);
        expect(threats).toEqual([
          {
            enrichments: [
              {
                indicator: {
                  description: "domain should match the auditbeat hosts' data's source.ip",
                  domain: '159.89.119.67',
                  first_seen: '2021-01-26T11:09:04.000Z',
                  provider: 'geenensp',
                  url: {
                    full: 'http://159.89.119.67:59600/bin.sh',
                    scheme: 'http',
                  },
                  type: 'url',
                },
                matched: {
                  atomic: '159.89.119.67',
                  id: '978783',
                  index: 'filebeat-8.0.0-2021.01.26-000001',
                  field: 'destination.ip',
                  type: ENRICHMENT_TYPES.IndicatorMatchRule,
                },
              },
            ],
          },
          {
            enrichments: [
              {
                indicator: {
                  description: "domain should match the auditbeat hosts' data's source.ip",
                  domain: '159.89.119.67',
                  first_seen: '2021-01-26T11:09:04.000Z',
                  provider: 'geenensp',
                  url: {
                    full: 'http://159.89.119.67:59600/bin.sh',
                    scheme: 'http',
                  },
                  type: 'url',
                },
                matched: {
                  atomic: '159.89.119.67',
                  id: '978783',
                  index: 'filebeat-8.0.0-2021.01.26-000001',
                  field: 'destination.ip',
                  type: ENRICHMENT_TYPES.IndicatorMatchRule,
                },
              },
            ],
          },
        ]);
        alertsAreTheSame(termPreviewAlerts, matchPrevieAlerts);
      });

      it('enriches alerts with multiple indicators if several matched', async () => {
        const termRule: ThreatMatchRuleCreateProps = createThreatMatchRule({
          query: 'source.port: 57324', // narrow our query to a single record that matches two indicatorsthreat_query: 'threat.indicator.ip: *',
          threat_query: 'threat.indicator.ip: *',
          threat_index: ['filebeat-*'], // Mimics indicators from the filebeat MISP module
          threat_mapping: [
            {
              entries: [
                {
                  value: 'threat.indicator.ip',
                  field: 'source.ip',
                  type: 'mapping',
                },
              ],
            },
          ],
        });
        const matchRule: ThreatMatchRuleCreateProps = createThreatMatchRule({
          query: 'source.port: 57324', // narrow our query to a single record that matches two indicatorsthreat_query: 'threat.indicator.ip: *',
          threat_query: 'threat.indicator.ip: *',
          threat_index: ['filebeat-*'], // Mimics indicators from the filebeat MISP module
          threat_mapping: [
            {
              entries: [
                {
                  value: 'threat.indicator.ip',
                  field: 'source.ip',
                  type: 'mapping',
                },
                {
                  value: 'threat.indicator.ip',
                  field: 'source.ip',
                  type: 'mapping',
                },
              ],
            },
          ],
        });

        const { previewId: termPrevieId } = await previewRule({ supertest, rule: termRule });
        const termPreviewAlerts = await getPreviewAlerts({ es, previewId: termPrevieId });
        const { previewId: matchPreviewId } = await previewRule({ supertest, rule: matchRule });
        const matchPrevieAlerts = await getPreviewAlerts({ es, previewId: matchPreviewId });
        expect(termPreviewAlerts).toHaveLength(1);

        const [threat] = termPreviewAlerts.map((hit) => hit._source?.threat) as Array<{
          enrichments: unknown[];
        }>;

        expect(threat.enrichments).toEqual(
          expect.arrayContaining([
            {
              indicator: {
                description: 'this should match auditbeat/hosts on both port and ip',
                first_seen: '2021-01-26T11:06:03.000Z',
                ip: '45.115.45.3',
                port: 57324,
                provider: 'geenensp',
                type: 'url',
              },
              matched: {
                atomic: '45.115.45.3',
                id: '978785',
                index: 'filebeat-8.0.0-2021.01.26-000001',
                field: 'source.ip',
                type: ENRICHMENT_TYPES.IndicatorMatchRule,
              },
            },
            {
              indicator: {
                description: 'this should match auditbeat/hosts on ip',
                first_seen: '2021-01-26T11:06:03.000Z',
                ip: '45.115.45.3',
                provider: 'other_provider',
                type: 'ip',
              },

              matched: {
                atomic: '45.115.45.3',
                id: '978787',
                index: 'filebeat-8.0.0-2021.01.26-000001',
                field: 'source.ip',
                type: ENRICHMENT_TYPES.IndicatorMatchRule,
              },
            },
          ])
        );
        alertsAreTheSame(termPreviewAlerts, matchPrevieAlerts);
      });

      it('adds a single indicator that matched multiple fields', async () => {
        const termRule: ThreatMatchRuleCreateProps = createThreatMatchRule({
          query: 'source.port: 57324', // narrow our query to a single record that matches two indicators
          threat_query: 'threat.indicator.ip: *',
          threat_index: ['filebeat-*'], // Mimics indicators from the filebeat MISP module
          threat_mapping: [
            {
              entries: [
                {
                  value: 'threat.indicator.port',
                  field: 'source.port',
                  type: 'mapping',
                },
              ],
            },
            {
              entries: [
                {
                  value: 'threat.indicator.ip',
                  field: 'source.ip',
                  type: 'mapping',
                },
              ],
            },
          ],
        });
        const matchRule: ThreatMatchRuleCreateProps = createThreatMatchRule({
          query: 'source.port: 57324', // narrow our query to a single record that matches two indicators
          threat_query: 'threat.indicator.ip: *',
          threat_index: ['filebeat-*'], // Mimics indicators from the filebeat MISP module
          threat_mapping: [
            {
              entries: [
                {
                  value: 'threat.indicator.port',
                  field: 'source.port',
                  type: 'mapping',
                },
                {
                  value: 'threat.indicator.port',
                  field: 'source.port',
                  type: 'mapping',
                },
              ],
            },
            {
              entries: [
                {
                  value: 'threat.indicator.ip',
                  field: 'source.ip',
                  type: 'mapping',
                },
                {
                  value: 'threat.indicator.ip',
                  field: 'source.ip',
                  type: 'mapping',
                },
              ],
            },
          ],
        });

        const { previewId: termPrevieId } = await previewRule({ supertest, rule: termRule });
        const termPreviewAlerts = await getPreviewAlerts({ es, previewId: termPrevieId });
        const { previewId: matchPreviewId } = await previewRule({ supertest, rule: matchRule });
        const matchPrevieAlerts = await getPreviewAlerts({ es, previewId: matchPreviewId });
        expect(termPreviewAlerts).toHaveLength(1);

        const [threatTerm] = termPreviewAlerts.map((hit) => hit._source?.threat) as Array<{
          enrichments: unknown[];
        }>;

        const [threatMatch] = matchPrevieAlerts.map((hit) => hit._source?.threat) as Array<{
          enrichments: unknown[];
        }>;
        expect(threatTerm.enrichments).toEqual(
          expect.arrayContaining([
            {
              indicator: {
                description: 'this should match auditbeat/hosts on both port and ip',
                first_seen: '2021-01-26T11:06:03.000Z',
                ip: '45.115.45.3',
                port: 57324,
                provider: 'geenensp',
                type: 'url',
              },
              matched: {
                atomic: '45.115.45.3',
                id: '978785',
                index: 'filebeat-8.0.0-2021.01.26-000001',
                field: 'source.ip',
                type: ENRICHMENT_TYPES.IndicatorMatchRule,
              },
            },
            // We do not merge matched indicators during enrichment, so in
            // certain circumstances a given indicator document could appear
            // multiple times in an enriched alert (albeit with different
            // threat.indicator.matched data). That's the case with the
            // first and third indicators matched, here.
            {
              indicator: {
                description: 'this should match auditbeat/hosts on both port and ip',
                first_seen: '2021-01-26T11:06:03.000Z',
                ip: '45.115.45.3',
                port: 57324,
                provider: 'geenensp',
                type: 'url',
              },

              matched: {
                atomic: 57324,
                id: '978785',
                index: 'filebeat-8.0.0-2021.01.26-000001',
                field: 'source.port',
                type: ENRICHMENT_TYPES.IndicatorMatchRule,
              },
            },
            {
              indicator: {
                description: 'this should match auditbeat/hosts on ip',
                first_seen: '2021-01-26T11:06:03.000Z',
                ip: '45.115.45.3',
                provider: 'other_provider',
                type: 'ip',
              },
              matched: {
                atomic: '45.115.45.3',
                id: '978787',
                index: 'filebeat-8.0.0-2021.01.26-000001',
                field: 'source.ip',
                type: ENRICHMENT_TYPES.IndicatorMatchRule,
              },
            },
          ])
        );
        const sortEnrichments = (a: any, b: any) => {
          const atomicA = a.matched.atomic.toString();
          const atomicB = b.matched.atomic.toString();
          if (atomicA === atomicB) {
            return a.indicator.description > b.indicator.description ? 1 : -1;
          }
          return atomicA > atomicB ? 1 : -1;
        };

        expect(threatTerm.enrichments.sort(sortEnrichments)).toEqual(
          threatMatch.enrichments.sort(sortEnrichments)
        );
      });

      it('generates multiple alerts with multiple matches', async () => {
        const rule: ThreatMatchRuleCreateProps = createThreatMatchRule({
          query: '(source.port:57324 and source.ip:45.115.45.3) or destination.ip:159.89.119.67', // narrow our query to a single record that matches two indicators
          threat_query: '*:*',
          threat_index: ['filebeat-*'], // Mimics indicators from the filebeat MISP module
          threat_mapping: [
            {
              entries: [
                {
                  value: 'threat.indicator.port',
                  field: 'source.port',
                  type: 'mapping',
                },
                {
                  value: 'threat.indicator.ip',
                  field: 'source.ip',
                  type: 'mapping',
                },
              ],
            },
            {
              entries: [
                {
                  value: 'threat.indicator.domain',
                  field: 'destination.ip',
                  type: 'mapping',
                },
              ],
            },
          ],
        });

        const { previewId } = await previewRule({ supertest, rule });
        const previewAlerts = await getPreviewAlerts({ es, previewId });
        expect(previewAlerts).toHaveLength(2);

        const threats = previewAlerts.map((hit) => hit._source?.threat) as Array<{
          enrichments: unknown[];
        }>;

        expect(threats[0].enrichments).toEqual(
          expect.arrayContaining([
            {
              indicator: {
                description: "domain should match the auditbeat hosts' data's source.ip",
                domain: '159.89.119.67',
                first_seen: '2021-01-26T11:09:04.000Z',
                provider: 'geenensp',
                type: 'url',
                url: {
                  full: 'http://159.89.119.67:59600/bin.sh',
                  scheme: 'http',
                },
              },
              matched: {
                atomic: '159.89.119.67',
                id: '978783',
                index: 'filebeat-8.0.0-2021.01.26-000001',
                field: 'destination.ip',
                type: ENRICHMENT_TYPES.IndicatorMatchRule,
              },
            },
            {
              indicator: {
                description: 'this should match auditbeat/hosts on both port and ip',
                first_seen: '2021-01-26T11:06:03.000Z',
                ip: '45.115.45.3',
                port: 57324,
                provider: 'geenensp',
                type: 'url',
              },
              matched: {
                atomic: '45.115.45.3',
                id: '978785',
                index: 'filebeat-8.0.0-2021.01.26-000001',
                field: 'source.ip',
                type: ENRICHMENT_TYPES.IndicatorMatchRule,
              },
            },
            {
              indicator: {
                description: 'this should match auditbeat/hosts on both port and ip',
                first_seen: '2021-01-26T11:06:03.000Z',
                ip: '45.115.45.3',
                port: 57324,
                provider: 'geenensp',
                type: 'url',
              },
              matched: {
                atomic: 57324,
                id: '978785',
                index: 'filebeat-8.0.0-2021.01.26-000001',
                field: 'source.port',
                type: ENRICHMENT_TYPES.IndicatorMatchRule,
              },
            },
          ])
        );

        expect(threats[1].enrichments).toEqual(
          expect.arrayContaining([
            {
              indicator: {
                description: "domain should match the auditbeat hosts' data's source.ip",
                domain: '159.89.119.67',
                first_seen: '2021-01-26T11:09:04.000Z',
                provider: 'geenensp',
                type: 'url',
                url: {
                  full: 'http://159.89.119.67:59600/bin.sh',
                  scheme: 'http',
                },
              },
              matched: {
                atomic: '159.89.119.67',
                id: '978783',
                index: 'filebeat-8.0.0-2021.01.26-000001',
                field: 'destination.ip',
                type: ENRICHMENT_TYPES.IndicatorMatchRule,
              },
            },
          ])
        );
      });

      // https://github.com/elastic/kibana/issues/149920
      // creates same number of alerts similarly to "generates multiple alerts with multiple matches" test
      it('generates alerts with multiple matches if queries contain field path wildcards', async () => {
        const rule: ThreatMatchRuleCreateProps = createThreatMatchRule({
          // source.po* matches port source.port field
          query: '(source.po*:57324 and source.ip:45.115.45.3) or destination.ip:159.89.119.67', // narrow our query to a single record that matches two indicators
          threat_query: 'agent.t*:filebeat', // still matches all documents
          threat_index: ['filebeat-*'], // Mimics indicators from the filebeat MISP module
          threat_mapping: [
            {
              entries: [
                {
                  value: 'threat.indicator.port',
                  field: 'source.port',
                  type: 'mapping',
                },
                {
                  value: 'threat.indicator.ip',
                  field: 'source.ip',
                  type: 'mapping',
                },
              ],
            },
            {
              entries: [
                {
                  value: 'threat.indicator.domain',
                  field: 'destination.ip',
                  type: 'mapping',
                },
              ],
            },
          ],
        });

        const { previewId } = await previewRule({ supertest, rule });
        const previewAlerts = await getPreviewAlerts({ es, previewId });
        expect(previewAlerts).toHaveLength(2);
      });

      // https://github.com/elastic/kibana/issues/259169
      // We seed 2 matching events followed by 10 non-matching events and force 1 event/page.
      // The first two pages create 2 alerts; later no-op pages verify that the count of created alerts doesn't
      // get inflated and trigger a false max-signals warning despite only 2 created preview alerts.
      it('reproduces false max alerts warning when later event pages have no threat matches', async () => {
        const id = uuidv4();
        const baseTs = moment();
        const timestamp = baseTs.toISOString();

        const matchingEvents = [
          {
            id,
            user: { name: 'matchuser' },
            '@timestamp': baseTs.clone().subtract(1, 's').toISOString(),
            'event.ingested': baseTs.clone().subtract(1, 's').toISOString(),
          },
          {
            id,
            user: { name: 'matchuser' },
            '@timestamp': baseTs.clone().subtract(2, 's').toISOString(),
            'event.ingested': baseTs.clone().subtract(2, 's').toISOString(),
          },
        ];
        const nonMatchingEvents = Array.from({ length: 10 }, (_, i) => ({
          id,
          user: { name: `eventmiss${i + 1}` },
          '@timestamp': baseTs
            .clone()
            .subtract(i + 3, 's')
            .toISOString(),
          'event.ingested': baseTs
            .clone()
            .subtract(i + 3, 's')
            .toISOString(),
        }));
        const threats = [
          {
            ...threatDoc(id, timestamp),
            user: { name: 'matchuser' },
          },
          ...Array.from({ length: 19 }, (_, i) => ({
            ...threatDoc(
              id,
              baseTs
                .clone()
                .subtract(i + 1, 'm')
                .toISOString()
            ),
            user: { name: `threatfiller${i + 1}` },
          })),
        ];

        await indexListOfDocuments([...matchingEvents, ...nonMatchingEvents, ...threats]);

        const rule: ThreatMatchRuleCreateProps = {
          ...threatMatchRuleEcsComplaint(id),
          threat_mapping: [
            {
              entries: [{ field: 'user.name', value: 'user.name', type: 'mapping' }],
            },
          ],
          items_per_search: 1,
          concurrent_searches: 1,
        };

        const { logs, previewId } = await previewRule({ supertest, rule });
        const previewAlerts = await getPreviewAlerts({ es, previewId, size: 1000 });
        const allWarnings = logs.flatMap((l) => l.warnings ?? []);

        expect(previewAlerts.length).toEqual(2);
        expect(allWarnings).not.toContain(getMaxAlertsWarning());
      });
    });

    // skips serverless MKI due to feature flag
    describe('@skipInServerlessMKI DOES NOT MATCH condition', () => {
      // cases to cover 2 execution paths of IM
      const cases = [
        {
          eventsCount: 20,
          threatsCount: 5,
          title: `(threats first) events count is greater than threats count`,
        },

        {
          eventsCount: 5,
          threatsCount: 20,
          title: `(events first) events count is smaller than threats count`,
        },
      ];

      cases.forEach(({ eventsCount, threatsCount, title }) => {
        describe(`Code execution path: ${title}`, () => {
          const timestamp = new Date().toISOString();

          const basicThreatMatchRuleWithDoesNotMatch = (
            id: string
          ): ThreatMatchRuleCreateProps => ({
            ...threatMatchRuleEcsComplaint(id),
            query: `id:${id} and NOT agent.type:threat`,
            threat_query: `id:${id} and agent.type:threat`,
            threat_mapping: [
              {
                entries: [
                  {
                    field: 'user.name',
                    value: 'user.name',
                    type: 'mapping',
                  },
                  {
                    field: 'geo.country_name',
                    value: 'geo.country_name',
                    type: 'mapping',
                    negate: true,
                  },
                ],
              },
            ],
          });

          it('should create alert when one of fields not matching in single AND group', async () => {
            const id = uuidv4();

            // Add filler events to ensure we have more events than threats when threats are first
            await indexListOfDocuments([
              ...Array.from({ length: eventsCount }, (_, i) => ({
                id,
                '@timestamp': timestamp,
                user: { name: `filler-user${i + 1}` },
                geo: { country_name: `filler-country${i + 1}` },
              })),
              {
                id,
                '@timestamp': timestamp,
                user: { name: 'user-1' },
                geo: { country_name: 'France' }, // should generate an alert since geo.country_name does not match with threat but user.name does
              },
            ]);

            // Add filler threats to ensure we have more threats than events when events are first
            await indexListOfDocuments([
              ...Array.from({ length: threatsCount }, (_, i) => ({
                ...threatDoc(id, timestamp),
                user: { name: `filler-threat-user${i + 1}` },
                geo: { country_name: `filler-threat-country${i + 1}` },
              })),
              {
                ...threatDoc(id, timestamp),
                user: { name: 'user-1' },
                geo: { country_name: 'UK' },
              },
            ]);

            const { previewId } = await previewRule({
              supertest,
              rule: basicThreatMatchRuleWithDoesNotMatch(id),
              invocationCount: 1,
            });

            const previewAlerts = await getPreviewAlerts({
              es,
              previewId,
            });

            expect(previewAlerts).toHaveLength(1);

            expect(previewAlerts[0]).toHaveProperty('_source.user.name', 'user-1');
            expect(previewAlerts[0]).toHaveProperty('_source.geo.country_name', 'France');

            // threat enriched only for MATCHED condition
            expect(previewAlerts[0]).toHaveProperty('_source.threat.enrichments', [
              {
                matched: {
                  atomic: 'user-1',
                  field: 'user.name',
                  id: expect.any(String),
                  index: 'ecs_compliant',
                  type: 'indicator_match_rule',
                },
              },
            ]);
          });

          it('should create alert when 2 fields not matching in single AND group', async () => {
            const id = uuidv4();

            // Add filler events to ensure we have more events than threats when threats are first
            await indexListOfDocuments([
              ...Array.from({ length: eventsCount }, (_, i) => ({
                id,
                '@timestamp': timestamp,
                user: { name: `filler-user${i + 1}` },
                geo: { country_name: `filler-country${i + 1}` },
                client: { ip: '127.0.0.11' },
              })),
              {
                id,
                '@timestamp': timestamp,
                user: { name: 'user-1' },
                geo: { country_name: 'France' },
                client: { ip: '127.0.0.2' },
              },
              {
                id,
                '@timestamp': timestamp,
                user: { name: 'user-1' },
                geo: { country_name: 'UK' }, // country_name matches threat, so no alert should be generated
                client: { ip: '127.0.0.2' },
              },
            ]);

            // Add filler threats to ensure we have more threats than events when events are first
            await indexListOfDocuments([
              ...Array.from({ length: threatsCount }, (_, i) => ({
                ...threatDoc(id, timestamp),
                user: { name: `filler-threat-user${i + 1}` },
                geo: { country_name: `filler-threat-country${i + 1}` },
                client: { ip: '127.0.0.11' },
              })),
              {
                ...threatDoc(id, timestamp),
                user: { name: 'user-1' },
                geo: { country_name: 'UK' },
                client: { ip: '127.0.0.1' },
              },
            ]);

            const { previewId } = await previewRule({
              supertest,
              rule: {
                ...basicThreatMatchRuleWithDoesNotMatch(id),
                threat_mapping: [
                  {
                    entries: [
                      {
                        field: 'user.name',
                        value: 'user.name',
                        type: 'mapping',
                      },
                      {
                        field: 'geo.country_name',
                        value: 'geo.country_name',
                        type: 'mapping',
                        negate: true,
                      },
                      {
                        field: 'client.ip',
                        value: 'client.ip',
                        type: 'mapping',
                        negate: true,
                      },
                    ],
                  },
                ],
              },
              invocationCount: 1,
            });

            const previewAlerts = await getPreviewAlerts({
              es,
              previewId,
            });

            expect(previewAlerts).toHaveLength(1);
          });

          it('should create alerts for not matching fields in OR condition', async () => {
            const id = uuidv4();

            // Add filler events to ensure we have more events than threats when threats are first
            await indexListOfDocuments([
              ...Array.from({ length: eventsCount }, (_, i) => ({
                id,
                '@timestamp': timestamp,
                user: { name: `filler-user${i + 1}` },
                geo: { country_name: `filler-country${i + 1}` },
                host: { name: `filler-host${i + 1}` },
                client: { ip: `127.0.0.1` },
              })),
              {
                id,
                '@timestamp': timestamp,
                user: { name: 'user-1' },
                geo: { country_name: 'France' },
                host: { name: 'host-1' },
                client: { ip: '127.0.0.2' },
              },
              {
                id,
                '@timestamp': timestamp,
                user: { name: 'user-1' },
                geo: { country_name: 'UK' },
                host: { name: 'host-1' },
                client: { ip: '127.0.0.100' },
              },
              {
                id,
                '@timestamp': timestamp,
                user: { name: 'user-2' },
                geo: { country_name: 'UK' },
                host: { name: 'host-1' },
                client: { ip: '127.0.0.1' },
              },
            ]);

            // Add filler threats to ensure we have more threats than events when events are first
            await indexListOfDocuments([
              ...Array.from({ length: threatsCount }, (_, i) => ({
                ...threatDoc(id, timestamp),
                user: { name: `filler-threat-user${i + 1}` },
                geo: { country_name: `filler-threat-country${i + 1}` },
                host: { name: `filler-threat-host${i + 1}` },
                client: { ip: `127.0.0.200` },
              })),
              {
                ...threatDoc(id, timestamp),
                user: { name: 'user-1' },
                geo: { country_name: 'UK' },
                host: { name: 'host-not-matched' },
                client: { ip: '127.0.0.2' },
              },
              {
                ...threatDoc(id, timestamp),
                user: { name: 'user-2' },
                geo: { country_name: 'UK' },
                host: { name: 'host-1' },
                client: { ip: '127.0.0.1' },
              },
            ]);

            const { previewId } = await previewRule({
              supertest,
              rule: {
                ...basicThreatMatchRuleWithDoesNotMatch(id),
                threat_mapping: [
                  basicThreatMatchRuleWithDoesNotMatch(id).threat_mapping[0],
                  {
                    entries: [
                      {
                        field: 'host.name',
                        value: 'host.name',
                        type: 'mapping',
                      },
                      {
                        field: 'client.ip',
                        value: 'client.ip',
                        type: 'mapping',
                        negate: true,
                      },
                    ],
                  },
                ],
              },
              invocationCount: 1,
            });

            const previewAlerts = await getPreviewAlerts({
              es,
              previewId,
              sort: ['user.name'],
            });

            expect(previewAlerts).toHaveLength(2);

            expect(previewAlerts[0]).toHaveProperty('_source.user.name', 'user-1');
            expect(previewAlerts[0]).toHaveProperty('_source.geo.country_name', 'France');

            expect(previewAlerts[1]).toHaveProperty('_source.host.name', 'host-1');
            expect(previewAlerts[1]).toHaveProperty('_source.client.ip', '127.0.0.100');
          });

          it('should not create alerts when does not match condition is not met', async () => {
            const id = uuidv4();

            // Add filler events to ensure we have more events than threats when threats are first
            await indexListOfDocuments([
              ...Array.from({ length: eventsCount }, (_, i) => ({
                id,
                '@timestamp': timestamp,
                user: { name: `filler-user${i + 1}` },
                geo: { country_name: `filler-country${i + 1}` },
              })),
              {
                id,
                '@timestamp': timestamp,
                user: { name: 'user-1' },
                geo: { country_name: 'UK' },
              },
              {
                id,
                '@timestamp': timestamp,
                user: { name: 'user-3' },
                geo: { country_name: 'UK' },
              },
            ]);

            // Add filler threats to ensure we have more threats than events when events are first
            await indexListOfDocuments([
              ...Array.from({ length: threatsCount }, (_, i) => ({
                ...threatDoc(id, timestamp),
                user: { name: `filler-threat-user${i + 1}` },
                geo: { country_name: `filler-threat-country${i + 1}` },
              })),
              {
                ...threatDoc(id, timestamp),
                user: { name: 'user-1' },
                geo: { country_name: 'UK' },
              },
              {
                ...threatDoc(id, timestamp),
                user: { name: 'user-2' },
                geo: { country_name: 'UK' },
              },
              {
                ...threatDoc(id, timestamp),
                user: { name: 'user-2' },
                geo: { country_name: 'France' },
              },
            ]);

            const { previewId } = await previewRule({
              supertest,
              rule: basicThreatMatchRuleWithDoesNotMatch(id),
              invocationCount: 1,
            });

            const previewAlerts = await getPreviewAlerts({
              es,
              previewId,
            });

            expect(previewAlerts).toHaveLength(0);
          });

          it('should create multiple alerts when conditions are met', async () => {
            const id = uuidv4();

            // Add filler events to ensure we have more events than threats when threats are first
            await indexListOfDocuments([
              ...Array.from({ length: eventsCount }, (_, i) => ({
                id,
                '@timestamp': timestamp,
                user: { name: `filler-user${i + 1}` },
                geo: { country_name: `filler-country${i + 1}` },
              })),
              {
                id,
                '@timestamp': timestamp,
                user: { name: 'user-1' },
                geo: { country_name: 'Portugal' },
              },
              {
                id,
                '@timestamp': timestamp,
                user: { name: 'user-1' },
                geo: { country_name: 'Spain' },
              },
              {
                id,
                '@timestamp': timestamp,
                user: { name: 'user-1' },
                geo: { country_name: 'UK' },
              },
              {
                id,
                '@timestamp': timestamp,
                user: { name: 'user-2' },
                geo: { country_name: 'Portugal' },
              },
            ]);

            // Add filler threats to ensure we have more threats than events when events are first
            await indexListOfDocuments([
              ...Array.from({ length: threatsCount }, (_, i) => ({
                ...threatDoc(id, timestamp),
                user: { name: `filler-threat-user${i + 1}` },
                geo: { country_name: `filler-threat-country${i + 1}` },
              })),
              {
                ...threatDoc(id, timestamp),
                user: { name: 'user-1' },
                geo: { country_name: 'UK' },
              },
              {
                ...threatDoc(id, timestamp),
                user: { name: 'user-2' },
                geo: { country_name: 'UK' },
              },
              {
                ...threatDoc(id, timestamp),
                user: { name: 'user-3' },
                geo: { country_name: 'Norway' },
              },
            ]);

            const { previewId } = await previewRule({
              supertest,
              rule: basicThreatMatchRuleWithDoesNotMatch(id),
              invocationCount: 1,
            });

            const previewAlerts = await getPreviewAlerts({
              es,
              previewId,
            });

            expect(previewAlerts).toHaveLength(3);
          });

          it('should create alert when source event not matching field is undefined', async () => {
            const id = uuidv4();

            // Add filler events to ensure we have more events than threats when threats are first
            await indexListOfDocuments([
              ...Array.from({ length: eventsCount }, (_, i) => ({
                id,
                '@timestamp': timestamp,
                user: { name: `filler-user${i + 1}` },
                geo: { country_name: `filler-country${i + 1}` },
              })),
              {
                id,
                '@timestamp': timestamp,
                user: { name: 'user-1' },
              },
            ]);

            // Add filler threats to ensure we have more threats than events when events are first
            await indexListOfDocuments([
              ...Array.from({ length: threatsCount }, (_, i) => ({
                ...threatDoc(id, timestamp),
                user: { name: `filler-threat-user${i + 1}` },
                geo: { country_name: `filler-threat-country${i + 1}` },
              })),
              {
                ...threatDoc(id, timestamp),
                user: { name: 'user-1' },
                geo: { country_name: 'UK' },
              },
            ]);

            const { previewId } = await previewRule({
              supertest,
              rule: basicThreatMatchRuleWithDoesNotMatch(id),
              invocationCount: 1,
            });

            const previewAlerts = await getPreviewAlerts({
              es,
              previewId,
            });

            expect(previewAlerts).toHaveLength(1);

            expect(previewAlerts[0]).toHaveProperty('_source.user.name', 'user-1');
            expect(previewAlerts[0]).not.toHaveProperty('_source.geo.country_name');
          });

          it('should create alert when threat not matching field is undefined', async () => {
            const id = uuidv4();

            // Add filler events to ensure we have more events than threats when threats are first
            await indexListOfDocuments([
              ...Array.from({ length: eventsCount }, (_, i) => ({
                id,
                '@timestamp': timestamp,
                user: { name: `filler-user${i + 1}` },
                geo: { country_name: `filler-country${i + 1}` },
              })),
              {
                id,
                '@timestamp': timestamp,
                user: { name: 'user-1' },
                geo: { country_name: 'UK' },
              },
            ]);

            // Add filler threats to ensure we have more threats than events when events are first
            await indexListOfDocuments([
              ...Array.from({ length: threatsCount }, (_, i) => ({
                ...threatDoc(id, timestamp),
                user: { name: `filler-threat-user${i + 1}` },
                geo: { country_name: `filler-threat-country${i + 1}` },
              })),
              {
                ...threatDoc(id, timestamp),
                user: { name: 'user-1' },
              },
            ]);

            const { previewId } = await previewRule({
              supertest,
              rule: basicThreatMatchRuleWithDoesNotMatch(id),
              invocationCount: 1,
            });

            const previewAlerts = await getPreviewAlerts({
              es,
              previewId,
            });

            expect(previewAlerts).toHaveLength(1);

            expect(previewAlerts[0]).toHaveProperty('_source.user.name', 'user-1');
            expect(previewAlerts[0]).toHaveProperty('_source.geo.country_name', 'UK');
          });

          it('should not create alert not matching field is undefined in both source and threat', async () => {
            const id = uuidv4();

            // Add filler events to ensure we have more events than threats when threats are first
            await indexListOfDocuments([
              ...Array.from({ length: eventsCount }, (_, i) => ({
                id,
                '@timestamp': timestamp,
                user: { name: `filler-user${i + 1}` },
                geo: { country_name: `filler-country${i + 1}` },
              })),
              {
                id,
                '@timestamp': timestamp,
                user: { name: 'user-1' },
              },
            ]);

            // Add filler threats to ensure we have more threats than events when events are first
            await indexListOfDocuments([
              ...Array.from({ length: threatsCount }, (_, i) => ({
                ...threatDoc(id, timestamp),
                user: { name: `filler-threat-user${i + 1}` },
                geo: { country_name: `filler-threat-country${i + 1}` },
              })),
              {
                ...threatDoc(id, timestamp),
                user: { name: 'user-1' },
              },
            ]);

            const { previewId } = await previewRule({
              supertest,
              rule: basicThreatMatchRuleWithDoesNotMatch(id),
              invocationCount: 1,
            });

            const previewAlerts = await getPreviewAlerts({
              es,
              previewId,
            });

            expect(previewAlerts).toHaveLength(0);
          });
        });
      });
    });

    describe('enrichment from partial matches', () => {
      // cases to cover 2 execution paths of IM
      const cases = [
        {
          eventsCount: 5,
          threatsCount: 0,
          title: `(threats first) events count is greater than threats count`,
        },

        {
          eventsCount: 0,
          threatsCount: 5,
          title: `(events first) events count is smaller than threats count`,
        },
      ];

      cases.forEach(({ eventsCount, threatsCount, title }) => {
        describe(`Code execution path: ${title}`, () => {
          const timestamp = new Date().toISOString();

          const basicThreatMatchRuleWithDoesNotMatch = (
            id: string
          ): ThreatMatchRuleCreateProps => ({
            ...threatMatchRuleEcsComplaint(id),
            query: `id:${id} and NOT agent.type:threat`,
            threat_query: `id:${id} and agent.type:threat`,
            threat_mapping: [
              {
                entries: [
                  {
                    field: 'user.name',
                    value: 'user.name',
                    type: 'mapping',
                  },
                  {
                    field: 'host.name',
                    value: 'host.name',
                    type: 'mapping',
                  },
                ],
              },
            ],
          });

          it('should not add include partially matched threats in enrcihments', async () => {
            const id = uuidv4();

            // Add filler events to ensure we have more events than threats when threats are first
            await indexListOfDocuments([
              ...Array.from({ length: eventsCount }, (_, i) => ({
                id,
                '@timestamp': timestamp,
                user: { name: `filler-user${i + 1}` },
                host: { name: `filler-host${i + 1}` },
              })),
              {
                id,
                '@timestamp': timestamp,
                user: { name: 'bob-1' },
                host: { name: 'host-1' },
              },
              {
                id,
                '@timestamp': timestamp,
                user: { name: 'bob-2' },
                host: { name: 'host-1' },
              },
            ]);

            // Add filler threats to ensure we have more threats than events when events are first
            await indexListOfDocuments([
              ...Array.from({ length: threatsCount }, (_, i) => ({
                ...threatDoc(id, timestamp),
                user: { name: `filler-threat-user${i + 1}` },
                host: { name: `filler-threat-host${i + 1}` },
              })),
              {
                ...threatDoc(id, timestamp),
                user: { name: 'bob-1' },
                host: { name: 'host-1' },
              },
              {
                ...threatDoc(id, timestamp),
                user: { name: 'bob-2' },
                host: { name: 'host-1' },
              },
            ]);

            const { previewId } = await previewRule({
              supertest,
              rule: basicThreatMatchRuleWithDoesNotMatch(id),
              invocationCount: 1,
            });

            const previewAlerts = await getPreviewAlerts({
              es,
              previewId,
              sort: ['user.name'],
            });

            expect(previewAlerts).toHaveLength(2);

            expect(previewAlerts[0]).toHaveProperty('_source.threat.enrichments.length', 2);
            expect(previewAlerts[0]).toHaveProperty(
              '_source.threat.enrichments',
              expect.arrayContaining([
                {
                  matched: {
                    atomic: 'bob-1',
                    field: 'user.name',
                    id: expect.any(String),
                    index: 'ecs_compliant',
                    type: 'indicator_match_rule',
                  },
                },
                {
                  matched: {
                    atomic: 'host-1',
                    field: 'host.name',
                    id: expect.any(String),
                    index: 'ecs_compliant',
                    type: 'indicator_match_rule',
                  },
                },
              ])
            );
          });
        });
      });
    });

    describe('alerts should be enriched', () => {
      before(async () => {
        await entityStoreV2.setup({
          hosts: [
            {
              host: { name: ENRICHMENT_HOST_NAME, id: [ENRICHMENT_HOST_ID] },
              entity: {
                id: ENRICHMENT_HOST_EUID,
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
        const rule: ThreatMatchRuleCreateProps = createThreatMatchRule({
          query: '*:*',
          threat_query: 'source.ip: "188.166.120.93"', // narrow things down with a query to a specific source ip
          threat_mapping: [
            // We match host.name against host.name
            {
              entries: [
                {
                  field: 'host.name',
                  value: 'host.name',
                  type: 'mapping',
                },
              ],
            },
          ],
        });

        const { previewId } = await previewRule({ supertest, rule });
        const previewAlerts = await getPreviewAlerts({ es, previewId, size: 100 });
        expect(previewAlerts).toHaveLength(88);
        const fullSource = previewAlerts.find(
          (alert) =>
            (alert._source?.[ALERT_ANCESTORS] as Ancestor[])[0].id === '7yJ-B2kBR346wHgnhlMn'
        );
        const fullAlert = fullSource?._source;
        if (!fullAlert) {
          return expect(fullAlert).toBeTruthy();
        }

        expect(fullAlert?.host?.risk?.calculated_level).toEqual('Critical');
        expect(fullAlert?.host?.risk?.calculated_score_norm).toEqual(70);
      });
    });

    describe('with asset criticality', () => {
      before(async () => {
        // Note: user.name in this auditbeat record is 'root'. Entity Store V2's LOCAL_NAMESPACE_EXCLUDED_USER_NAMES
        // list includes 'root', so the local-namespace gate fails and getEuidFromObject() returns
        // undefined for alerts where user.name === 'root'. User enrichment is therefore skipped by
        // the detection engine for system accounts; only host enrichment is tested here.
        await entityStoreV2.setup({
          hosts: [
            {
              host: { name: ENRICHMENT_HOST_NAME, id: [ENRICHMENT_HOST_ID] },
              entity: { id: ENRICHMENT_HOST_EUID, type: 'host' },
              asset: { criticality: 'low_impact' },
            },
          ],
        });
      });

      after(async () => {
        await entityStoreV2.teardown();
      });

      it('should be enriched alert with criticality_level', async () => {
        const rule: ThreatMatchRuleCreateProps = createThreatMatchRule({
          query: '*:*',
          threat_query: 'source.ip: "188.166.120.93"', // narrow things down with a query to a specific source ip
          threat_mapping: [
            // We match host.name against host.name
            {
              entries: [
                {
                  field: 'host.name',
                  value: 'host.name',
                  type: 'mapping',
                },
              ],
            },
          ],
        });

        const { previewId } = await previewRule({ supertest, rule });
        const previewAlerts = await getPreviewAlerts({ es, previewId, size: 100 });
        expect(previewAlerts).toHaveLength(88);
        const fullSource = previewAlerts.find(
          (alert) =>
            (alert._source?.[ALERT_ANCESTORS] as Ancestor[])[0].id === '7yJ-B2kBR346wHgnhlMn'
        );
        const fullAlert = fullSource?._source;
        if (!fullAlert) {
          return expect(fullAlert).toBeTruthy();
        }

        expect(fullAlert?.['host.asset.criticality']).toEqual('low_impact');
      });
    });

    // https://github.com/elastic/kibana/issues/174573
    describe('timestamp override and fallback timestamp', () => {
      const timestamp = '2020-10-28T05:45:00.000Z';

      it('should create alerts using a timestamp override and timestamp fallback enabled on threats first code path execution', async () => {
        const id = uuidv4();

        await indexListOfDocuments([
          eventDoc(id, timestamp),
          eventDoc(id, timestamp),
          threatDoc(id, timestamp),
        ]);

        const { previewId, logs } = await previewRule({
          supertest,
          rule: threatMatchRuleEcsComplaint(id),
          timeframeEnd: new Date('2020-10-28T06:00:00.000Z'),
          invocationCount: 1,
        });

        const previewAlerts = await getPreviewAlerts({
          es,
          previewId,
          sort: ['host.name', ALERT_ORIGINAL_TIME],
        });

        expect(previewAlerts.length).toEqual(2);
        expect(logs[0].errors).toHaveLength(0);
      });

      it('should create alert using a timestamp override and timestamp fallback enabled on events first code path execution', async () => {
        const id = uuidv4();

        await indexListOfDocuments([
          eventDoc(id, timestamp),
          threatDoc(id, timestamp),
          threatDoc(id, timestamp),
        ]);

        const { previewId, logs } = await previewRule({
          supertest,
          rule: threatMatchRuleEcsComplaint(id),
          timeframeEnd: new Date('2020-10-28T06:00:00.000Z'),
          invocationCount: 1,
        });

        const previewAlerts = await getPreviewAlerts({
          es,
          previewId,
          sort: ['host.name', ALERT_ORIGINAL_TIME],
        });

        expect(previewAlerts.length).toEqual(1);
        expect(logs[0].errors).toHaveLength(0);
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
        await esArchiver.unload(
          'x-pack/solutions/security/test/fixtures/es_archives/security_solution/ecs_compliant'
        );
      });

      it('alerts when run on a time range that the rule has not previously seen, and deduplicates if run there more than once', async () => {
        const id = uuidv4();
        const firstTimestamp = moment(new Date()).subtract(3, 'h');
        const secondTimestamp = moment(new Date());

        await indexListOfDocuments([
          eventDoc(id, firstTimestamp.toISOString()),
          eventDoc(id, secondTimestamp.toISOString()),
          threatDoc(id, secondTimestamp.toISOString()),
        ]);

        const rule = threatMatchRuleEcsComplaint(id);

        const createdRule = await createRule(supertest, log, rule);
        const alerts = await getAlerts(supertest, log, es, createdRule);

        expect(alerts.hits.hits).toHaveLength(1);
        expect(alerts.hits.hits[0]?._source?.[ALERT_RULE_EXECUTION_TYPE]).toBe('scheduled');

        const backfill = await scheduleRuleRun(supertest, [createdRule.id], {
          startDate: moment(firstTimestamp).subtract(5, 'm'),
          endDate: moment(firstTimestamp).add(5, 'm'),
        });

        await waitForBackfillExecuted(backfill, [createdRule.id], { supertest, log });
        const allNewAlerts = await getAlerts(supertest, log, es, createdRule);
        expect(allNewAlerts.hits.hits).toHaveLength(2);
        expect(allNewAlerts.hits.hits[1]?._source?.[ALERT_RULE_EXECUTION_TYPE]).toBe('manual');

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
        const firstTimestamp = moment(new Date());

        await indexListOfDocuments([
          eventDoc(id, firstTimestamp.toISOString()),
          threatDoc(id, firstTimestamp.toISOString()),
        ]);

        const rule = threatMatchRuleEcsComplaint(id);

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

      it('should not generate alerts if threat query not in manual rule interval', async () => {
        const id = uuidv4();
        const firstTimestamp = moment(new Date()).subtract(2, 'h');

        await indexListOfDocuments([
          eventDoc(id, moment(firstTimestamp).toISOString()),
          threatDoc(id, moment(new Date()).subtract(1, 'm').toISOString()),
        ]);

        const rule: ThreatMatchRuleCreateProps = {
          ...threatMatchRuleEcsComplaint(id),
          threat_query: `@timestamp >= "now-5m" and id:${id} and agent.type:threat`,
          interval: '10m',
          from: 'now-140m',
        };

        const createdRule = await createRule(supertest, log, rule);
        const alerts = await getAlerts(supertest, log, es, createdRule);

        expect(alerts.hits.hits).toHaveLength(1);

        const backfill = await scheduleRuleRun(supertest, [createdRule.id], {
          startDate: moment(firstTimestamp).subtract(5, 'm'),
          endDate: moment(firstTimestamp).add(5, 'm'),
        });

        await waitForBackfillExecuted(backfill, [createdRule.id], { supertest, log });
        const allNewAlerts = await getAlerts(supertest, log, es, createdRule);
        expect(allNewAlerts.hits.hits).toHaveLength(1);
      });

      it('supression per rule execution should work for manual rule runs', async () => {
        const id = uuidv4();
        const firstTimestamp = moment(new Date()).subtract(3, 'h');
        await indexListOfDocuments([
          eventDoc(id, firstTimestamp.toISOString()),
          eventDoc(id, firstTimestamp.add(1, 'm').toISOString()),
          eventDoc(id, firstTimestamp.add(3, 'm').toISOString()),
          threatDoc(id, firstTimestamp.toISOString()),
        ]);

        const rule = {
          ...threatMatchRuleEcsComplaint(id),
          alert_suppression: {
            group_by: ['host.name'],
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

        expect(allNewAlerts.hits.hits[0]._source?.[ALERT_SUPPRESSION_DOCS_COUNT]).toBe(2);
      });

      it('supression with time window should work for manual rule runs and update alert', async () => {
        const id = uuidv4();
        const firstTimestamp = moment(new Date()).subtract(3, 'h');

        await indexListOfDocuments([
          eventDoc(id, firstTimestamp.toISOString()),
          threatDoc(id, firstTimestamp.toISOString()),
        ]);

        const rule: ThreatMatchRuleCreateProps = {
          ...threatMatchRuleEcsComplaint(id),
          alert_suppression: {
            group_by: ['host.name'],
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

        await indexListOfDocuments([eventDoc(id, firstTimestamp.add(5, 'm').toISOString())]);

        const secondBackfill = await scheduleRuleRun(supertest, [createdRule.id], {
          startDate: moment(firstTimestamp).add(1, 'm'),
          endDate: moment(firstTimestamp).add(120, 'm'),
        });

        await waitForBackfillExecuted(secondBackfill, [createdRule.id], { supertest, log });
        const updatedAlerts = await getAlerts(supertest, log, es, createdRule);
        expect(updatedAlerts.hits.hits).toHaveLength(1);

        expect(updatedAlerts.hits.hits).toHaveLength(1);
        expect(updatedAlerts.hits.hits[0]._source?.[ALERT_SUPPRESSION_DOCS_COUNT]).toBe(1);
      });
    });

    describe('false positive prevention with AND conditions', () => {
      const timestamp = new Date().toISOString();

      beforeEach(async () => {
        await esArchiver.load(
          'x-pack/solutions/security/test/fixtures/es_archives/security_solution/ecs_compliant'
        );
      });

      afterEach(async () => {
        await esArchiver.unload(
          'x-pack/solutions/security/test/fixtures/es_archives/security_solution/ecs_compliant'
        );
      });

      it('should prevent false positive alerts when event has partial matches in AND conditions', async () => {
        const id = uuidv4();

        // Create events: one that should match completely, one that should not match
        await indexListOfDocuments([
          // Event 1: Should match completely (user.name="user1" AND host.name="server")
          {
            ...eventDoc(uuidv4(), timestamp),
            user: { name: 'user1' },
            host: { name: 'server' },
          },
          // Event 2: Should NOT match (user.name="user2" AND host.name="server")
          // This would have caused false positive before the fix
          {
            ...eventDoc(uuidv4(), timestamp),
            user: { name: 'user2' },
            host: { name: 'server' },
          },
        ]);

        // Create threat indicators: one that matches Event 1 completely
        // we need to create 3 threats to ensure we have more threats than events
        await indexListOfDocuments([
          {
            ...threatDoc(uuidv4(), timestamp),
            user: { name: 'user1' },
            host: { name: 'server' },
          },
          // Additional threats to ensure we have more threats than events
          {
            ...threatDoc(uuidv4(), timestamp),
            user: { name: 'user3' },
            host: { name: 'server' },
          },
          {
            ...threatDoc(uuidv4(), timestamp),
            user: { name: 'user4' },
            host: { name: 'server' },
          },
        ]);

        const rule: ThreatMatchRuleCreateProps = {
          ...threatMatchRuleEcsComplaint(id),
          query: '* and NOT agent.type:threat',
          threat_query: '* and agent.type:threat',
          threat_mapping: [
            {
              entries: [
                {
                  field: 'user.name',
                  value: 'user.name',
                  type: 'mapping',
                },
                {
                  field: 'host.name',
                  value: 'host.name',
                  type: 'mapping',
                },
              ],
            },
          ],
        };

        const { previewId, logs } = await previewRule({
          supertest,
          rule,
          invocationCount: 1,
        });

        const previewAlerts = await getPreviewAlerts({
          es,
          previewId,
          sort: ['user.name', ALERT_ORIGINAL_TIME],
        });

        // Should only generate 1 alert for the event that matches completely
        expect(previewAlerts.length).toEqual(1);
        expect(logs[0].errors).toHaveLength(0);

        // Verify the alert is for the correct event (user1)
        const alert = previewAlerts[0]._source;
        expect(alert?.user?.name).toEqual('user1');
        expect(alert?.host?.name).toEqual('server');
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
        const timestamp = new Date().toISOString();

        // Create event documents with different namespaces
        const eventDocNamespace1 = {
          '@timestamp': timestamp,
          data_stream: { namespace: 'namespace1' },
          user: { name: 'user1' },
          host: { name: 'server' },
        };
        const eventDocNamespace2 = {
          '@timestamp': timestamp,
          data_stream: { namespace: 'namespace2' },
          user: { name: 'user2' },
          host: { name: 'server' },
        };
        const eventDocNamespace3 = {
          '@timestamp': timestamp,
          data_stream: { namespace: 'namespace3' },
          user: { name: 'user3' },
          host: { name: 'server' },
        };

        // Create threat indicators
        const threatIndicatorDoc = (threatId: string, threatTimestamp: string) => ({
          id: threatId,
          '@timestamp': threatTimestamp,
          data_stream: { namespace: 'namespace1' },
          agent: { type: 'threat' },
          user: { name: 'user1' },
          host: { name: 'server' },
        });

        await indexListOfDocuments([
          eventDocNamespace1,
          eventDocNamespace2,
          eventDocNamespace3,
          threatIndicatorDoc(uuidv4(), timestamp),
        ]);

        // Set UI setting to include only namespace1 and namespace2
        await setAdvancedSettings(supertest, {
          [INCLUDED_DATA_STREAM_NAMESPACES_FOR_RULE_EXECUTION]: ['namespace1', 'namespace2'],
        });

        const rule: ThreatMatchRuleCreateProps = {
          ...createThreatMatchRule({
            index: ['ecs_compliant'],
            query: `* and NOT agent.type:"threat"`,
            threat_index: ['ecs_compliant'],
            threat_query: '* and agent.type:"threat"',
            threat_mapping: [
              {
                entries: [
                  {
                    field: 'user.name',
                    value: 'user.name',
                    type: 'mapping',
                  },
                  {
                    field: 'host.name',
                    value: 'host.name',
                    type: 'mapping',
                  },
                ],
              },
            ],
          }),
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

        // Should only get alerts from namespace1, not namespace2 or namespace3
        // (namespace1 matches the threat indicator, namespace2 and namespace3 don't)
        expect(previewAlerts.length).toEqual(1);
        // @ts-expect-error namespace does not exist on type
        expect(previewAlerts[0]._source?.data_stream?.namespace).toEqual('namespace1');
      });
    });
  });
};
