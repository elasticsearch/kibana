/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';
import supertestLib from 'supertest';
import url from 'url';
import { default as kbnExpect } from '@kbn/expect';
import expect from 'expect';
import {
  ALERT_REASON,
  ALERT_RULE_UUID,
  ALERT_WORKFLOW_STATUS,
  ALERT_WORKFLOW_TAGS,
  ALERT_WORKFLOW_ASSIGNEE_IDS,
  ALERT_SUPPRESSION_DOCS_COUNT,
  EVENT_KIND,
  ALERT_RULE_EXECUTION_TYPE,
} from '@kbn/rule-data-utils';
import { flattenWithPrefix } from '@kbn/securitysolution-rules';

import { get } from 'lodash';

import type { EqlRuleCreateProps } from '@kbn/security-solution-plugin/common/api/detection_engine';
import type { Ancestor } from '@kbn/security-solution-plugin/server/lib/detection_engine/rule_types/types';
import {
  ALERT_ANCESTORS,
  ALERT_DEPTH,
  ALERT_ORIGINAL_TIME,
  ALERT_ORIGINAL_EVENT,
  ALERT_ORIGINAL_EVENT_CATEGORY,
  ALERT_GROUP_ID,
} from '@kbn/security-solution-plugin/common/field_maps/field_names';
import { getMaxSignalsWarning as getMaxAlertsWarning } from '@kbn/security-solution-plugin/server/lib/detection_engine/rule_types/utils/utils';
import {
  DETECTION_ENGINE_RULES_URL,
  INCLUDED_DATA_STREAM_NAMESPACES_FOR_RULE_EXECUTION,
} from '@kbn/security-solution-plugin/common/constants';
import {
  createRule,
  deleteAllRules,
  deleteAllAlerts,
  waitForRuleFailure,
  routeWithNamespace,
} from '@kbn/detections-response-ftr-services';
import {
  getEqlRuleForAlertTesting,
  getAlerts,
  getPreviewAlerts,
  previewRule,
  dataGeneratorFactory,
  scheduleRuleRun,
  stopAllManualRuns,
  waitForBackfillExecuted,
  setBrokenRuntimeField,
  unsetBrokenRuntimeField,
  setAdvancedSettings,
} from '../../../../utils';
import type { FtrProviderContext } from '../../../../../../ftr_provider_context';
import { EsArchivePathBuilder } from '../../../../../../es_archive_path_builder';
import { getMetricsRequest, getMetricsWithRetry } from '../../utils';
import { EntityStoreV2EnrichmentSetup } from '../../entity_store_v2_enrichment_setup';

/**
 * Specific AGENT_ID to use for some of the tests. If the archiver changes and you see errors
 * here, update this to a new value of a chosen auditbeat record and update the tests values.
 */
const AGENT_ID = 'a1d7b39c-f898-4dbe-a761-efb61939302d';
const specificQueryForTests = `configuration where agent.id=="${AGENT_ID}"`;

// host.id of the auditbeat record matched by `specificQueryForTests`.
// EUID priority is host.id, so the entity EUID is `host:${ENRICHMENT_HOST_ID}`.
const ENRICHMENT_HOST_ID = '8cc95778cce5407c809480e8e32ad76b';
const ENRICHMENT_HOST_NAME = 'suricata-zeek-sensor-toronto';
const ENRICHMENT_HOST_EUID = `host:${ENRICHMENT_HOST_ID}`;

