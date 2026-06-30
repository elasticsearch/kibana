/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import {
  EVENT_KIND,
  ALERT_ACTION_GROUP,
  ALERT_FLAPPING,
  ALERT_INSTANCE_ID,
  ALERT_SEVERITY_IMPROVING,
  ALERT_RULE_CATEGORY,
  ALERT_RULE_CONSUMER,
  ALERT_RULE_NAME,
  ALERT_RULE_PARAMETERS,
  ALERT_RULE_PRODUCER,
  ALERT_RULE_REVISION,
  ALERT_RULE_TYPE_ID,
  ALERT_RULE_TAGS,
  ALERT_RULE_UUID,
  ALERT_STATUS,
  ALERT_WORKFLOW_STATUS,
  SPACE_IDS,
  TAGS,
  ALERT_PREVIOUS_ACTION_GROUP,
  ALERT_PENDING_RECOVERED_COUNT,
  ALERT_MUTED,
  ALERT_SNOOZED,
} from '@kbn/rule-data-utils';
import { omit, padStart } from 'lodash';
import type { FtrProviderContext } from '../../ftr_provider_context';
import type { RoleCredentials } from '../../../shared/services';

export default function ({ getService }: FtrProviderContext) {
  const supertest = getService('supertest');
  const esClient = getService('es');
  const esDeleteAllIndices = getService('esDeleteAllIndices');
  const svlUserManager = getService('svlUserManager');
  const alertingApi = getService('alertingApi');
  let roleAdmin: RoleCredentials;

  describe('Summary actions', function () {
    const RULE_TYPE_ID = '.es-query';
    const ALERT_ACTION_INDEX = 'alert-action-es-query';
    const ALERT_INDEX = '.alerts-stack.alerts-default';
    let connectorId: string;
    let ruleId: string;
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
      'kibana.alert.state',
    ];

    before(async () => {
      roleAdmin = await svlUserManager.createM2mApiKeyWithRoleScope('admin');
    });

    afterEach(async () => {
      await supertest
        .delete(`/api/actions/connector/${connectorId}`)
        .set('kbn-xsrf', 'foo')
        .set('x-elastic-internal-origin', 'foo')
        .expect(204);
      await supertest
        .delete(`/api/alerting/rule/${ruleId}`)
        .set('kbn-xsrf', 'foo')
        .set('x-elastic-internal-origin', 'foo')
        .expect(204);
      await esDeleteAllIndices([ALERT_ACTION_INDEX]);
    });

    after(async () => {
      await svlUserManager.invalidateM2mApiKeyWithRoleScope(roleAdmin);
    });

    it('should schedule actions for summary of alerts per rule run', async () => {
      const testStart = new Date();
      const createdConnector = await alertingApi.helpers.createIndexConnector({
        roleAuthc: roleAdmin,
        name: 'Index Connector: Alerting API test',
        indexName: ALERT_ACTION_INDEX,
      });
      connectorId = createdConnector.id;

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
          esQuery: `{\n  \"query\":{\n    \"match_all\" : {}\n  }\n}`,
          timeWindowSize: 20,
          timeWindowUnit: 's',
        },
        actions: [
          {
            group: 'query matched',
            id: connectorId,
            params: {
              documents: [
                {
                  all: '{{alerts.all.count}}',
                  new: '{{alerts.new.count}}',
                  newIds: '[{{#alerts.new.data}}{{kibana.alert.instance.id}},{{/alerts.new.data}}]',
                  ongoing: '{{alerts.ongoing.count}}',
                  ongoingIds:
                    '[{{#alerts.ongoing.data}}{{kibana.alert.instance.id}},{{/alerts.ongoing.data}}]',
                  recovered: '{{alerts.recovered.count}}',
                  recoveredIds:
                    '[{{#alerts.recovered.data}}{{kibana.alert.instance.id}},{{/alerts.recovered.data}}]',
                  date: '{{date}}',
                  ruleId: '{{rule.id}}',
                },
              ],
            },
            frequency: {
              notify_when: 'onActiveAlert',
              throttle: null,
              summary: true,
            },
            alerts_filter: {
              query: { kql: 'kibana.alert.rule.name:always fire', filters: [] },
            },
          },
        ],
      });
      ruleId = createdRule.id;

      const resp = await alertingApi.helpers.waitForDocumentInIndex({
        esClient,
        indexName: ALERT_ACTION_INDEX,
        ruleId,
        retryOptions: {
          retryCount: 20,
          retryDelay: 15_000,
        },
      });
      expect(resp.hits.hits.length).to.be(1);

      const resp2 = await alertingApi.helpers.waitForAlertInIndex({
        esClient,
        filter: testStart,
        indexName: ALERT_INDEX,
        ruleId,
        num: 1,
        retryOptions: {
          retryCount: 20,
          retryDelay: 15_000,
        },
      });
      expect(resp2.hits.hits.length).to.be(1);

      const document = resp.hits.hits[0];
      expect(omit(document, '_source.date')._source).to.eql({
        all: '1',
        new: '1',
        newIds: '[query matched,]',
        ongoing: '0',
        ongoingIds: '[]',
        recovered: '0',
        recoveredIds: '[]',
        ruleId,
      });

      const alertDocument = resp2.hits.hits[0]._source as Record<string, any>;
      expect(omit(alertDocument, fields)).to.eql({
        [EVENT_KIND]: 'signal',
        ['kibana.alert.title']: "rule 'always fire' matched query",
        ['kibana.alert.evaluation.conditions']: 'Number of matching documents is greater than -1',
        ['kibana.alert.evaluation.threshold']: -1,
        ['kibana.alert.evaluation.value']: '0',
        [ALERT_ACTION_GROUP]: 'query matched',
        [ALERT_FLAPPING]: false,
        [ALERT_MUTED]: false,
        [ALERT_INSTANCE_ID]: 'query matched',
        [ALERT_SEVERITY_IMPROVING]: false,
        [ALERT_SNOOZED]: false,
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
          esQuery: '{\n  "query":{\n    "match_all" : {}\n  }\n}',
          timeWindowSize: 20,
          timeWindowUnit: 's',
          excludeHitsFromPreviousRun: true,
          aggType: 'count',
          groupBy: 'all',
          searchType: 'esQuery',
        },
        [ALERT_RULE_PRODUCER]: alertDocument[ALERT_RULE_PRODUCER],
        [ALERT_RULE_REVISION]: 0,
        [ALERT_RULE_TYPE_ID]: '.es-query',
        [ALERT_RULE_TAGS]: [],
        [ALERT_RULE_UUID]: ruleId,
        [SPACE_IDS]: ['default'],
        [TAGS]: [],
        [ALERT_PENDING_RECOVERED_COUNT]: 0,
      });
    });

    it('should filter alerts by kql', async () => {
      const testStart = new Date();
      const createdConnector = await alertingApi.helpers.createIndexConnector({
        roleAuthc: roleAdmin,
        name: 'Index Connector: Alerting API test',
        indexName: ALERT_ACTION_INDEX,
      });
      connectorId = createdConnector.id;

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
          esQuery: `{\n  \"query\":{\n    \"match_all\" : {}\n  }\n}`,
          timeWindowSize: 20,
          timeWindowUnit: 's',
        },
        actions: [
          {
            group: 'query matched',
            id: connectorId,
            params: {
              documents: [
                {
                  all: '{{alerts.all.count}}',
                  new: '{{alerts.new.count}}',
                  newIds: '[{{#alerts.new.data}}{{kibana.alert.instance.id}},{{/alerts.new.data}}]',
                  ongoing: '{{alerts.ongoing.count}}',
                  ongoingIds:
                    '[{{#alerts.ongoing.data}}{{kibana.alert.instance.id}},{{/alerts.ongoing.data}}]',
                  recovered: '{{alerts.recovered.count}}',
                  recoveredIds:
                    '[{{#alerts.recovered.data}}{{kibana.alert.instance.id}},{{/alerts.recovered.data}}]',
                  date: '{{date}}',
                  ruleId: '{{rule.id}}',
                },
              ],
            },
            frequency: {
              notify_when: 'onActiveAlert',
              throttle: null,
              summary: true,
            },
            alerts_filter: {
              query: { kql: 'kibana.alert.instance.id:query matched', filters: [] },
            },
          },
        ],
      });
      ruleId = createdRule.id;

      const resp = await alertingApi.helpers.waitForDocumentInIndex({
        esClient,
        indexName: ALERT_ACTION_INDEX,
        ruleId,
        retryOptions: {
          retryCount: 20,
          retryDelay: 15_000,
        },
      });
      expect(resp.hits.hits.length).to.be(1);

      const resp2 = await alertingApi.helpers.waitForAlertInIndex({
        esClient,
        filter: testStart,
        indexName: ALERT_INDEX,
        ruleId,
        num: 1,
        retryOptions: {
          retryCount: 20,
          retryDelay: 15_000,
        },
      });
      expect(resp2.hits.hits.length).to.be(1);

      const document = resp.hits.hits[0];
      expect(omit(document, '_source.date')._source).to.eql({
        all: '1',
        new: '1',
        newIds: '[query matched,]',
        ongoing: '0',
        ongoingIds: '[]',
        recovered: '0',
        recoveredIds: '[]',
        ruleId,
      });

      const alertDocument = resp2.hits.hits[0]._source as Record<string, any>;
      expect(omit(alertDocument, fields)).to.eql({
        [EVENT_KIND]: 'signal',
        ['kibana.alert.title']: "rule 'always fire' matched query",
        ['kibana.alert.evaluation.conditions']: 'Number of matching documents is greater than -1',
        ['kibana.alert.evaluation.threshold']: -1,
        ['kibana.alert.evaluation.value']: '0',
        [ALERT_ACTION_GROUP]: 'query matched',
        [ALERT_FLAPPING]: false,
        [ALERT_MUTED]: false,
        [ALERT_INSTANCE_ID]: 'query matched',
        [ALERT_SEVERITY_IMPROVING]: false,
        [ALERT_SNOOZED]: false,
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
          esQuery: '{\n  "query":{\n    "match_all" : {}\n  }\n}',
          timeWindowSize: 20,
          timeWindowUnit: 's',
          excludeHitsFromPreviousRun: true,
          aggType: 'count',
          groupBy: 'all',
          searchType: 'esQuery',
        },
        [ALERT_RULE_PRODUCER]: alertDocument[ALERT_RULE_PRODUCER],
        [ALERT_RULE_REVISION]: 0,
        [ALERT_RULE_TYPE_ID]: '.es-query',
        [ALERT_RULE_TAGS]: [],
        [ALERT_RULE_UUID]: ruleId,
        [SPACE_IDS]: ['default'],
        [TAGS]: [],
        [ALERT_PENDING_RECOVERED_COUNT]: 0,
      });
    });

    it('should filter alerts by hours', async () => {
      const now = new Date();
      now.setHours(now.getHours() + 1);
      const hour = padStart(now.getUTCHours().toString(), 2, '0');
      const minutes = padStart(now.getUTCMinutes().toString(), 2, '0');

      const start = `${hour}:${minutes}`;
      const end = `${hour}:${minutes}`;

      await alertingApi.helpers.waiting.createIndex({ esClient, indexName: ALERT_ACTION_INDEX });

      const createdConnector = await alertingApi.helpers.createIndexConnector({
        roleAuthc: roleAdmin,
        name: 'Index Connector: Alerting API test',
        indexName: ALERT_ACTION_INDEX,
      });
      connectorId = createdConnector.id;

      const createdRule = await alertingApi.helpers.createEsQueryRule({
        roleAuthc: roleAdmin,
        consumer: 'alerts',
        name: 'always fire',
        ruleTypeId: RULE_TYPE_ID,
        schedule: { interval: '1m' },
        params: {
          size: 100,
          thresholdComparator: '>',
          threshold: [-1],
          index: ['alert-test-data'],
          timeField: 'date',
          esQuery: `{\n  \"query\":{\n    \"match_all\" : {}\n  }\n}`,
          timeWindowSize: 20,
          timeWindowUnit: 's',
        },
        actions: [
          {
            group: 'query matched',
            id: connectorId,
            params: {
              documents: [
                {
                  all: '{{alerts.all.count}}',
                  new: '{{alerts.new.count}}',
                  newIds: '[{{#alerts.new.data}}{{kibana.alert.instance.id}},{{/alerts.new.data}}]',
                  ongoing: '{{alerts.ongoing.count}}',
                  ongoingIds:
                    '[{{#alerts.ongoing.data}}{{kibana.alert.instance.id}},{{/alerts.ongoing.data}}]',
                  recovered: '{{alerts.recovered.count}}',
                  recoveredIds:
                    '[{{#alerts.recovered.data}}{{kibana.alert.instance.id}},{{/alerts.recovered.data}}]',
                  date: '{{date}}',
                  ruleId: '{{rule.id}}',
                },
              ],
            },
            frequency: {
              notify_when: 'onActiveAlert',
              throttle: null,
              summary: true,
            },
            alerts_filter: {
              timeframe: {
                days: [1, 2, 3, 4, 5, 6, 7],
                timezone: 'UTC',
                hours: { start, end },
              },
            },
          },
        ],
      });
      ruleId = createdRule.id;

      // Should not have executed any action
      const resp = await alertingApi.helpers.waiting.getDocumentsInIndex({
        esClient,
        indexName: ALERT_ACTION_INDEX,
        ruleId,
      });
      expect(resp.hits.hits.length).to.be(0);
    });

    it('should schedule actions for summary of alerts on a custom interval', async () => {
      const testStart = new Date();
      const createdConnector = await alertingApi.helpers.createIndexConnector({
        roleAuthc: roleAdmin,
        name: 'Index Connector: Alerting API test',
        indexName: ALERT_ACTION_INDEX,
      });
      connectorId = createdConnector.id;

      const createdRule = await alertingApi.helpers.createEsQueryRule({
        roleAuthc: roleAdmin,
        consumer: 'alerts',
        name: 'always fire',
        ruleTypeId: RULE_TYPE_ID,
        schedule: { interval: '1m' },
        params: {
          size: 100,
          thresholdComparator: '>',
          threshold: [-1],
          index: ['alert-test-data'],
          timeField: 'date',
          esQuery: `{\n  \"query\":{\n    \"match_all\" : {}\n  }\n}`,
          timeWindowSize: 20,
          timeWindowUnit: 's',
        },
        actions: [
          {
            group: 'query matched',
            id: connectorId,
            params: {
              documents: [
                {
                  all: '{{alerts.all.count}}',
                  new: '{{alerts.new.count}}',
                  newIds: '[{{#alerts.new.data}}{{kibana.alert.instance.id}},{{/alerts.new.data}}]',
                  ongoing: '{{alerts.ongoing.count}}',
                  ongoingIds:
                    '[{{#alerts.ongoing.data}}{{kibana.alert.instance.id}},{{/alerts.ongoing.data}}]',
                  recovered: '{{alerts.recovered.count}}',
                  recoveredIds:
                    '[{{#alerts.recovered.data}}{{kibana.alert.instance.id}},{{/alerts.recovered.data}}]',
                  date: '{{date}}',
                  ruleId: '{{rule.id}}',
                },
              ],
            },
            frequency: {
              notify_when: 'onThrottleInterval',
              throttle: '1m',
              summary: true,
            },
          },
        ],
      });
      ruleId = createdRule.id;

      const resp = await alertingApi.helpers.waitForDocumentInIndexForTime({
        esClient,
        indexName: ALERT_ACTION_INDEX,
        ruleId,
        num: 2,
        sort: 'asc',
        timeout: 180_000,
      });

      const resp2 = await alertingApi.helpers.waitForAlertInIndex({
        esClient,
        filter: testStart,
        indexName: ALERT_INDEX,
        ruleId,
        num: 1,
        retryOptions: {
          retryCount: 20,
          retryDelay: 15_000,
        },
      });
      expect(resp2.hits.hits.length).to.be(1);

      const document = resp.hits.hits[0];
      expect(omit(document, '_source.date')._source).to.eql({
        all: '1',
        new: '1',
        newIds: '[query matched,]',
        ongoing: '0',
        ongoingIds: '[]',
        recovered: '0',
        recoveredIds: '[]',
        ruleId,
      });

      const document1 = resp.hits.hits[1];
      expect(omit(document1, '_source.date')._source).to.eql({
        all: '1',
        new: '0',
        newIds: '[]',
        ongoing: '1',
        ongoingIds: '[query matched,]',
        recovered: '0',
        recoveredIds: '[]',
        ruleId,
      });

      const alertDocument = resp2.hits.hits[0]._source as Record<string, any>;
      expect(omit(alertDocument, fields)).to.eql({
        [EVENT_KIND]: 'signal',
        ['kibana.alert.title']: "rule 'always fire' matched query",
        ['kibana.alert.evaluation.conditions']: 'Number of matching documents is greater than -1',
        ['kibana.alert.evaluation.threshold']: -1,
        ['kibana.alert.evaluation.value']: '0',
        [ALERT_ACTION_GROUP]: 'query matched',
        [ALERT_PREVIOUS_ACTION_GROUP]: 'query matched',
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
          esQuery: '{\n  "query":{\n    "match_all" : {}\n  }\n}',
          timeWindowSize: 20,
          timeWindowUnit: 's',
          excludeHitsFromPreviousRun: true,
          aggType: 'count',
          groupBy: 'all',
          searchType: 'esQuery',
        },
        [ALERT_RULE_PRODUCER]: alertDocument[ALERT_RULE_PRODUCER],
        [ALERT_RULE_REVISION]: 0,
        [ALERT_RULE_TYPE_ID]: '.es-query',
        [ALERT_RULE_TAGS]: [],
        [ALERT_RULE_UUID]: ruleId,
        [SPACE_IDS]: ['default'],
        [TAGS]: [],
        [ALERT_PENDING_RECOVERED_COUNT]: 0,
      });
    });
  });
}
