/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import { unset } from 'lodash';
import {
  ALERT_ACTION_GROUP,
  ALERT_DURATION,
  ALERT_FLAPPING,
  ALERT_FLAPPING_HISTORY,
  ALERT_INSTANCE_ID,
  ALERT_SEVERITY_IMPROVING,
  ALERT_MAINTENANCE_WINDOW_IDS,
  ALERT_MAINTENANCE_WINDOW_NAMES,
  ALERT_REASON,
  ALERT_RULE_CATEGORY,
  ALERT_RULE_CONSUMER,
  ALERT_RULE_EXECUTION_UUID,
  ALERT_RULE_NAME,
  ALERT_RULE_PARAMETERS,
  ALERT_RULE_PRODUCER,
  ALERT_RULE_REVISION,
  ALERT_RULE_TAGS,
  ALERT_RULE_TYPE_ID,
  ALERT_RULE_UUID,
  ALERT_START,
  ALERT_STATUS,
  ALERT_TIME_RANGE,
  ALERT_URL,
  ALERT_UUID,
  ALERT_WORKFLOW_STATUS,
  EVENT_ACTION,
  EVENT_KIND,
  SPACE_IDS,
  TAGS,
  VERSION,
  ALERT_CONSECUTIVE_MATCHES,
  ALERT_RULE_EXECUTION_TIMESTAMP,
  ALERT_PREVIOUS_ACTION_GROUP,
  ALERT_PENDING_RECOVERED_COUNT,
  ALERT_STATE_NAMESPACE,
  ALERT_MUTED,
  ALERT_SNOOZED,
} from '@kbn/rule-data-utils';
import type { FtrProviderContext } from '../../ftr_provider_context';
import { ObjectRemover } from './object_remover';
import type { RoleCredentials } from '../../../shared/services';

const OPEN_OR_ACTIVE = new Set(['open', 'active']);

