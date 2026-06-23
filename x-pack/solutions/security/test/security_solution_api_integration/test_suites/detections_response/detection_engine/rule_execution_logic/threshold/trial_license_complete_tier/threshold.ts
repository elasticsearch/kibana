/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from 'expect';
import moment from 'moment';
import { v4 as uuidv4 } from 'uuid';
import {
  ALERT_REASON,
  ALERT_RULE_UUID,
  ALERT_WORKFLOW_STATUS,
  EVENT_KIND,
  ALERT_SUPPRESSION_DOCS_COUNT,
  ALERT_RULE_EXECUTION_TYPE,
} from '@kbn/rule-data-utils';

import type { ThresholdRuleCreateProps } from '@kbn/security-solution-plugin/common/api/detection_engine';
import type { Ancestor } from '@kbn/security-solution-plugin/server/lib/detection_engine/rule_types/types';

import {
  ALERT_ANCESTORS,
  ALERT_DEPTH,
  ALERT_ORIGINAL_TIME,
  ALERT_THRESHOLD_RESULT,
} from '@kbn/security-solution-plugin/common/field_maps/field_names';
import { INCLUDED_DATA_STREAM_NAMESPACES_FOR_RULE_EXECUTION } from '@kbn/security-solution-plugin/common/constants';
import { getMaxSignalsWarning as getMaxAlertsWarning } from '@kbn/security-solution-plugin/server/lib/detection_engine/rule_types/utils/utils';
import { createRule, deleteAllRules, deleteAllAlerts } from '@kbn/detections-response-ftr-services';
import {
  getAlerts,
  getPreviewAlerts,
  getThresholdRuleForAlertTesting,
  previewRule,
  dataGeneratorFactory,
  scheduleRuleRun,
  stopAllManualRuns,
  waitForBackfillExecuted,
  setAdvancedSettings,
} from '../../../../utils';
import type { FtrProviderContext } from '../../../../../../ftr_provider_context';
import { EsArchivePathBuilder } from '../../../../../../es_archive_path_builder';
import { EntityStoreV2EnrichmentSetup } from '../../entity_store_v2_enrichment_setup';

// Sorted by host.name: suricata-sensor-london < suricata-zeek-sensor-toronto.
const LONDON_HOST_NAME = 'suricata-sensor-london';
const TORONTO_HOST_NAME = 'suricata-zeek-sensor-toronto';

