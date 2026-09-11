/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import {
  createRule,
  createAlertsIndex,
  deleteAllRules,
  deleteAllAlerts,
} from '@kbn/detections-response-ftr-services';
import {
  getSimpleRule,
  getSimpleRuleOutput,
  getSimpleRuleOutputWithoutRuleId,
  getSimpleRuleWithoutRuleId,
  removeServerGeneratedProperties,
  removeServerGeneratedPropertiesIncludingRuleId,
  updateUsername,
} from '../../../utils';
import {
  generateGapsForRule,
  generateMalformedGapEventsForRule,
} from '../../../utils/event_log/generate_gaps_for_rule';

import type { FtrProviderContext } from '../../../../../ftr_provider_context';

export default ({ getService }: FtrProviderContext): void => {
  const supertest = getService('supertest');
  const detectionsApi = getService('detectionsApi');
  const log = getService('log');
  const es = getService('es');
  const utils = getService('securitySolutionUtils');
  const retry = getService('retry');

  const EVENT_LOG_DATA_STREAM = '.kibana-event-log-ds';

  const countGapsForRule = async (
    ruleId: string,
    { softDeleted }: { softDeleted: boolean }
  ): Promise<number> => {
    await es.indices.refresh({ index: EVENT_LOG_DATA_STREAM });
    const deletedClause = { term: { 'kibana.alert.rule.gap.deleted': true } };
    const { count } = await es.count({
      index: EVENT_LOG_DATA_STREAM,
      query: {
        bool: {
          must: [
            { term: { 'event.action': 'gap' } },
            { term: { 'event.provider': 'alerting' } },
            { term: { 'rule.id': ruleId } },
            ...(softDeleted ? [deletedClause] : []),
          ],
          ...(softDeleted ? {} : { must_not: [deletedClause] }),
        },
      },
    });
    return count;
  };

  describe('@ess @serverless @skipInServerlessMKI delete_rules', () => {
    describe('deleting rules', () => {
      beforeEach(async () => {
        await createAlertsIndex(supertest, log);
      });

      afterEach(async () => {
        await deleteAllAlerts(supertest, log, es);
        await deleteAllRules(supertest, log);
      });

      it('should delete a single rule with a rule_id', async () => {
        await createRule(supertest, log, getSimpleRule('rule-1'));

        // delete the rule by its rule_id
        const { body } = await detectionsApi
          .deleteRule({ query: { rule_id: 'rule-1' } })
          .expect(200);

        const bodyToCompare = removeServerGeneratedProperties(body);
        const expectedRule = updateUsername(getSimpleRuleOutput(), await utils.getUsername());

        expect(bodyToCompare).to.eql(expectedRule);
      });

      it('should delete a single rule using an auto generated rule_id', async () => {
        const bodyWithCreatedRule = await createRule(supertest, log, getSimpleRuleWithoutRuleId());

        // delete that rule by its auto-generated rule_id
        const { body } = await detectionsApi
          .deleteRule({ query: { rule_id: bodyWithCreatedRule.rule_id } })
          .expect(200);

        const bodyToCompare = removeServerGeneratedPropertiesIncludingRuleId(body);
        const expectedRule = updateUsername(
          getSimpleRuleOutputWithoutRuleId(),
          await utils.getUsername()
        );

        expect(bodyToCompare).to.eql(expectedRule);
      });

      it('should delete a single rule using an auto generated id', async () => {
        const bodyWithCreatedRule = await createRule(supertest, log, getSimpleRule());

        // delete that rule by its auto-generated id
        const { body } = await detectionsApi
          .deleteRule({ query: { id: bodyWithCreatedRule.id } })
          .expect(200);

        const bodyToCompare = removeServerGeneratedPropertiesIncludingRuleId(body);
        const expectedRule = updateUsername(
          getSimpleRuleOutputWithoutRuleId(),
          await utils.getUsername()
        );

        expect(bodyToCompare).to.eql(expectedRule);
      });

      it('should return an error if the id does not exist when trying to delete it', async () => {
        const { body } = await detectionsApi
          .deleteRule({ query: { id: 'c1e1b359-7ac1-4e96-bc81-c683c092436f' } })
          .expect(404);

        expect(body).to.eql({
          message: 'id: "c1e1b359-7ac1-4e96-bc81-c683c092436f" not found',
          status_code: 404,
        });
      });

      it('should return an error if the rule_id does not exist when trying to delete it', async () => {
        const { body } = await detectionsApi
          .deleteRule({ query: { rule_id: 'fake_id' } })
          .expect(404);

        expect(body).to.eql({
          message: 'rule_id: "fake_id" not found',
          status_code: 404,
        });
      });

      it('should soft-delete gaps after deleting a single rule', async () => {
        const createdRule = await createRule(supertest, log, getSimpleRule('rule-with-gaps'));

        const { gapEvents } = await generateGapsForRule(
          es,
          { id: createdRule.id, name: createdRule.name },
          5
        );
        expect(gapEvents.length).to.equal(5);
        expect(await countGapsForRule(createdRule.id, { softDeleted: false })).to.equal(5);

        await detectionsApi.deleteRule({ query: { rule_id: 'rule-with-gaps' } }).expect(200);

        // Gap soft-deletion is synchronous (a blocking update_by_query); the retry only
        // covers ES refresh visibility.
        await retry.tryForTime(30_000, async () => {
          expect(await countGapsForRule(createdRule.id, { softDeleted: true })).to.equal(5);
          expect(await countGapsForRule(createdRule.id, { softDeleted: false })).to.equal(0);
        });
      });

      it('should soft-delete well-formed gaps even when a malformed gap document matches', async () => {
        const createdRule = await createRule(supertest, log, getSimpleRule('rule-malformed-gaps'));
        const ruleRef = { id: createdRule.id, name: createdRule.name };

        const { gapEvents } = await generateGapsForRule(es, ruleRef, 5);
        const malformedCount = await generateMalformedGapEventsForRule(es, ruleRef);

        expect(gapEvents.length).to.equal(5);
        expect(await countGapsForRule(createdRule.id, { softDeleted: false })).to.equal(
          5 + malformedCount
        );

        await detectionsApi.deleteRule({ query: { rule_id: 'rule-malformed-gaps' } }).expect(200);

        // The script's null guard skips documents without `kibana.alert.rule.gap` rather
        // than raising a script error, which would abort the whole update_by_query and
        // leave well-formed gaps active. The malformed documents stay untouched.
        await retry.tryForTime(30_000, async () => {
          expect(await countGapsForRule(createdRule.id, { softDeleted: true })).to.equal(5);
          expect(await countGapsForRule(createdRule.id, { softDeleted: false })).to.equal(
            malformedCount
          );
        });
      });
    });
  });
};