export default function ({ getService }: FtrProviderContext) {
  const svlUserManager = getService('svlUserManager');
  let roleAdmin: RoleCredentials;
  const supertest = getService('supertest');
  const esClient = getService('es');
  const objectRemover = new ObjectRemover(supertest);
  const alertingApi = getService('alertingApi');

  describe('Alert documents', function () {
    // Timeout of 360000ms exceeded
    this.tags(['failsOnMKI']);
    const RULE_TYPE_ID = '.es-query';
    const ALERT_INDEX = '.alerts-stack.alerts-default';
    let ruleId: string;

    before(async () => {
      roleAdmin = await svlUserManager.createM2mApiKeyWithRoleScope('admin');
    });

    afterEach(async () => {
      await objectRemover.removeAll();
    });

    after(async () => {
      await svlUserManager.invalidateM2mApiKeyWithRoleScope(roleAdmin);
    });

    it('should generate an alert document for an active alert', async () => {
      const createdRule = await alertingApi.helpers.createEsQueryRule({
        roleAuthc: roleAdmin,
        consumer: 'alerts',
        name: 'always fire',
        ruleTypeId: RULE_TYPE_ID,
        params: {
          size: 100,
          thresholdComparator: '>',
          threshold: [-1],
          index: ['alert-test-data'],
          timeField: 'date',
          esQuery: JSON.stringify({ query: { match_all: {} } }),
          timeWindowSize: 20,
          timeWindowUnit: 's',
        },
      });
      ruleId = createdRule.id;
      objectRemover.add('default', ruleId, 'rule', 'alerting');

      // get the first alert document written
      const testStart1 = new Date();
      await alertingApi.helpers.waitForNumRuleRuns({
        roleAuthc: roleAdmin,
        numOfRuns: 1,
        ruleId,
        esClient,
        testStart: testStart1,
      });

      const alResp1 = await alertingApi.helpers.waitForAlertInIndex({
        esClient,
        filter: testStart1,
        indexName: ALERT_INDEX,
        ruleId,
        num: 1,
      });

      const hits1 = alResp1.hits.hits[0]._source as Record<string, any>;

      expect(new Date(hits1['@timestamp'])).to.be.a(Date);
      // should be open, first time, but also seen sometimes active; timing?
      expect(OPEN_OR_ACTIVE.has(hits1[EVENT_ACTION])).to.be(true);
      expect(hits1[ALERT_FLAPPING_HISTORY]).to.be.an(Array);
      expect(hits1[ALERT_MAINTENANCE_WINDOW_IDS]).to.be.an(Array);
      expect(hits1[ALERT_MAINTENANCE_WINDOW_NAMES]).to.be.an(Array);
      expect(typeof hits1[ALERT_REASON]).to.be('string');
      expect(typeof hits1[ALERT_RULE_EXECUTION_UUID]).to.be('string');
      expect(typeof hits1[ALERT_RULE_EXECUTION_TIMESTAMP]).to.be('string');
      expect(typeof hits1[ALERT_DURATION]).to.be('number');
      expect(new Date(hits1[ALERT_START])).to.be.a(Date);
      expect(typeof hits1[ALERT_TIME_RANGE]).to.be('object');
      expect(typeof hits1[ALERT_UUID]).to.be('string');
      expect(typeof hits1[ALERT_URL]).to.be('string');
      expect(typeof hits1[VERSION]).to.be('string');
      expect(typeof hits1[ALERT_CONSECUTIVE_MATCHES]).to.be('number');
      expect(hits1[ALERT_RULE_EXECUTION_TIMESTAMP]).to.eql(hits1['@timestamp']);
      expect(new Date(hits1[ALERT_STATE_NAMESPACE].dateEnd)).to.be.a(Date);
      expect(new Date(hits1[ALERT_STATE_NAMESPACE].dateStart)).to.be.a(Date);

      // remove fields we aren't going to compare directly
      const fields = [
        '@timestamp',
        'event.action',
        'kibana.alert.duration.us',
        'kibana.alert.flapping_history',
        'kibana.alert.maintenance_window_ids',
        'kibana.alert.maintenance_window_names',
        'kibana.alert.reason',
        'kibana.alert.rule.execution.uuid',
        'kibana.alert.rule.execution.timestamp',
        'kibana.alert.rule.duration',
        'kibana.alert.start',
        'kibana.alert.time_range',
        'kibana.alert.uuid',
        'kibana.alert.url',
        'kibana.version',
        'kibana.alert.consecutive_matches',
        'kibana.alert.severity_improving',
        'kibana.alert.previous_action_group',
        'kibana.alert.state',
      ];

      for (const field of fields) {
        unset(hits1, field);
      }

      const expected = {
        [EVENT_KIND]: 'signal',
        [TAGS]: [],
        [SPACE_IDS]: ['default'],
        ['kibana.alert.title']: "rule 'always fire' matched query",
        ['kibana.alert.evaluation.conditions']: 'Number of matching documents is greater than -1',
        ['kibana.alert.evaluation.threshold']: -1,
        ['kibana.alert.evaluation.value']: '0',
        [ALERT_ACTION_GROUP]: 'query matched',
        [ALERT_FLAPPING]: false,
        [ALERT_MUTED]: false,
        [ALERT_SNOOZED]: false,
        [ALERT_INSTANCE_ID]: 'query matched',
        [ALERT_STATUS]: 'active',
        [ALERT_WORKFLOW_STATUS]: 'open',
        [ALERT_RULE_CATEGORY]: 'Elasticsearch query',
        [ALERT_RULE_CONSUMER]: 'alerts',
        [ALERT_RULE_NAME]: 'always fire',
        [ALERT_RULE_PARAMETERS]: {
          size: 100,
          thresholdComparator: '>',
          threshold: [-1],
          index: ['alert-test-data'],
          timeField: 'date',
          esQuery: '{"query":{"match_all":{}}}',
          timeWindowSize: 20,
          timeWindowUnit: 's',
          excludeHitsFromPreviousRun: true,
          aggType: 'count',
          groupBy: 'all',
          searchType: 'esQuery',
        },
        [ALERT_RULE_PRODUCER]: hits1[ALERT_RULE_PRODUCER],
        [ALERT_RULE_REVISION]: 0,
        [ALERT_RULE_TYPE_ID]: '.es-query',
        [ALERT_RULE_TAGS]: [],
        [ALERT_RULE_UUID]: ruleId,
        [ALERT_PENDING_RECOVERED_COUNT]: 0,
      };

      expect(hits1).to.eql(expected);
    });

    it('should update an alert document for an ongoing alert', async () => {
      const createdRule = await alertingApi.helpers.createEsQueryRule({
        roleAuthc: roleAdmin,
        consumer: 'alerts',
        name: 'always fire',
        ruleTypeId: RULE_TYPE_ID,
        params: {
          size: 100,
          thresholdComparator: '>',
          threshold: [-1],
          index: ['alert-test-data'],
          timeField: 'date',
          esQuery: JSON.stringify({ query: { match_all: {} } }),
          timeWindowSize: 20,
          timeWindowUnit: 's',
        },
      });
      ruleId = createdRule.id;
      objectRemover.add('default', ruleId, 'rule', 'alerting');

      // get the first alert document written
      const testStart1 = new Date();
      await alertingApi.helpers.waitForNumRuleRuns({
        roleAuthc: roleAdmin,
        numOfRuns: 1,
        ruleId,
        esClient,
        testStart: testStart1,
      });

      const alResp1 = await alertingApi.helpers.waitForAlertInIndex({
        esClient,
        filter: testStart1,
        indexName: ALERT_INDEX,
        ruleId,
        num: 1,
      });

      // wait for another run, get the updated alert document
      const testStart2 = new Date();
      await alertingApi.helpers.waitForNumRuleRuns({
        roleAuthc: roleAdmin,
        numOfRuns: 1,
        ruleId,
        esClient,
        testStart: testStart2,
      });

      const alResp2 = await alertingApi.helpers.waitForAlertInIndex({
        esClient,
        filter: testStart2,
        indexName: ALERT_INDEX,
        ruleId,
        num: 1,
      });

      // check for differences we can check and expect
      const hits1 = alResp1.hits.hits[0]._source as Record<string, any>;
      const hits2 = alResp2.hits.hits[0]._source as Record<string, any>;

      expect(hits2['@timestamp']).to.be.greaterThan(hits1['@timestamp']);
      expect(OPEN_OR_ACTIVE.has(hits1[EVENT_ACTION])).to.be(true);
      expect(hits2[EVENT_ACTION]).to.be('active');
      expect(hits1[ALERT_DURATION]).to.not.be.lessThan(0);
      expect(hits2[ALERT_DURATION]).not.to.be(0);
      expect(hits2[ALERT_RULE_EXECUTION_TIMESTAMP]).to.eql(hits2['@timestamp']);
      expect(hits2[ALERT_CONSECUTIVE_MATCHES]).to.be.greaterThan(hits1[ALERT_CONSECUTIVE_MATCHES]);
      expect(hits2[ALERT_PREVIOUS_ACTION_GROUP]).to.be('query matched');
      expect(hits2[ALERT_SEVERITY_IMPROVING]).to.be(undefined);
      expect(new Date(hits1[ALERT_STATE_NAMESPACE].dateEnd)).to.be.a(Date);
      expect(new Date(hits1[ALERT_STATE_NAMESPACE].dateStart)).to.be.a(Date);

      // remove fields we know will be different
      const fields = [
        '@timestamp',
        'event.action',
        'kibana.alert.duration.us',
        'kibana.alert.flapping_history',
        'kibana.alert.reason',
        'kibana.alert.rule.execution.uuid',
        'kibana.alert.rule.execution.timestamp',
        'kibana.alert.consecutive_matches',
        'kibana.alert.severity_improving',
        'kibana.alert.previous_action_group',
        'kibana.alert.url',
        'kibana.alert.state',
      ];

      for (const field of fields) {
        unset(hits1, field);
        unset(hits2, field);
      }

      expect(hits1).to.eql(hits2);
    });
  });
}