export default ({ getService }: FtrProviderContext) => {
  const supertest = getService('supertest');
  const esArchiver = getService('esArchiver');
  const es = getService('es');
  const log = getService('log');
  // TODO: add a new service for loading archiver files similar to "getService('es')"
  const config = getService('config');
  const isServerless = config.get('serverless');
  const dataPathBuilder = new EsArchivePathBuilder(isServerless);
  const path = dataPathBuilder.getPath('auditbeat/hosts');
  const entityStoreV2 = EntityStoreV2EnrichmentSetup(getService);

  describe('@ess @serverless @serverlessQA Threshold type rules', () => {
    before(async () => {
      await esArchiver.load(path);
    });

    after(async () => {
      await esArchiver.unload(path);
    });

    // First test creates a real rule - remaining tests use preview API
    it('generates 1 alert from Threshold rules when threshold is met', async () => {
      const rule: ThresholdRuleCreateProps = {
        ...getThresholdRuleForAlertTesting(['auditbeat-*']),
        threshold: {
          field: ['host.id'],
          value: 700,
        },
      };
      const createdRule = await createRule(supertest, log, rule);
      const alerts = await getAlerts(supertest, log, es, createdRule);
      expect(alerts.hits.hits).toHaveLength(1);
      const fullAlert = alerts.hits.hits[0]._source;
      if (!fullAlert) {
        return expect(fullAlert).toBeTruthy();
      }
      const eventIds = (fullAlert?.[ALERT_ANCESTORS] as Ancestor[]).map((event) => event.id);
      expect(fullAlert).toEqual({
        ...fullAlert,
        'host.id': '8cc95778cce5407c809480e8e32ad76b',
        [EVENT_KIND]: 'signal',
        [ALERT_ANCESTORS]: [
          {
            depth: 0,
            id: eventIds[0],
            index: 'auditbeat-*',
            type: 'event',
          },
        ],
        [ALERT_WORKFLOW_STATUS]: 'open',
        [ALERT_REASON]: 'event created high alert Alert Testing Query.',
        [ALERT_RULE_UUID]: fullAlert[ALERT_RULE_UUID],
        [ALERT_ORIGINAL_TIME]: fullAlert[ALERT_ORIGINAL_TIME],
        [ALERT_DEPTH]: 1,
        [ALERT_THRESHOLD_RESULT]: {
          terms: [
            {
              field: 'host.id',
              value: '8cc95778cce5407c809480e8e32ad76b',
            },
          ],
          count: 788,
          from: '2019-02-19T07:12:05.332Z',
        },
      });
    });

    it('generates max alerts warning when circuit breaker is exceeded', async () => {
      const rule: ThresholdRuleCreateProps = {
        ...getThresholdRuleForAlertTesting(['auditbeat-*']),
        threshold: {
          field: 'host.id',
          value: 1, // This value generates 7 alerts with the current esArchive
        },
        max_signals: 5,
      };
      const { logs } = await previewRule({ supertest, rule });
      expect(logs[0].warnings).toContain(getMaxAlertsWarning());
    });

    it("doesn't generate max alerts warning when circuit breaker is met but not exceeded", async () => {
      const rule: ThresholdRuleCreateProps = {
        ...getThresholdRuleForAlertTesting(['auditbeat-*']),
        threshold: {
          field: 'host.id',
          value: 1, // This value generates 7 alerts with the current esArchive
        },
        max_signals: 8,
      };
      const { logs } = await previewRule({ supertest, rule });
      expect(logs[0].warnings).not.toContain(getMaxAlertsWarning());
    });

    it('generates alerts from Threshold rules when threshold is met and no field is defined', async () => {
      const rule: ThresholdRuleCreateProps = {
        ...getThresholdRuleForAlertTesting(['auditbeat-*']),
        threshold: {
          field: [],
          value: 100,
        },
      };
      const { previewId } = await previewRule({ supertest, rule });
      const previewAlerts = await getPreviewAlerts({ es, previewId });
      expect(previewAlerts.length).toEqual(1);
    });

    it('generates 2 alerts from Threshold rules when threshold is met', async () => {
      const rule: ThresholdRuleCreateProps = {
        ...getThresholdRuleForAlertTesting(['auditbeat-*']),
        threshold: {
          field: 'host.id',
          value: 100,
        },
      };
      const { previewId } = await previewRule({ supertest, rule });
      const previewAlerts = await getPreviewAlerts({ es, previewId });
      expect(previewAlerts.length).toEqual(2);
    });

    it('applies the provided query before bucketing ', async () => {
      const rule: ThresholdRuleCreateProps = {
        ...getThresholdRuleForAlertTesting(['auditbeat-*']),
        query: 'host.id:"2ab45fc1c41e4c84bbd02202a7e5761f"',
        threshold: {
          field: 'process.name',
          value: 21,
        },
      };
      const { previewId } = await previewRule({ supertest, rule });
      const previewAlerts = await getPreviewAlerts({ es, previewId });
      expect(previewAlerts.length).toEqual(1);
    });

    it('generates no alerts from Threshold rules when threshold is met and cardinality is not met', async () => {
      const rule: ThresholdRuleCreateProps = {
        ...getThresholdRuleForAlertTesting(['auditbeat-*']),
        threshold: {
          field: 'host.id',
          value: 100,
          cardinality: [
            {
              field: 'destination.ip',
              value: 100,
            },
          ],
        },
      };
      const { previewId } = await previewRule({ supertest, rule });
      const previewAlerts = await getPreviewAlerts({ es, previewId });
      expect(previewAlerts.length).toEqual(0);
    });

    it('generates no alerts from Threshold rules when cardinality is met and threshold is not met', async () => {
      const rule: ThresholdRuleCreateProps = {
        ...getThresholdRuleForAlertTesting(['auditbeat-*']),
        threshold: {
          field: 'host.id',
          value: 1000,
          cardinality: [
            {
              field: 'destination.ip',
              value: 5,
            },
          ],
        },
      };
      const { previewId } = await previewRule({ supertest, rule });
      const previewAlerts = await getPreviewAlerts({ es, previewId });
      expect(previewAlerts.length).toEqual(0);
    });

    it('generates alerts from Threshold rules when threshold and cardinality are both met', async () => {
      const rule: ThresholdRuleCreateProps = {
        ...getThresholdRuleForAlertTesting(['auditbeat-*']),
        threshold: {
          field: 'host.id',
          value: 100,
          cardinality: [
            {
              field: 'destination.ip',
              value: 5,
            },
          ],
        },
      };
      const { previewId } = await previewRule({ supertest, rule });
      const previewAlerts = await getPreviewAlerts({ es, previewId });
      expect(previewAlerts.length).toEqual(1);
      const fullAlert = previewAlerts[0]._source;
      if (!fullAlert) {
        return expect(fullAlert).toBeTruthy();
      }
      const eventIds = (fullAlert?.[ALERT_ANCESTORS] as Ancestor[]).map((event) => event.id);
      expect(fullAlert).toEqual({
        ...fullAlert,
        'host.id': '8cc95778cce5407c809480e8e32ad76b',
        [EVENT_KIND]: 'signal',
        [ALERT_ANCESTORS]: [
          {
            depth: 0,
            id: eventIds[0],
            index: 'auditbeat-*',
            type: 'event',
          },
        ],
        [ALERT_WORKFLOW_STATUS]: 'open',
        [ALERT_REASON]: `event created high alert Alert Testing Query.`,
        [ALERT_RULE_UUID]: fullAlert[ALERT_RULE_UUID],
        [ALERT_ORIGINAL_TIME]: fullAlert[ALERT_ORIGINAL_TIME],
        [ALERT_DEPTH]: 1,
        [ALERT_THRESHOLD_RESULT]: {
          terms: [
            {
              field: 'host.id',
              value: '8cc95778cce5407c809480e8e32ad76b',
            },
          ],
          cardinality: [
            {
              field: 'destination.ip',
              value: 7,
            },
          ],
          count: 788,
          from: '2019-02-19T07:12:05.332Z',
        },
      });
    });

    it('should not generate alerts if only one field meets the threshold requirement', async () => {
      const rule: ThresholdRuleCreateProps = {
        ...getThresholdRuleForAlertTesting(['auditbeat-*']),
        threshold: {
          field: ['host.id', 'process.name'],
          value: 22,
        },
      };
      const { previewId } = await previewRule({ supertest, rule });
      const previewAlerts = await getPreviewAlerts({ es, previewId });
      expect(previewAlerts.length).toEqual(0);
    });

    it('generates alerts from Threshold rules when bucketing by multiple fields', async () => {
      const rule: ThresholdRuleCreateProps = {
        ...getThresholdRuleForAlertTesting(['auditbeat-*']),
        threshold: {
          field: ['host.id', 'process.name', 'event.module'],
          value: 21,
        },
      };
      const { previewId } = await previewRule({ supertest, rule });
      const previewAlerts = await getPreviewAlerts({ es, previewId });
      expect(previewAlerts.length).toEqual(1);
      const fullAlert = previewAlerts[0]._source;
      if (!fullAlert) {
        return expect(fullAlert).toBeTruthy();
      }
      const eventIds = (fullAlert[ALERT_ANCESTORS] as Ancestor[]).map((event) => event.id);
      expect(fullAlert).toEqual({
        ...fullAlert,
        'event.module': 'system',
        'host.id': '2ab45fc1c41e4c84bbd02202a7e5761f',
        'process.name': 'sshd',
        [EVENT_KIND]: 'signal',
        [ALERT_ANCESTORS]: [
          {
            depth: 0,
            id: eventIds[0],
            index: 'auditbeat-*',
            type: 'event',
          },
        ],
        [ALERT_WORKFLOW_STATUS]: 'open',
        [ALERT_REASON]: `event with process sshd, created high alert Alert Testing Query.`,
        [ALERT_RULE_UUID]: fullAlert[ALERT_RULE_UUID],
        [ALERT_ORIGINAL_TIME]: fullAlert[ALERT_ORIGINAL_TIME],
        [ALERT_DEPTH]: 1,
        [ALERT_THRESHOLD_RESULT]: {
          terms: [
            {
              field: 'host.id',
              value: '2ab45fc1c41e4c84bbd02202a7e5761f',
            },
            {
              field: 'process.name',
              value: 'sshd',
            },
            {
              field: 'event.module',
              value: 'system',
            },
          ],
          count: 21,
          from: '2019-02-19T20:22:03.561Z',
        },
      });
    });

    // https://github.com/elastic/kibana/issues/149920
    it('generates 1 alert when threshold is met and rule query has wildcard in field name', async () => {
      const rule: ThresholdRuleCreateProps = {
        ...getThresholdRuleForAlertTesting(['auditbeat-*']),
        query: 'agent.ty*:auditbeat', // this query should match all documents from index and we will receive 1 alert, similarly to "generates 1 alert from Threshold rules when threshold is met" test case
        threshold: {
          field: ['host.id'],
          value: 700,
        },
      };
      const createdRule = await createRule(supertest, log, rule);
      const alerts = await getAlerts(supertest, log, es, createdRule);
      expect(alerts.hits.hits).toHaveLength(1);
    });

    describe('Timestamp override and fallback', () => {
      before(async () => {
        await esArchiver.load(
          'x-pack/solutions/security/test/fixtures/es_archives/security_solution/timestamp_fallback'
        );
      });

      after(async () => {
        await esArchiver.unload(
          'x-pack/solutions/security/test/fixtures/es_archives/security_solution/timestamp_fallback'
        );
      });

      it('applies timestamp override when using single field', async () => {
        const rule: ThresholdRuleCreateProps = {
          ...getThresholdRuleForAlertTesting(['timestamp-fallback-test']),
          threshold: {
            field: 'host.name',
            value: 1,
          },
          timestamp_override: 'event.ingested',
        };
        const { previewId } = await previewRule({ supertest, rule });
        const previewAlerts = await getPreviewAlerts({ es, previewId });
        expect(previewAlerts.length).toEqual(4);

        for (const hit of previewAlerts) {
          const originalTime = hit._source?.[ALERT_ORIGINAL_TIME];
          const hostName = hit._source?.['host.name'];
          if (hostName === 'host-1') {
            expect(originalTime).toEqual('2020-12-16T15:15:18.570Z');
          } else if (hostName === 'host-2') {
            expect(originalTime).toEqual('2020-12-16T15:16:18.570Z');
          } else if (hostName === 'host-3') {
            expect(originalTime).toEqual('2020-12-16T16:15:18.570Z');
          } else {
            expect(originalTime).toEqual('2020-12-16T16:16:18.570Z');
          }
        }
      });

      it('applies timestamp override when using multiple fields', async () => {
        const rule: ThresholdRuleCreateProps = {
          ...getThresholdRuleForAlertTesting(['timestamp-fallback-test']),
          threshold: {
            field: ['host.name', 'source.ip'],
            value: 1,
          },
          timestamp_override: 'event.ingested',
        };
        const { previewId } = await previewRule({ supertest, rule });
        const previewAlerts = await getPreviewAlerts({ es, previewId });
        expect(previewAlerts.length).toEqual(4);

        for (const hit of previewAlerts) {
          const originalTime = hit._source?.[ALERT_ORIGINAL_TIME];
          const hostName = hit._source?.['host.name'];
          if (hostName === 'host-1') {
            expect(originalTime).toEqual('2020-12-16T15:15:18.570Z');
          } else if (hostName === 'host-2') {
            expect(originalTime).toEqual('2020-12-16T15:16:18.570Z');
          } else if (hostName === 'host-3') {
            expect(originalTime).toEqual('2020-12-16T16:15:18.570Z');
          } else {
            expect(originalTime).toEqual('2020-12-16T16:16:18.570Z');
          }
        }
      });
    });

    describe('with host risk index', () => {
      before(async () => {
        // Threshold alerts aggregate by host.name and may not carry host.id in their source,
        // so the EUID is name-based (host:<host.name>). Omit host.id to ensure the entity EUID
        // matches what the detection engine computes from the threshold alert.
        await entityStoreV2.setup({
          hosts: [
            {
              host: { name: LONDON_HOST_NAME },
              entity: {
                id: `host:${LONDON_HOST_NAME}`,
                type: 'host',
                risk: { calculated_level: 'Low', calculated_score_norm: 20 },
              },
            },
            {
              host: { name: TORONTO_HOST_NAME },
              entity: {
                id: `host:${TORONTO_HOST_NAME}`,
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
        const rule: ThresholdRuleCreateProps = {
          ...getThresholdRuleForAlertTesting(['auditbeat-*']),
          threshold: {
            field: 'host.name',
            value: 100,
          },
        };
        const { previewId } = await previewRule({ supertest, rule });
        const previewAlerts = await getPreviewAlerts({ es, previewId, sort: ['host.name'] });

        expect(previewAlerts[0]?._source?.host?.risk?.calculated_level).toEqual('Low');
        expect(previewAlerts[0]?._source?.host?.risk?.calculated_score_norm).toEqual(20);
        expect(previewAlerts[1]?._source?.host?.risk?.calculated_level).toEqual('Critical');
        expect(previewAlerts[1]?._source?.host?.risk?.calculated_score_norm).toEqual(96);
      });
    });

    describe('with asset criticality', () => {
      before(async () => {
        // Only the first alert (sorted by host.name) is asserted on — suricata-sensor-london.
        // Use name-based EUID for the same reason as the risk index describe above.
        await entityStoreV2.setup({
          hosts: [
            {
              host: { name: LONDON_HOST_NAME },
              entity: { id: `host:${LONDON_HOST_NAME}`, type: 'host' },
              asset: { criticality: 'high_impact' },
            },
          ],
        });
      });

      after(async () => {
        await entityStoreV2.teardown();
      });

      it('should be enriched alert with criticality_level', async () => {
        const rule: ThresholdRuleCreateProps = {
          ...getThresholdRuleForAlertTesting(['auditbeat-*']),
          threshold: {
            field: 'host.name',
            value: 100,
          },
        };
        const { previewId } = await previewRule({ supertest, rule });
        const previewAlerts = await getPreviewAlerts({ es, previewId, sort: ['host.name'] });
        const fullAlert = previewAlerts[0]?._source;

        expect(fullAlert?.['host.asset.criticality']).toEqual('high_impact');
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

      after(async () => {
        await deleteAllAlerts(supertest, log, es);
        await deleteAllRules(supertest, log);
      });

      const { indexListOfDocuments } = dataGeneratorFactory({
        es,
        index: 'ecs_compliant',
        log,
      });

      const createEvent = ({
        id,
        timestamp,
        name = 'agent-1',
      }: {
        id: string;
        timestamp: string;
        name?: string;
      }) => ({
        id,
        '@timestamp': timestamp,
        agent: {
          name,
        },
        host: {
          name: 'host-1',
        },
      });

      it('alerts when run on a time range that the rule has not previously seen, and deduplicates if run there more than once', async () => {
        const id = uuidv4();
        const firstTimestamp = moment(new Date()).subtract(3, 'h');
        const secondTimestamp = moment(new Date()).subtract(1, 'm');

        await indexListOfDocuments([
          createEvent({ id, timestamp: firstTimestamp.toISOString() }),
          createEvent({ id, timestamp: firstTimestamp.subtract(1, 'm').toISOString() }),
          createEvent({ id, timestamp: secondTimestamp.toISOString() }),
          createEvent({ id, timestamp: secondTimestamp.subtract(5, 'm').toISOString() }),
        ]);

        const rule: ThresholdRuleCreateProps = {
          ...getThresholdRuleForAlertTesting(['ecs_compliant']),
          threshold: {
            field: ['agent.name'],
            value: 2,
          },
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
        const firstTimestamp = moment(new Date()).subtract(1, 'm');

        await indexListOfDocuments([
          createEvent({ id, timestamp: firstTimestamp.toISOString() }),
          createEvent({ id, timestamp: firstTimestamp.subtract(1, 'm').toISOString() }),
        ]);

        const rule: ThresholdRuleCreateProps = {
          ...getThresholdRuleForAlertTesting(['ecs_compliant']),
          threshold: {
            field: ['agent.name'],
            value: 2,
          },
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

      it('should run rule in the past and generate duplicate alert', async () => {
        const id = uuidv4();
        const firstTimestamp = moment(new Date()).subtract(20, 'm');

        await indexListOfDocuments([
          createEvent({ id, timestamp: firstTimestamp.toISOString() }),
          createEvent({ id, timestamp: moment(firstTimestamp).subtract(1, 'm').toISOString() }),
          createEvent({ id, timestamp: moment(firstTimestamp).subtract(40, 'm').toISOString() }),
        ]);

        const rule: ThresholdRuleCreateProps = {
          ...getThresholdRuleForAlertTesting(['ecs_compliant']),
          threshold: {
            field: ['agent.name'],
            value: 2,
          },
          from: 'now-180m',
          interval: '30m',
        };

        const createdRule = await createRule(supertest, log, rule);
        const alerts = await getAlerts(supertest, log, es, createdRule);

        expect(alerts.hits.hits).toHaveLength(1);

        const backfill = await scheduleRuleRun(supertest, [createdRule.id], {
          startDate: moment(firstTimestamp).subtract(45, 'm'),
          endDate: moment(firstTimestamp).add(1, 'm'),
        });

        await waitForBackfillExecuted(backfill, [createdRule.id], { supertest, log });
        const allNewAlerts = await getAlerts(supertest, log, es, createdRule);
        expect(allNewAlerts.hits.hits).toHaveLength(2);
      });

      it('supression with time window should work for manual rule runs and update alert', async () => {
        const id = uuidv4();
        const firstTimestamp = moment(new Date()).subtract(3, 'h');

        await indexListOfDocuments([
          createEvent({ id, timestamp: firstTimestamp.toISOString() }),
          createEvent({ id, timestamp: moment(firstTimestamp).subtract(1, 'm').toISOString() }),
        ]);

        const rule: ThresholdRuleCreateProps = {
          ...getThresholdRuleForAlertTesting(['ecs_compliant']),
          threshold: {
            field: ['agent.name'],
            value: 2,
          },
          from: 'now-35m',
          interval: '30m',
          alert_suppression: {
            duration: {
              value: 5,
              unit: 'h',
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

        await indexListOfDocuments([
          createEvent({ id, timestamp: moment(firstTimestamp).add(41, 'm').toISOString() }),
          createEvent({ id, timestamp: moment(firstTimestamp).add(42, 'm').toISOString() }),
        ]);

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
      const rule: ThresholdRuleCreateProps = {
        ...getThresholdRuleForAlertTesting(['auditbeat-*']),
        threshold: {
          field: 'host.id',
          value: 100,
        },
      };

      it('should not return requests property when not enabled', async () => {
        const { logs } = await previewRule({
          supertest,
          rule,
        });

        expect(logs[0].requests).toEqual(undefined);
      });
      it('should return requests property when enable_logged_requests set to true', async () => {
        const { logs } = await previewRule({
          supertest,
          rule,
          enableLoggedRequests: true,
        });

        const requests = logs[0].requests;

        expect(requests).toHaveLength(2);
        expect(requests![0].description).toBe('Find all terms that exceeds threshold value');

        const requestWithoutSpaces = requests![0].request?.replace(/\s/g, '');
        expect(requestWithoutSpaces).toContain(
          `aggregations":{"thresholdTerms":{"composite":{"sources":[{"host.id":{"terms":{"field":"host.id"}}}],"size":10000},"aggs":{"max_timestamp":{"max":{"field":"@timestamp"}},"min_timestamp":{"min":{"field":"@timestamp"}},"count_check":{"bucket_selector":{"buckets_path":{"docCount":"_count"},"script":"params.docCount>=100"}}}}`
        );
        expect(requests![0].request).toContain('POST /auditbeat-*/_search?allow_no_indices=true');
        expect(requests![0].request_type).toBe('findThresholdBuckets');
        expect(requests![1].description).toBe(
          'Find all terms that exceeds threshold value after host.id: f9c7ca2d33f548a8b37667f6fffc59ce'
        );
      });
    });

    describe('with data stream namespace filter', () => {
      const { indexListOfDocuments } = dataGeneratorFactory({
        es,
        index: 'ecs_compliant',
        log,
      });

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
          host: { id: 'host-1' },
        };
        const docNamespace2 = {
          id,
          '@timestamp': timestamp,
          data_stream: { namespace: 'namespace2' },
          host: { id: 'host-2' },
        };
        const docNamespace3 = {
          id,
          '@timestamp': timestamp,
          data_stream: { namespace: 'namespace3' },
          host: { id: 'host-3' },
        };

        await indexListOfDocuments([
          docNamespace1,
          docNamespace1,
          docNamespace2,
          docNamespace2,
          docNamespace3,
          docNamespace3,
        ]);

        // Set UI setting to include only namespace1 and namespace2
        await setAdvancedSettings(supertest, {
          [INCLUDED_DATA_STREAM_NAMESPACES_FOR_RULE_EXECUTION]: ['namespace1', 'namespace2'],
        });

        const rule: ThresholdRuleCreateProps = {
          ...getThresholdRuleForAlertTesting(['ecs_compliant']),
          threshold: {
            field: ['host.id'],
            value: 1,
          },
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
        const hostIds = previewAlerts.map((alert) => alert._source['host.id']);
        expect(hostIds).toContain('host-1');
        expect(hostIds).toContain('host-2');
        expect(hostIds).not.toContain('host-3');
      });
    });
  });
};
