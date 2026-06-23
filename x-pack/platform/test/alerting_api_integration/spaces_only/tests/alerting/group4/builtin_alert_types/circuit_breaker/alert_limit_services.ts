/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';

import { ESTestIndexTool, ES_TEST_INDEX_NAME } from '@kbn/alerting-api-integration-helpers';
import { Spaces } from '../../../../../scenarios';
import type { FtrProviderContext } from '../../../../../../common/ftr_provider_context';
import { getUrlPrefix, ObjectRemover, getEventLog } from '../../../../../../common/lib';

export default function maxAlertsRuleTests({ getService }: FtrProviderContext) {
  const supertest = getService('supertest');
  const retry = getService('retry');
  const es = getService('es');
  const esTestIndexTool = new ESTestIndexTool(es, retry);

  describe('rule that hits max alerts circuit breaker', () => {
    const objectRemover = new ObjectRemover(supertest);

    beforeEach(async () => {
      await esTestIndexTool.destroy();
      await esTestIndexTool.setup();
    });

    afterEach(async () => {
      await objectRemover.removeAll();
      await esTestIndexTool.destroy();
    });

    it('short circuits rule execution if rule type lets framework handle alert limit', async () => {
      const ruleId = await createRule({
        name: 'no alert limit handling',
        getsLimit: false,
        reportsLimitReached: false,
      });

      const events = await retry.try(async () => {
        return await getEventLog({
          getService,
          spaceId: Spaces.space1.id,
          type: 'alert',
          id: ruleId,
          provider: 'alerting',
          actions: new Map([['execute', { gte: 1 }]]),
        });
      });

      // check that there's a warning in the execute event
      const executeEvent = events[0];
      expect(executeEvent?.event?.outcome).to.eql('success');
      expect(executeEvent?.event?.reason).to.eql('maxAlerts');
      expect(executeEvent?.kibana?.alerting?.status).to.eql('warning');
      expect(executeEvent?.message).to.eql(
        "Rule reported more than the maximum number of alerts in a single run. This limit helps prevent actions being triggered excessively. Consider narrowing your rule's query results or adjusting the alert limit configuration. Alerts may be missed and recovery notifications may be delayed"
      );

      // check there are no docs written out in the ES_TEST_INDEX
      const results = await es.search(
        { index: ES_TEST_INDEX_NAME, query: { match_all: {} } },
        { meta: true }
      );
      // @ts-expect-error doesn't handle total: number
      const value = results.body.hits.total.value?.value || results.body.hits.total.value;
      expect(value).to.eql(0);
    });

    it('ends in error if rule type requests alert limit but does not report back whether it reached the limit', async () => {
      const ruleId = await createRule({
        name: 'no alert limit handling',
        getsLimit: true,
        reportsLimitReached: false,
      });

      const events = await retry.try(async () => {
        return await getEventLog({
          getService,
          spaceId: Spaces.space1.id,
          type: 'alert',
          id: ruleId,
          provider: 'alerting',
          actions: new Map([['execute', { gte: 1 }]]),
        });
      });

      // check that there's an error in the execute event
      const executeEvent = events[0];
      expect(executeEvent?.event?.outcome).to.eql('failure');
      expect(executeEvent?.event?.reason).to.eql('execute');
      expect(executeEvent?.kibana?.alerting?.status).to.eql('error');
      expect(executeEvent?.error?.message).to.eql(
        `Rule has not reported whether alert limit has been reached after requesting limit value!`
      );

      // check there are docs written out in the ES_TEST_INDEX
      const results = await es.search(
        { index: ES_TEST_INDEX_NAME, query: { match_all: {} } },
        { meta: true }
      );
      // @ts-expect-error doesn't handle total: number
      const value = results.body.hits.total.value?.value || results.body.hits.total.value;
      expect(value).to.eql(1);

      const hit = results.body.hits.hits[0];
      expect(hit._source).to.eql({
        numAlerts: 110,
      });
    });

    it('completes execution if rule type requests alert limit and reports back whether it reached the limit', async () => {
      const ruleId = await createRule({
        name: 'no alert limit handling',
        getsLimit: true,
        reportsLimitReached: true,
      });

      const events = await retry.try(async () => {
        return await getEventLog({
          getService,
          spaceId: Spaces.space1.id,
          type: 'alert',
          id: ruleId,
          provider: 'alerting',
          actions: new Map([['execute', { gte: 1 }]]),
        });
      });

      // check that there's a warning in the execute event
      const executeEvent = events[0];
      expect(executeEvent?.event?.outcome).to.eql('success');
      expect(executeEvent?.event?.reason).to.eql('maxAlerts');
      expect(executeEvent?.kibana?.alerting?.status).to.eql('warning');
      expect(executeEvent?.message).to.eql(
        "Rule reported more than the maximum number of alerts in a single run. This limit helps prevent actions being triggered excessively. Consider narrowing your rule's query results or adjusting the alert limit configuration. Alerts may be missed and recovery notifications may be delayed"
      );

      // check there are docs written out in the ES_TEST_INDEX
      const results = await es.search(
        { index: ES_TEST_INDEX_NAME, query: { match_all: {} } },
        { meta: true }
      );
      // @ts-expect-error doesn't handle total: number
      const value = results.body.hits.total.value?.value || results.body.hits.total.value;
      expect(value).to.eql(1);

      const hit = results.body.hits.hits[0];
      expect(hit._source).to.eql({
        numAlerts: 110,
      });
    });

    interface CreateRuleParams {
      name: string;
      getsLimit: boolean;
      reportsLimitReached: boolean;
    }

    async function createRule(params: CreateRuleParams): Promise<string> {
      const { status, body: createdRule } = await supertest
        .post(`${getUrlPrefix(Spaces.space1.id)}/api/alerting/rule`)
        .set('kbn-xsrf', 'foo')
        .send({
          name: params.name,
          consumer: 'alerts',
          enabled: true,
          rule_type_id: 'test.exceedsAlertLimit',
          schedule: { interval: '1m' },
          actions: [],
          notify_when: 'onActiveAlert',
          params: {
            index: ES_TEST_INDEX_NAME,
            getsLimit: params.getsLimit,
            reportsLimitReached: params.reportsLimitReached,
          },
        });

      expect(status).to.be(200);

      const ruleId = createdRule.id;
      objectRemover.add(Spaces.space1.id, ruleId, 'rule', 'alerting');

      return ruleId;
    }
  });
}