export default ({ getService }: FtrProviderContext) => {
  const supertest = getService('supertest');
  const esArchiver = getService('esArchiver');
  const es = getService('es');
  const log = getService('log');
  const retry = getService('retry');
  const entityStoreV2 = EntityStoreV2EnrichmentSetup(getService);

  // TODO: add a new service for loading archiver files similar to "getService('es')"
  const config = getService('config');
  const request = supertestLib(url.format(config.get('servers.kibana')));
  const isServerless = config.get('serverless');
  const dataPathBuilder = new EsArchivePathBuilder(isServerless);
  const auditPath = dataPathBuilder.getPath('auditbeat/hosts');
  const packetBeatPath = dataPathBuilder.getPath('packetbeat/default');

  describe('@ess @serverless @serverlessQA EQL type rules', () => {
    const { indexListOfDocuments } = dataGeneratorFactory({
      es,
      index: 'ecs_compliant',
      log,
    });

    before(async () => {
      await esArchiver.load(auditPath);
      await esArchiver.load(
        'x-pack/solutions/security/test/fixtures/es_archives/security_solution/timestamp_override_6'
      );
      await esArchiver.load(
        'x-pack/solutions/security/test/fixtures/es_archives/security_solution/ecs_compliant'
      );
    });

    after(async () => {
      await esArchiver.unload(auditPath);
      await esArchiver.unload(
        'x-pack/solutions/security/test/fixtures/es_archives/security_solution/timestamp_override_6'
      );
      await esArchiver.unload(
        'x-pack/solutions/security/test/fixtures/es_archives/security_solution/ecs_compliant'
      );
      await deleteAllAlerts(supertest, log, es);
      await deleteAllRules(supertest, log);
    });

    // First test creates a real rule - remaining tests use preview API
    it('generates a correctly formatted alert from EQL non-sequence queries', async () => {
      const rule: EqlRuleCreateProps = {
        ...getEqlRuleForAlertTesting(['auditbeat-*']),
        query: specificQueryForTests,
      };
      const createdRule = await createRule(supertest, log, rule);
      const alerts = await getAlerts(supertest, log, es, createdRule);
      expect(alerts.hits.hits).toHaveLength(1);
      const fullAlert = alerts.hits.hits[0]._source;
      if (!fullAlert) {
        return kbnExpect(fullAlert).to.be.ok();
      }

      kbnExpect(fullAlert).eql({
        ...fullAlert,
        agent: {
          ephemeral_id: '0010d67a-14f7-41da-be30-489fea735967',
          hostname: 'suricata-zeek-sensor-toronto',
          id: AGENT_ID,
          type: 'auditbeat',
          version: '8.0.0',
        },
        auditd: {
          data: {
            audit_enabled: '1',
            old: '1',
          },
          message_type: 'config_change',
          result: 'success',
          sequence: 1496,
          session: 'unset',
          summary: {
            actor: {
              primary: 'unset',
            },
            object: {
              primary: '1',
              type: 'audit-config',
            },
          },
        },
        cloud: {
          instance: {
            id: '133555295',
          },
          provider: 'digitalocean',
          region: 'tor1',
        },
        ecs: {
          version: '1.0.0-beta2',
        },
        event: {
          action: 'changed-audit-configuration',
          category: 'configuration',
          module: 'auditd',
        },
        'event.kind': 'signal',
        host: {
          architecture: 'x86_64',
          containerized: false,
          hostname: 'suricata-zeek-sensor-toronto',
          id: '8cc95778cce5407c809480e8e32ad76b',
          name: 'suricata-zeek-sensor-toronto',
          os: {
            codename: 'bionic',
            family: 'debian',
            kernel: '4.15.0-45-generic',
            name: 'Ubuntu',
            platform: 'ubuntu',
            version: '18.04.2 LTS (Bionic Beaver)',
          },
        },
        service: {
          type: 'auditd',
        },
        user: {
          audit: {
            id: 'unset',
          },
        },
        [ALERT_REASON]:
          'configuration event on suricata-zeek-sensor-toronto created high alert Alert Testing Query.',
        [ALERT_RULE_UUID]: fullAlert[ALERT_RULE_UUID],
        [ALERT_ORIGINAL_TIME]: fullAlert[ALERT_ORIGINAL_TIME],
        [ALERT_WORKFLOW_STATUS]: 'open',
        [ALERT_WORKFLOW_TAGS]: [],
        [ALERT_WORKFLOW_ASSIGNEE_IDS]: [],
        [ALERT_DEPTH]: 1,
        [ALERT_ANCESTORS]: [
          {
            depth: 0,
            id: '9xbRBmkBR346wHgngz2D',
            index: 'auditbeat-8.0.0-2019.02.19-000001',
            type: 'event',
          },
        ],
        ...flattenWithPrefix(ALERT_ORIGINAL_EVENT, {
          action: 'changed-audit-configuration',
          category: 'configuration',
          module: 'auditd',
        }),
      });
    });

    // FLAKY: https://github.com/elastic/kibana/issues/180641
    it.skip('classifies verification_exception errors as user errors', async () => {
      await getMetricsRequest(request, true);
      const rule: EqlRuleCreateProps = {
        ...getEqlRuleForAlertTesting(['auditbeat-*']),
        query: 'file where field.doesnt.exist == true',
      };
      const createdRule = await createRule(supertest, log, rule);
      await waitForRuleFailure({ supertest, log, id: createdRule.id });

      const route = routeWithNamespace(DETECTION_ENGINE_RULES_URL);
      const response = await supertest
        .get(route)
        .set('kbn-xsrf', 'true')
        .set('elastic-api-version', '2023-10-31')
        .query({ id: createdRule.id })
        .expect(200);

      const ruleResponse = response.body;
      kbnExpect(
        ruleResponse.execution_summary.last_execution.message.includes('verification_exception')
      ).eql(true);

      const metricsResponse = await getMetricsWithRetry(
        request,
        retry,
        false,
        (metrics) =>
          metrics.metrics?.task_run?.value.by_type['alerting:siem__eqlRule'].user_errors === 1
      );
      kbnExpect(
        metricsResponse.metrics?.task_run?.value.by_type['alerting:siem__eqlRule'].user_errors
      ).eql(1);
    });

    it('parses shard failures for EQL event query', async () => {
      await esArchiver.load(packetBeatPath);
      await setBrokenRuntimeField({ es, index: 'packetbeat-*' });

      // sometimes we would hit max signals on the good shard
      // and never search the shard with the bad runtime field
      // by changing the logic to be "and" broken == 1
      // we ensure that both shards are searched
      // which I believe was the cause of the test being flakey.
      const rule: EqlRuleCreateProps = {
        ...getEqlRuleForAlertTesting(['auditbeat-*', 'packetbeat-*']),
        query: 'any where agent.type == "packetbeat" and broken == 1',
      };
      const { logs } = await previewRule({ supertest, rule });
      expect(logs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            warnings: expect.arrayContaining([
              expect.stringContaining(
                'The EQL event query was only executed on the available shards. The query failed to run successfully on the following shards:'
              ),
            ]),
          }),
        ])
      );
      await unsetBrokenRuntimeField({ es, index: 'packetbeat-*' });
      await esArchiver.unload(packetBeatPath);
    });

    it('generates up to max_alerts for non-sequence EQL queries', async () => {
      const maxAlerts = 200;
      const rule: EqlRuleCreateProps = {
        ...getEqlRuleForAlertTesting(['auditbeat-*']),
        max_signals: maxAlerts,
      };
      const { previewId } = await previewRule({ supertest, rule });
      const previewAlerts = await getPreviewAlerts({ es, previewId, size: maxAlerts * 2 });
      expect(previewAlerts).toHaveLength(maxAlerts);
    });

    it('generates max alerts warning when circuit breaker is hit', async () => {
      const rule: EqlRuleCreateProps = {
        ...getEqlRuleForAlertTesting(['auditbeat-*']),
      };
      const { logs } = await previewRule({ supertest, rule });
      kbnExpect(logs[0].warnings).contain(getMaxAlertsWarning());
    });

    it('uses the provided event_category_override', async () => {
      const rule: EqlRuleCreateProps = {
        ...getEqlRuleForAlertTesting(['auditbeat-*']),
        query: `config_change where agent.id=="${AGENT_ID}"`,
        event_category_override: 'auditd.message_type',
      };
      const { previewId } = await previewRule({ supertest, rule });
      const previewAlerts = await getPreviewAlerts({ es, previewId });
      expect(previewAlerts).toHaveLength(1);
      const fullAlert = previewAlerts[0]._source;
      if (!fullAlert) {
        return kbnExpect(fullAlert).to.be.ok();
      }

      kbnExpect(fullAlert).eql({
        ...fullAlert,
        auditd: {
          data: {
            audit_enabled: '1',
            old: '1',
          },
          message_type: 'config_change',
          result: 'success',
          sequence: 1496,
          session: 'unset',
          summary: {
            actor: {
              primary: 'unset',
            },
            object: {
              primary: '1',
              type: 'audit-config',
            },
          },
        },
        event: {
          action: 'changed-audit-configuration',
          category: 'configuration',
          module: 'auditd',
        },
        service: {
          type: 'auditd',
        },
        user: {
          audit: {
            id: 'unset',
          },
        },
        [ALERT_REASON]:
          'configuration event on suricata-zeek-sensor-toronto created high alert Alert Testing Query.',
        [ALERT_RULE_UUID]: fullAlert[ALERT_RULE_UUID],
        [ALERT_ORIGINAL_TIME]: fullAlert[ALERT_ORIGINAL_TIME],
        [ALERT_WORKFLOW_STATUS]: 'open',
        [ALERT_DEPTH]: 1,
        [ALERT_ANCESTORS]: [
          {
            depth: 0,
            id: '9xbRBmkBR346wHgngz2D',
            index: 'auditbeat-8.0.0-2019.02.19-000001',
            type: 'event',
          },
        ],
        ...flattenWithPrefix(ALERT_ORIGINAL_EVENT, {
          action: 'changed-audit-configuration',
          category: 'configuration',
          module: 'auditd',
        }),
      });
    });

    it('uses the provided timestamp_field', async () => {
      const rule: EqlRuleCreateProps = {
        ...getEqlRuleForAlertTesting(['fake.index.1']),
        query: 'any where true',
        timestamp_field: 'created_at',
      };
      const { previewId } = await previewRule({ supertest, rule });
      const previewAlerts = await getPreviewAlerts({ es, previewId });
      expect(previewAlerts).toHaveLength(3);

      const createdAtHits = previewAlerts.map((hit) => hit._source?.created_at).sort();
      kbnExpect(createdAtHits).to.eql([1622676785, 1622676790, 1622676795]);
    });

    it('uses the provided tiebreaker_field', async () => {
      const rule: EqlRuleCreateProps = {
        ...getEqlRuleForAlertTesting(['fake.index.1']),
        query: 'any where true',
        tiebreaker_field: 'locale',
      };
      const { previewId } = await previewRule({ supertest, rule });
      const previewAlerts = await getPreviewAlerts({ es, previewId });
      expect(previewAlerts).toHaveLength(3);

      const createdAtHits = previewAlerts.map((hit) => hit._source?.locale);
      kbnExpect(createdAtHits).to.eql(['es', 'pt', 'ua']);
    });

    it('generates building block alerts from EQL sequences in the expected form', async () => {
      const rule: EqlRuleCreateProps = {
        ...getEqlRuleForAlertTesting(['auditbeat-*']),
        query: 'sequence by host.name [anomoly where true] [any where true]', // TODO: spelling
      };
      const { previewId } = await previewRule({ supertest, rule });
      const previewAlerts = await getPreviewAlerts({ es, previewId });
      const buildingBlock = previewAlerts.find(
        (alert) =>
          alert._source?.[ALERT_DEPTH] === 1 &&
          get(alert._source, ALERT_ORIGINAL_EVENT_CATEGORY) === 'anomoly'
      );
      kbnExpect(buildingBlock).not.eql(undefined);
      const fullAlert = buildingBlock?._source;
      if (!fullAlert) {
        return kbnExpect(fullAlert).to.be.ok();
      }

      kbnExpect(fullAlert).eql({
        ...fullAlert,
        agent: {
          ephemeral_id: '1b4978a0-48be-49b1-ac96-323425b389ab',
          hostname: 'zeek-sensor-amsterdam',
          id: 'e52588e6-7aa3-4c89-a2c4-d6bc5c286db1',
          type: 'auditbeat',
          version: '8.0.0',
        },
        auditd: {
          data: {
            a0: '3',
            a1: '107',
            a2: '1',
            a3: '7ffc186b58e0',
            arch: 'x86_64',
            auid: 'unset',
            dev: 'eth0',
            exit: '0',
            gid: '0',
            old_prom: '0',
            prom: '256',
            ses: 'unset',
            syscall: 'setsockopt',
            tty: '(none)',
            uid: '0',
          },
          message_type: 'anom_promiscuous',
          result: 'success',
          sequence: 1392,
          session: 'unset',
          summary: {
            actor: {
              primary: 'unset',
              secondary: 'root',
            },
            how: '/usr/bin/bro',
            object: {
              primary: 'eth0',
              type: 'network-device',
            },
          },
        },
        cloud: { instance: { id: '133551048' }, provider: 'digitalocean', region: 'ams3' },
        ecs: { version: '1.0.0-beta2' },
        event: {
          action: 'changed-promiscuous-mode-on-device',
          category: 'anomoly',
          module: 'auditd',
        },
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
        process: {
          executable: '/usr/bin/bro',
          name: 'bro',
          pid: 30157,
          ppid: 30151,
          title:
            '/usr/bin/bro -i eth0 -U .status -p broctl -p broctl-live -p standalone -p local -p bro local.bro broctl broctl/standalone broctl',
        },
        service: { type: 'auditd' },
        user: {
          audit: { id: 'unset' },
          effective: {
            group: {
              id: '0',
              name: 'root',
            },
            id: '0',
            name: 'root',
          },
          filesystem: {
            group: {
              id: '0',
              name: 'root',
            },
            id: '0',
            name: 'root',
          },
          group: { id: '0', name: 'root' },
          id: '0',
          name: 'root',
          saved: {
            group: {
              id: '0',
              name: 'root',
            },
            id: '0',
            name: 'root',
          },
        },
        [ALERT_REASON]:
          'anomoly event with process bro, by root on zeek-sensor-amsterdam created high alert Alert Testing Query.',
        [ALERT_RULE_UUID]: fullAlert[ALERT_RULE_UUID],
        [ALERT_GROUP_ID]: fullAlert[ALERT_GROUP_ID],
        [ALERT_ORIGINAL_TIME]: fullAlert[ALERT_ORIGINAL_TIME],
        [ALERT_WORKFLOW_STATUS]: 'open',
        [ALERT_DEPTH]: 1,
        [ALERT_ANCESTORS]: [
          {
            depth: 0,
            id: 'VhXOBmkBR346wHgnLP8T',
            index: 'auditbeat-8.0.0-2019.02.19-000001',
            type: 'event',
          },
        ],
        ...flattenWithPrefix(ALERT_ORIGINAL_EVENT, {
          action: 'changed-promiscuous-mode-on-device',
          category: 'anomoly',
          module: 'auditd',
        }),
      });
    });

    it('generates shell alerts from EQL sequences in the expected form', async () => {
      const rule: EqlRuleCreateProps = {
        ...getEqlRuleForAlertTesting(['auditbeat-*']),
        query: 'sequence by host.name [anomoly where true] [any where true]',
      };
      const { previewId } = await previewRule({ supertest, rule });
      const previewAlerts = await getPreviewAlerts({ es, previewId });
      const sequenceAlert = previewAlerts.find((alert) => alert._source?.[ALERT_DEPTH] === 2);
      const source = sequenceAlert?._source;
      if (!source) {
        return kbnExpect(source).to.be.ok();
      }
      const eventIds = (source?.[ALERT_ANCESTORS] as Ancestor[])
        .filter((event) => event.depth === 1)
        .map((event) => event.id);
      kbnExpect(source).eql({
        ...source,
        agent: {
          ephemeral_id: '1b4978a0-48be-49b1-ac96-323425b389ab',
          hostname: 'zeek-sensor-amsterdam',
          id: 'e52588e6-7aa3-4c89-a2c4-d6bc5c286db1',
          type: 'auditbeat',
          version: '8.0.0',
        },
        auditd: { session: 'unset', summary: { actor: { primary: 'unset' } } },
        cloud: { instance: { id: '133551048' }, provider: 'digitalocean', region: 'ams3' },
        ecs: { version: '1.0.0-beta2' },
        [EVENT_KIND]: 'signal',
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
        service: { type: 'auditd' },
        user: { audit: { id: 'unset' }, id: '0', name: 'root' },
        [ALERT_WORKFLOW_STATUS]: 'open',
        [ALERT_DEPTH]: 2,
        [ALERT_GROUP_ID]: source[ALERT_GROUP_ID],
        [ALERT_REASON]:
          'event by root on zeek-sensor-amsterdam created high alert Alert Testing Query.',
        [ALERT_RULE_UUID]: source[ALERT_RULE_UUID],
        [ALERT_ANCESTORS]: [
          {
            depth: 0,
            id: 'VhXOBmkBR346wHgnLP8T',
            index: 'auditbeat-8.0.0-2019.02.19-000001',
            type: 'event',
          },
          {
            depth: 1,
            id: eventIds[0],
            index: '',
            rule: source[ALERT_RULE_UUID],
            type: 'signal',
          },
          {
            depth: 0,
            id: '4hbXBmkBR346wHgn6fdp',
            index: 'auditbeat-8.0.0-2019.02.19-000001',
            type: 'event',
          },
          {
            depth: 1,
            id: eventIds[1],
            index: '',
            rule: source[ALERT_RULE_UUID],
            type: 'signal',
          },
        ],
      });
    });

    it('ensures common fields are present in generated shell alert', async () => {
      const id = uuidv4();
      const doc1 = {
        id,
        agent: {
          name: 'agent-1',
          type: 'auditbeat',
          version: '8.13.0',
        },
        client: {
          ip: ['127.0.0.1', '127.0.0.2'],
        },
        'host.name': 'host-0',
      };

      const doc2 = {
        id,
        agent: {
          name: 'agent-0',
          type: 'auditbeat',
          version: '8.13.0',
        },
        client: {
          ip: ['127.0.0.1', '127.0.0.3'],
        },
        'host.name': 'host-0',
      };

      await indexListOfDocuments([
        { '@timestamp': '2020-10-28T06:15:00.000Z', ...doc1 },
        { '@timestamp': '2020-10-28T06:16:00.000Z', ...doc2 },
      ]);

      const rule: EqlRuleCreateProps = {
        ...getEqlRuleForAlertTesting(['ecs_compliant']),
        query: `sequence [any where id == "${id}" ] [any where true]`,
        from: 'now-35m',
        interval: '30m',
      };
      const { previewId } = await previewRule({
        supertest,
        rule,
        timeframeEnd: new Date('2020-10-28T06:30:00.000Z'),
      });

      const previewAlerts = await getPreviewAlerts({ es, previewId, sort: ['agent.name'] });

      expect(previewAlerts).toHaveLength(3);

      const buildingBlockAlerts = previewAlerts.filter(
        (alert) => alert._source?.['kibana.alert.building_block_type']
      );
      const shellAlert = previewAlerts.filter(
        (alert) => !alert._source?.['kibana.alert.building_block_type']
      )[0];

      // check building block alert retains all fields from source documents
      // alerts sorted by agent.name, so we assert it against agent-0 document
      kbnExpect(buildingBlockAlerts[0]._source).eql({
        ...buildingBlockAlerts[0]._source,
        ...doc2,
      });

      kbnExpect(buildingBlockAlerts[1]._source).eql({
        ...buildingBlockAlerts[1]._source,
        ...doc1,
      });

      // shell alert should have only common properties from building block alerts
      kbnExpect(shellAlert._source?.agent).eql({
        type: 'auditbeat',
        version: '8.13.0',
        // agent name is absent as this field is not common
      });
      // only common values in array are present
      kbnExpect(shellAlert._source?.client).eql({ ip: ['127.0.0.1'] });
      kbnExpect(shellAlert._source?.['host.name']).be('host-0');
    });

    it('generates up to max_alerts with an EQL rule', async () => {
      const maxAlerts = 200;
      const rule: EqlRuleCreateProps = {
        ...getEqlRuleForAlertTesting(['auditbeat-*']),
        query: 'sequence by host.name [any where true] [any where true]',
        max_signals: maxAlerts,
      };
      const { previewId } = await previewRule({ supertest, rule });
      const previewAlerts = await getPreviewAlerts({ es, previewId, size: maxAlerts * 5 });
      // For EQL rules, max_alerts is the maximum number of detected sequences: each sequence has a building block
      // alert for each event in the sequence, so max_alerts=200 results in 400 building blocks in addition to
      // 200 regular alerts
      expect(previewAlerts).toHaveLength(maxAlerts * 3);
      const shellAlerts = previewAlerts.filter((alert) => alert._source?.[ALERT_DEPTH] === 2);
      const buildingBlocks = previewAlerts.filter((alert) => alert._source?.[ALERT_DEPTH] === 1);
      expect(shellAlerts).toHaveLength(maxAlerts);
      expect(buildingBlocks).toHaveLength(maxAlerts * 2);
    });

    it('generates alerts when an index name contains special characters to encode', async () => {
      const rule: EqlRuleCreateProps = {
        ...getEqlRuleForAlertTesting(['auditbeat-*', '<my-index-{now/d}*>']),
        query: specificQueryForTests,
      };
      const { previewId } = await previewRule({ supertest, rule });
      const previewAlerts = await getPreviewAlerts({ es, previewId });
      expect(previewAlerts).toHaveLength(1);
    });

    it('uses the provided filters', async () => {
      const rule: EqlRuleCreateProps = {
        ...getEqlRuleForAlertTesting(['auditbeat-*']),
        query: 'any where true',
        filters: [
          {
            meta: {
              alias: null,
              negate: false,
              disabled: false,
              type: 'phrase',
              key: 'source.ip',
              params: {
                query: '46.148.18.163',
              },
            },
            query: {
              match_phrase: {
                'source.ip': '46.148.18.163',
              },
            },
          },
          {
            meta: {
              alias: null,
              negate: false,
              disabled: false,
              type: 'phrase',
              key: 'event.action',
              params: {
                query: 'error',
              },
            },
            query: {
              match_phrase: {
                'event.action': 'error',
              },
            },
          },
        ],
      };
      const { previewId } = await previewRule({ supertest, rule });
      const previewAlerts = await getPreviewAlerts({ es, previewId });
      expect(previewAlerts).toHaveLength(2);
    });

    describe('with host risk index', () => {
      before(async () => {
        await entityStoreV2.setup({
          hosts: [
            {
              host: { name: ENRICHMENT_HOST_NAME, id: [ENRICHMENT_HOST_ID] },
              entity: {
                id: ENRICHMENT_HOST_EUID,
                type: 'host',
                risk: { calculated_level: 'Critical', calculated_score_norm: 96 },
              },
            },
          ],
        });
      });

      after(async () => {
        await entityStoreV2.teardown();
      });

      it('should be enriched with host risk score', async () => {
        const rule: EqlRuleCreateProps = {
          ...getEqlRuleForAlertTesting(['auditbeat-*']),
          query: specificQueryForTests,
        };
        const { previewId } = await previewRule({ supertest, rule });
        const previewAlerts = await getPreviewAlerts({ es, previewId });
        expect(previewAlerts).toHaveLength(1);
        const fullAlert = previewAlerts[0]._source;
        if (!fullAlert) {
          return kbnExpect(fullAlert).to.be.ok();
        }
        kbnExpect(fullAlert?.host?.risk?.calculated_level).to.eql('Critical');
        kbnExpect(fullAlert?.host?.risk?.calculated_score_norm).to.eql(96);
      });
    });

    describe('with asset criticality', () => {
      before(async () => {
        await entityStoreV2.setup({
          hosts: [
            {
              host: { name: ENRICHMENT_HOST_NAME, id: [ENRICHMENT_HOST_ID] },
              entity: { id: ENRICHMENT_HOST_EUID, type: 'host' },
              asset: { criticality: 'high_impact' },
            },
          ],
        });
      });

      after(async () => {
        await entityStoreV2.teardown();
      });

      it('should be enriched alert with criticality_level', async () => {
        const rule: EqlRuleCreateProps = {
          ...getEqlRuleForAlertTesting(['auditbeat-*']),
          query: specificQueryForTests,
        };

        const { previewId } = await previewRule({ supertest, rule });
        const previewAlerts = await getPreviewAlerts({ es, previewId });
        const fullAlert = previewAlerts[0]._source;
        kbnExpect(fullAlert?.['host.asset.criticality']).to.eql('high_impact');
      });
    });

    describe('using data with a @timestamp field', () => {
      const expectedWarning =
        'This rule reached the maximum alert limit for the rule execution. Some alerts were not created.';

      it('specifying only timestamp_field results in alert creation with an kbnExpect.expected warning', async () => {
        const rule: EqlRuleCreateProps = {
          ...getEqlRuleForAlertTesting(['auditbeat-*']),
          timestamp_field: 'event.created',
        };

        const {
          previewId,
          logs: [_log],
        } = await previewRule({ supertest, rule });

        kbnExpect(_log.errors).to.be.empty();
        kbnExpect(_log.warnings).to.eql([expectedWarning]);

        const previewAlerts = await getPreviewAlerts({ es, previewId });
        expect(previewAlerts).not.toHaveLength(0);
      });

      it('specifying only timestamp_override results in alert creation with an kbnExpect.expected warning', async () => {
        const rule: EqlRuleCreateProps = {
          ...getEqlRuleForAlertTesting(['auditbeat-*']),
          timestamp_override: 'event.created',
        };

        const {
          previewId,
          logs: [_log],
        } = await previewRule({ supertest, rule });

        kbnExpect(_log.errors).to.be.empty();
        kbnExpect(_log.warnings).to.eql([expectedWarning]);

        const previewAlerts = await getPreviewAlerts({ es, previewId });
        expect(previewAlerts).not.toHaveLength(0);
      });

      it('specifying both timestamp_override and timestamp_field results in alert creation with an kbnExpect.expected warning', async () => {
        const rule: EqlRuleCreateProps = {
          ...getEqlRuleForAlertTesting(['auditbeat-*']),
          timestamp_field: 'event.created',
          timestamp_override: 'event.created',
        };

        const {
          previewId,
          logs: [_log],
        } = await previewRule({ supertest, rule });

        kbnExpect(_log.errors).to.be.empty();
        kbnExpect(_log.warnings).to.eql([expectedWarning]);

        const previewAlerts = await getPreviewAlerts({ es, previewId });
        expect(previewAlerts).not.toHaveLength(0);
      });
    });

    describe('using data without a @timestamp field', () => {
      before(async () => {
        await esArchiver.load(
          'x-pack/solutions/security/test/fixtures/es_archives/security_solution/no_at_timestamp_field'
        );
      });

      after(async () => {
        await esArchiver.unload(
          'x-pack/solutions/security/test/fixtures/es_archives/security_solution/no_at_timestamp_field'
        );
      });

      it('specifying only timestamp_field results in a warning, and no alerts are generated', async () => {
        const rule: EqlRuleCreateProps = {
          ...getEqlRuleForAlertTesting(['auditbeat-no_at_timestamp_field']),
          timestamp_field: 'event.ingested',
        };

        const {
          previewId,
          logs: [_log],
        } = await previewRule({ supertest, rule });

        kbnExpect(_log.errors).to.be.empty();
        kbnExpect(_log.warnings).to.contain(
          'The following indices are missing the timestamp field "@timestamp": ["auditbeat-no_at_timestamp_field"]'
        );

        const previewAlerts = await getPreviewAlerts({ es, previewId });
        kbnExpect(previewAlerts).to.be.empty();
      });

      it('specifying only timestamp_override results in an error, and no alerts are generated', async () => {
        const rule: EqlRuleCreateProps = {
          ...getEqlRuleForAlertTesting(['auditbeat-no_at_timestamp_field']),
          timestamp_override: 'event.ingested',
        };

        const {
          previewId,
          logs: [_log],
        } = await previewRule({ supertest, rule });

        kbnExpect(_log.errors[0]).to.contain(
          'verification_exception\n\tRoot causes:\n\t\tverification_exception: Found 1 problem\nline -1:-1: Unknown column [@timestamp]'
        );

        const previewAlerts = await getPreviewAlerts({ es, previewId });
        kbnExpect(previewAlerts).to.be.empty();
      });

      it('specifying both timestamp_override and timestamp_field results in alert creation with no warnings or errors', async () => {
        const rule: EqlRuleCreateProps = {
          ...getEqlRuleForAlertTesting(['auditbeat-no_at_timestamp_field']),
          timestamp_field: 'event.ingested',
          timestamp_override: 'event.ingested',
        };

        const {
          previewId,
          logs: [_log],
        } = await previewRule({ supertest, rule });

        kbnExpect(_log.errors).to.be.empty();
        kbnExpect(_log.warnings).to.be.empty();
        const previewAlerts = await getPreviewAlerts({ es, previewId });

        expect(previewAlerts).toHaveLength(3);
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
            name: 'agent-1',
          },
          client: {
            ip: ['127.0.0.1', '127.0.0.2'],
          },
        };
        const secondDocument = {
          id,
          '@timestamp': firstTimestamp.subtract(1, 'm').toISOString(),
          agent: {
            name: 'agent-2',
          },
          client: {
            ip: ['127.0.0.1', '127.0.0.3'],
          },
        };
        const thirdDocument = {
          id,
          '@timestamp': moment(new Date()).subtract(1, 'm').toISOString(),
          agent: {
            name: 'agent-3',
          },
          client: {
            ip: ['127.0.0.1', '127.0.0.4'],
          },
        };
        const fourthDocument = {
          id,
          '@timestamp': moment(new Date()).toISOString(),
          agent: {
            name: 'agent-4',
          },
          client: {
            ip: ['127.0.0.1', '127.0.0.5'],
          },
        };

        await indexListOfDocuments([firstDocument, secondDocument, thirdDocument, fourthDocument]);

        const rule: EqlRuleCreateProps = {
          ...getEqlRuleForAlertTesting(['ecs_compliant']),
          query: `sequence [any where id == "${id}" ] [any where true]`,
          from: 'now-1h',
          interval: '1h',
        };

        const createdRule = await createRule(supertest, log, rule);
        const alerts = await getAlerts(supertest, log, es, createdRule);
        expect(alerts.hits.hits).toHaveLength(3);
        kbnExpect(alerts.hits.hits[0]?._source?.[ALERT_RULE_EXECUTION_TYPE]).equal('scheduled');

        const backfill = await scheduleRuleRun(supertest, [createdRule.id], {
          startDate: moment(firstTimestamp).subtract(5, 'm'),
          endDate: moment(firstTimestamp).add(5, 'm'),
        });

        await waitForBackfillExecuted(backfill, [createdRule.id], { supertest, log });
        const allNewAlerts = await getAlerts(supertest, log, es, createdRule);
        expect(allNewAlerts.hits.hits).toHaveLength(6);
        kbnExpect(allNewAlerts.hits.hits[5]?._source?.[ALERT_RULE_EXECUTION_TYPE]).equal('manual');

        const secondBackfill = await scheduleRuleRun(supertest, [createdRule.id], {
          startDate: moment(firstTimestamp).subtract(5, 'm'),
          endDate: moment(firstTimestamp).add(5, 'm'),
        });

        await waitForBackfillExecuted(secondBackfill, [createdRule.id], { supertest, log });
        const allNewAlertsAfter2ManualRuns = await getAlerts(supertest, log, es, createdRule);
        expect(allNewAlertsAfter2ManualRuns.hits.hits).toHaveLength(6);
      });

      it('does not alert if the manual run overlaps with a previous scheduled rule execution', async () => {
        const id = uuidv4();
        const firstTimestamp = moment(new Date());
        const firstDocument = {
          id,
          '@timestamp': firstTimestamp.subtract(1, 'm').toISOString(),
          agent: {
            name: 'agent-3',
          },
          client: {
            ip: ['127.0.0.1', '127.0.0.4'],
          },
        };
        const secondDocument = {
          id,
          '@timestamp': firstTimestamp.subtract(2, 'm').toISOString(),
          agent: {
            name: 'agent-4',
          },
          client: {
            ip: ['127.0.0.1', '127.0.0.5'],
          },
        };

        await indexListOfDocuments([firstDocument, secondDocument]);

        const rule: EqlRuleCreateProps = {
          ...getEqlRuleForAlertTesting(['ecs_compliant']),
          query: `sequence [any where id == "${id}" ] [any where true]`,
          from: 'now-1h',
          interval: '1h',
        };

        const createdRule = await createRule(supertest, log, rule);
        const alerts = await getAlerts(supertest, log, es, createdRule);

        expect(alerts.hits.hits).toHaveLength(3);

        const backfill = await scheduleRuleRun(supertest, [createdRule.id], {
          startDate: moment(firstTimestamp).subtract(5, 'm'),
          endDate: moment(),
        });

        await waitForBackfillExecuted(backfill, [createdRule.id], { supertest, log });
        const allNewAlerts = await getAlerts(supertest, log, es, createdRule);
        expect(allNewAlerts.hits.hits).toHaveLength(3);
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

        const rule: EqlRuleCreateProps = {
          ...getEqlRuleForAlertTesting(['ecs_compliant']),
          query: `any where true`,
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

        kbnExpect(allNewAlerts.hits.hits[0]._source?.[ALERT_SUPPRESSION_DOCS_COUNT]).equal(2);
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

        const rule: EqlRuleCreateProps = {
          ...getEqlRuleForAlertTesting(['ecs_compliant']),
          query: `any where true`,
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
          endDate: moment(firstTimestamp).add(10, 'm'),
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

        kbnExpect(updatedAlerts.hits.hits[0]._source?.[ALERT_SUPPRESSION_DOCS_COUNT]).equal(1);
      });
    });

    describe('preview logged requests', () => {
      it('should not return requests property when not enabled', async () => {
        const { logs } = await previewRule({
          supertest,
          rule: getEqlRuleForAlertTesting(['auditbeat-*']),
        });

        kbnExpect(logs[0].requests).equal(undefined);
      });
      it('should return requests property when enable_logged_requests set to true', async () => {
        const eqlRule = getEqlRuleForAlertTesting(['auditbeat-*']);
        const { logs } = await previewRule({
          supertest,
          rule: eqlRule,
          enableLoggedRequests: true,
        });

        const requests = logs[0].requests;

        expect(requests).toHaveLength(1);
        kbnExpect(requests![0].description).to.be('EQL request to find all matches');
        kbnExpect(requests![0].request).to.contain(
          'POST /auditbeat-*/_eql/search?allow_no_indices=true'
        );
        kbnExpect(requests![0].request).to.contain(eqlRule.query);
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

        // Create documents with different namespaces
        const docNamespace1 = {
          id,
          '@timestamp': timestamp,
          data_stream: { namespace: 'namespace1' },
          agent: {
            name: 'agent-namespace1',
          },
          event: {
            category: 'process',
            action: 'start',
          },
        };
        const docNamespace2 = {
          id,
          '@timestamp': timestamp,
          data_stream: { namespace: 'namespace2' },
          agent: {
            name: 'agent-namespace2',
          },
          event: {
            category: 'process',
            action: 'start',
          },
        };
        const docNamespace3 = {
          id,
          '@timestamp': timestamp,
          data_stream: { namespace: 'namespace3' },
          agent: {
            name: 'agent-namespace3',
          },
          event: {
            category: 'process',
            action: 'start',
          },
        };

        await indexListOfDocuments([docNamespace1, docNamespace2, docNamespace3]);

        // Set UI setting to include only namespace1 and namespace2
        await setAdvancedSettings(supertest, {
          [INCLUDED_DATA_STREAM_NAMESPACES_FOR_RULE_EXECUTION]: ['namespace1', 'namespace2'],
        });

        const rule: EqlRuleCreateProps = {
          ...getEqlRuleForAlertTesting(['ecs_compliant']),
          query: `any where id == "${id}"`,
          from: 'now-1h',
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
        // @ts-expect-error namespace does not exist on type
        const namespaces = previewAlerts.map((alert) => alert._source?.data_stream?.namespace);
        expect(namespaces).toContain('namespace1');
        expect(namespaces).toContain('namespace2');
        expect(namespaces).not.toContain('namespace3');
      });
    });
  });
};
