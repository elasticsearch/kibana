/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';

import {
  DETECTION_ENGINE_RULES_URL,
  NOTIFICATION_DEFAULT_FREQUENCY,
  NOTIFICATION_THROTTLE_NO_ACTIONS,
  NOTIFICATION_THROTTLE_RULE,
} from '@kbn/security-solution-plugin/common/constants';
import type {
  RuleActionArray,
  RuleActionThrottle,
} from '@kbn/securitysolution-io-ts-alerting-types';
import { ExceptionListTypeEnum } from '@kbn/securitysolution-io-ts-list-types';
import { ROLES } from '@kbn/security-solution-plugin/common/test';
import {
  createAlertsIndex,
  deleteAllRules,
  deleteAllAlerts,
  createRule,
} from '@kbn/detections-response-ftr-services';

import type TestAgent from 'supertest/lib/agent';
import { v4 as uuidV4 } from 'uuid';
import type { RuleResponse } from '@kbn/security-solution-plugin/common/api/detection_engine';
import { createSupertestErrorLogger } from '../../../../edr_workflows/utils';
import { ROLE } from '../../../../../config/services/security_solution_edr_workflows_roles_users';
import type { FtrProviderContext } from '../../../../../ftr_provider_context';
import {
  createUserAndRole,
  deleteUserAndRole,
  deleteAndReCreateUserRole,
} from '../../../../../config/services/common';
import {
  getSimpleRule,
  getSimpleRuleOutput,
  removeServerGeneratedProperties,
  removeServerGeneratedPropertiesIncludingRuleId,
  getSimpleRuleOutputWithoutRuleId,
  getSimpleMlRuleOutput,
  getSimpleMlRule,
  getSimpleRuleWithoutRuleId,
  removeUUIDFromActions,
  getActionsWithFrequencies,
  getActionsWithoutFrequencies,
  getSomeActionsWithFrequencies,
  updateUsername,
  getCustomQueryRuleParams,
  getThresholdRuleParams,
} from '../../../utils';

export default ({ getService }: FtrProviderContext) => {
  const supertest = getService('supertest');
  const detectionsApi = getService('detectionsApi');
  const log = getService('log');
  const es = getService('es');
  const utils = getService('securitySolutionUtils');
  const rolesUsersProvider = getService('rolesUsersProvider');

  describe('@ess @serverless @skipInServerlessMKI patch_rules', () => {
    describe('patch rules', () => {
      beforeEach(async () => {
        await createAlertsIndex(supertest, log);
      });

      afterEach(async () => {
        await deleteAllAlerts(supertest, log, es);
        await deleteAllRules(supertest, log);
      });

      it('should patch a single rule property of name using a rule_id', async () => {
        await createRule(supertest, log, getSimpleRule('rule-1'));

        // patch a simple rule's name
        const { body } = await supertest
          .patch(DETECTION_ENGINE_RULES_URL)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .send({ rule_id: 'rule-1', name: 'some other name' })
          .expect(200);

        const outputRule = updateUsername(getSimpleRuleOutput(), await utils.getUsername());

        outputRule.name = 'some other name';
        outputRule.revision = 1;
        const bodyToCompare = removeServerGeneratedProperties(body);
        expect(bodyToCompare).to.eql(outputRule);
      });

      it("should patch a machine_learning rule's job ID if in a legacy format", async () => {
        await createRule(supertest, log, getSimpleMlRule('rule-1'));

        // patch a simple rule's name
        const { body } = await supertest
          .patch(DETECTION_ENGINE_RULES_URL)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .send({
            rule_id: 'rule-1',
            machine_learning_job_id: 'some_job_id',
            type: 'machine_learning',
          })
          .expect(200);

        const outputRule = updateUsername(getSimpleMlRuleOutput(), await utils.getUsername());

        const bodyToCompare = removeServerGeneratedProperties(body);
        expect(bodyToCompare).to.eql(outputRule);
      });

      it("should patch a threshold rule's threshold when `type` is included in the body", async () => {
        await createRule(supertest, log, getThresholdRuleParams({ rule_id: 'rule-1' }));

        const { body } = await supertest
          .patch(DETECTION_ENGINE_RULES_URL)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .send({
            rule_id: 'rule-1',
            type: 'threshold',
            threshold: { field: ['host.name'], value: 200 },
          })
          .expect(200);

        expect(body.threshold).to.eql({ field: ['host.name'], value: 200 });
      });

      it("should patch a threshold rule's threshold when `type` is omitted from the body", async () => {
        await createRule(supertest, log, getThresholdRuleParams({ rule_id: 'rule-1' }));

        const { body } = await supertest
          .patch(DETECTION_ENGINE_RULES_URL)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .send({
            rule_id: 'rule-1',
            threshold: { field: ['host.name'], value: 200 },
          })
          .expect(200);

        expect(body.threshold).to.eql({ field: ['host.name'], value: 200 });
      });

      // A `type` that contradicts the existing rule's type must be rejected, not silently
      // validated against the wrong schema.
      it('should reject with a 400 when `type` does not match the existing rule', async () => {
        await createRule(supertest, log, getThresholdRuleParams({ rule_id: 'rule-1' }));

        const { body } = await supertest
          .patch(DETECTION_ENGINE_RULES_URL)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .send({ rule_id: 'rule-1', type: 'query' })
          .expect(400);

        expect(body.message).to.contain('type');
      });

      it('should patch a single rule property of name using a rule_id of type "machine learning"', async () => {
        await createRule(supertest, log, getSimpleMlRule('rule-1'));

        // patch a simple rule's name
        const { body } = await supertest
          .patch(DETECTION_ENGINE_RULES_URL)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .send({ rule_id: 'rule-1', name: 'some other name' })
          .expect(200);

        const outputRule = updateUsername(getSimpleMlRuleOutput(), await utils.getUsername());

        outputRule.name = 'some other name';
        outputRule.revision = 1;
        const bodyToCompare = removeServerGeneratedProperties(body);
        expect(bodyToCompare).to.eql(outputRule);
      });

      it('should patch a single rule property of name using the auto-generated rule_id', async () => {
        const rule = getSimpleRule('rule-1');
        delete rule.rule_id;
        const createRuleBody = await createRule(supertest, log, rule);

        // patch a simple rule's name
        const { body } = await supertest
          .patch(DETECTION_ENGINE_RULES_URL)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .send({ rule_id: createRuleBody.rule_id, name: 'some other name' })
          .expect(200);

        const outputRule = updateUsername(
          getSimpleRuleOutputWithoutRuleId(),
          await utils.getUsername()
        );

        outputRule.name = 'some other name';
        outputRule.revision = 1;
        const bodyToCompare = removeServerGeneratedPropertiesIncludingRuleId(body);
        expect(bodyToCompare).to.eql(outputRule);
      });

      it('should patch a single rule property of name using the auto-generated id', async () => {
        const createdBody = await createRule(supertest, log, getSimpleRule('rule-1'));

        // patch a simple rule's name
        const { body } = await supertest
          .patch(DETECTION_ENGINE_RULES_URL)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .send({ id: createdBody.id, name: 'some other name' })
          .expect(200);
        const outputRule = updateUsername(getSimpleRuleOutput(), await utils.getUsername());

        outputRule.name = 'some other name';
        outputRule.revision = 1;
        const bodyToCompare = removeServerGeneratedProperties(body);
        expect(bodyToCompare).to.eql(outputRule);
      });

      it('should not change the revision of a rule when it patches only enabled', async () => {
        await createRule(supertest, log, getSimpleRule('rule-1'));

        // patch a simple rule's enabled to false
        const { body } = await supertest
          .patch(DETECTION_ENGINE_RULES_URL)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .send({ rule_id: 'rule-1', enabled: false })
          .expect(200);

        const outputRule = updateUsername(getSimpleRuleOutput(), await utils.getUsername());

        outputRule.enabled = false;

        const bodyToCompare = removeServerGeneratedProperties(body);
        expect(bodyToCompare).to.eql(outputRule);
      });

      it('should change the revision of a rule when it patches enabled and another property', async () => {
        await createRule(supertest, log, getSimpleRule('rule-1'));

        // patch a simple rule's enabled to false and another property
        const { body } = await supertest
          .patch(DETECTION_ENGINE_RULES_URL)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .send({ rule_id: 'rule-1', severity: 'low', enabled: false })
          .expect(200);

        const outputRule = updateUsername(getSimpleRuleOutput(), await utils.getUsername());
        outputRule.enabled = false;
        outputRule.severity = 'low';
        outputRule.revision = 1;

        const bodyToCompare = removeServerGeneratedProperties(body);
        expect(bodyToCompare).to.eql(outputRule);
      });

      it('should not change other properties when it does patches', async () => {
        await createRule(supertest, log, getSimpleRule('rule-1'));

        // patch a simple rule's timeline_title
        await supertest
          .patch(DETECTION_ENGINE_RULES_URL)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .send({ rule_id: 'rule-1', timeline_title: 'some title', timeline_id: 'some id' })
          .expect(200);

        // patch a simple rule's name
        const { body } = await supertest
          .patch(DETECTION_ENGINE_RULES_URL)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .send({ rule_id: 'rule-1', name: 'some other name' })
          .expect(200);

        const outputRule = updateUsername(getSimpleRuleOutput(), await utils.getUsername());
        outputRule.name = 'some other name';
        outputRule.timeline_title = 'some title';
        outputRule.timeline_id = 'some id';
        outputRule.revision = 2;

        const bodyToCompare = removeServerGeneratedProperties(body);
        expect(bodyToCompare).to.eql(outputRule);
      });

      it('should overwrite exception list value on patch - non additive', async () => {
        await createRule(supertest, log, getSimpleRule('rule-1'));

        // patch a simple rule's exceptions_list
        await supertest
          .patch(DETECTION_ENGINE_RULES_URL)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .send({
            rule_id: 'rule-1',
            exceptions_list: [
              {
                id: '1',
                list_id: '123',
                namespace_type: 'single',
                type: ExceptionListTypeEnum.RULE_DEFAULT,
              },
            ],
          })
          .expect(200);

        // patch a simple rule's exceptions_list
        const { body } = await supertest
          .patch(DETECTION_ENGINE_RULES_URL)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .send({
            rule_id: 'rule-1',
            exceptions_list: [
              {
                id: '2',
                list_id: '123',
                namespace_type: 'single',
                type: ExceptionListTypeEnum.DETECTION,
              },
            ],
          })
          .expect(200);

        expect(body.exceptions_list).to.have.length(1);
        expect(body.exceptions_list[0].id).to.eql('2');
        expect(body.exceptions_list[0].list_id).to.eql('123');
        expect(body.exceptions_list[0].namespace_type).to.eql('single');
        expect(body.exceptions_list[0].type).to.eql('detection');
      });
      describe('@skipInServerless with rules_read_exceptions_all user role', () => {
        const role = ROLES.rules_read_exceptions_all;

        beforeEach(async () => {
          await deleteAndReCreateUserRole(getService, role);
        });

        afterEach(async () => {
          await deleteUserAndRole(getService, role);
        });
        it('should overwrite exception list value on patch with a user role of read-rules and exceptions-all', async () => {
          await createRule(supertest, log, getSimpleRule('rule-1'));

          const restrictedUser = { username: 'rules_read_exceptions_all', password: 'changeme' };
          const restrictedApis = detectionsApi.withUser(restrictedUser);
          await restrictedApis
            .patchRule({
              body: {
                rule_id: 'rule-1',
                exceptions_list: [
                  {
                    id: '1',
                    list_id: '123',
                    namespace_type: 'single',
                    type: ExceptionListTypeEnum.RULE_DEFAULT,
                  },
                ],
              },
            })
            .expect(200);
          const { body } = await restrictedApis
            .patchRule({
              body: {
                rule_id: 'rule-1',
                exceptions_list: [
                  {
                    id: '2',
                    list_id: '123',
                    namespace_type: 'single',
                    type: ExceptionListTypeEnum.DETECTION,
                  },
                ],
              },
            })
            .expect(200);

          expect(body.exceptions_list).to.have.length(1);
          expect(body.exceptions_list[0].id).to.eql('2');
          expect(body.exceptions_list[0].list_id).to.eql('123');
          expect(body.exceptions_list[0].namespace_type).to.eql('single');
          expect(body.exceptions_list[0].type).to.eql('detection');
        });
        it('should throw error when patching exception list and non-valid read authz field "query"', async () => {
          await createRule(supertest, log, getSimpleRule('rule-1'));

          const restrictedUser = { username: 'rules_read_exceptions_all', password: 'changeme' };
          const restrictedApis = detectionsApi.withUser(restrictedUser);
          const { body } = await restrictedApis
            .patchRule({
              body: {
                rule_id: 'rule-1',
                query: 'this should fail in the patch route',
                exceptions_list: [
                  {
                    id: '1',
                    list_id: '123',
                    namespace_type: 'single',
                    type: ExceptionListTypeEnum.RULE_DEFAULT,
                  },
                ],
              },
            })
            .expect(403);
          expect(body.message).to.eql('Unauthorized by "siem" to update "siem.queryRule" rule');
        });
        it('should throw error when patching one non-valid read authz field "query"', async () => {
          await createRule(supertest, log, getSimpleRule('rule-1'));

          const restrictedUser = { username: 'rules_read_exceptions_all', password: 'changeme' };
          const restrictedApis = detectionsApi.withUser(restrictedUser);
          const { body } = await restrictedApis
            .patchRule({
              body: {
                rule_id: 'rule-1',
                query: 'this should fail in the patch route',
              },
            })
            .expect(403);
          expect(body.message).to.eql('Unauthorized by "siem" to update "siem.queryRule" rule');
        });
        it('should throw error when patching multiple non-valid read authz field "query" and "description" and "author"', async () => {
          await createRule(supertest, log, getSimpleRule('rule-1'));

          const restrictedUser = { username: 'rules_read_exceptions_all', password: 'changeme' };
          const restrictedApis = detectionsApi.withUser(restrictedUser);
          const { body } = await restrictedApis
            .patchRule({
              body: {
                rule_id: 'rule-1',
                query: 'this query patch should fail in the patch route',
                description: 'this description patch should fail in the patch route',
                author: ['myfakeauthor'],
              },
            })
            .expect(403);
          expect(body.message).to.eql('Unauthorized by "siem" to update "siem.queryRule" rule');
        });
      });
      describe('@skipInServerless with rules_read_exceptions_read user role', () => {
        const role = ROLES.rules_read_exceptions_read;

        beforeEach(async () => {
          await createUserAndRole(getService, role);
        });

        afterEach(async () => {
          await deleteUserAndRole(getService, role);
        });
        it('should return unauthorized when patching exception list value', async () => {
          await createRule(supertest, log, getSimpleRule('rule-1'));

          const restrictedUser = { username: 'rules_read_exceptions_all', password: 'changeme' };
          const restrictedApis = detectionsApi.withUser(restrictedUser);
          await restrictedApis
            .patchRule({
              body: {
                rule_id: 'rule-1',
                exceptions_list: [
                  {
                    id: '1',
                    list_id: '123',
                    namespace_type: 'single',
                    type: ExceptionListTypeEnum.RULE_DEFAULT,
                  },
                ],
              },
            })
            .expect(401);
        });
      });

      it('should throw error if trying to add more than one default exception list', async () => {
        await createRule(supertest, log, getSimpleRule('rule-1'));

        // patch a simple rule's exceptions_list
        const { body } = await supertest
          .patch(DETECTION_ENGINE_RULES_URL)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .send({
            rule_id: 'rule-1',
            exceptions_list: [
              {
                id: '1',
                list_id: '123',
                namespace_type: 'single',
                type: ExceptionListTypeEnum.RULE_DEFAULT,
              },
              {
                id: '2',
                list_id: '456',
                namespace_type: 'single',
                type: ExceptionListTypeEnum.RULE_DEFAULT,
              },
            ],
          })
          .expect(500);

        expect(body).to.eql({
          message: 'More than one default exception list found on rule',
          status_code: 500,
        });
      });

      it('should not patch a rule if trying to add default rule exception list which attached to another', async () => {
        const ruleWithException = await createRule(supertest, log, {
          ...getSimpleRule('rule-1'),
          exceptions_list: [
            {
              id: '2',
              list_id: '123',
              namespace_type: 'single',
              type: ExceptionListTypeEnum.RULE_DEFAULT,
            },
          ],
        });
        await createRule(supertest, log, getSimpleRule('rule-2'));

        const { body } = await supertest
          .patch(DETECTION_ENGINE_RULES_URL)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .send({
            rule_id: 'rule-2',
            exceptions_list: [
              {
                id: '2',
                list_id: '123',
                namespace_type: 'single',
                type: ExceptionListTypeEnum.RULE_DEFAULT,
              },
            ],
          })
          .expect(409);

        expect(body).to.eql({
          message: `default exception list for rule: rule-2 already exists in rule(s): ${ruleWithException.id}`,
          status_code: 409,
        });
      });

      it('should not update a rule if trying to add default rule exception list which attached to another using rule.id', async () => {
        const ruleWithException = await createRule(supertest, log, {
          ...getSimpleRule('rule-1'),
          exceptions_list: [
            {
              id: '2',
              list_id: '123',
              namespace_type: 'single',
              type: ExceptionListTypeEnum.RULE_DEFAULT,
            },
          ],
        });
        const createdBody = await createRule(supertest, log, getSimpleRule('rule-2'));

        const { body } = await supertest
          .patch(DETECTION_ENGINE_RULES_URL)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .send({
            id: createdBody.id,
            exceptions_list: [
              {
                id: '2',
                list_id: '123',
                namespace_type: 'single',
                type: ExceptionListTypeEnum.RULE_DEFAULT,
              },
            ],
          })
          .expect(409);

        expect(body).to.eql({
          message: `default exception list for rule: ${createdBody.id} already exists in rule(s): ${ruleWithException.id}`,
          status_code: 409,
        });
      });

      it('should give a 404 if it is given a fake id', async () => {
        const { body } = await supertest
          .patch(DETECTION_ENGINE_RULES_URL)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .send({ id: '5096dec6-b6b9-4d8d-8f93-6c2602079d9d', name: 'some other name' })
          .expect(404);

        expect(body).to.eql({
          status_code: 404,
          message: 'id: "5096dec6-b6b9-4d8d-8f93-6c2602079d9d" not found',
        });
      });

      it('should give a 404 if it is given a fake rule_id', async () => {
        const { body } = await supertest
          .patch(DETECTION_ENGINE_RULES_URL)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .send({ rule_id: 'fake_id', name: 'some other name' })
          .expect(404);

        expect(body).to.eql({
          status_code: 404,
          message: 'rule_id: "fake_id" not found',
        });
      });

      describe('patch per-action frequencies', () => {
        const patchSingleRule = async (
          ruleId: string,
          throttle: RuleActionThrottle | undefined,
          actions: RuleActionArray
        ) => {
          const { body: patchedRule } = await supertest
            .patch(DETECTION_ENGINE_RULES_URL)
            .set('kbn-xsrf', 'true')
            .set('elastic-api-version', '2023-10-31')
            .send({ rule_id: ruleId, throttle, actions })
            .expect(200);

          patchedRule.actions = removeUUIDFromActions(patchedRule.actions);
          return removeServerGeneratedPropertiesIncludingRuleId(patchedRule);
        };

        describe('actions without frequencies', () => {
          [undefined, NOTIFICATION_THROTTLE_NO_ACTIONS, NOTIFICATION_THROTTLE_RULE].forEach(
            (throttle) => {
              it(`@skipInServerless it sets each action's frequency attribute to default value when 'throttle' is ${throttle}`, async () => {
                const actionsWithoutFrequencies = await getActionsWithoutFrequencies(supertest);

                // create simple rule
                const createdRule = await createRule(supertest, log, getSimpleRuleWithoutRuleId());

                // patch a simple rule's `throttle` and `actions`
                const patchedRule = await patchSingleRule(
                  createdRule.rule_id,
                  throttle,
                  actionsWithoutFrequencies
                );
                const expectedRule = updateUsername(
                  getSimpleRuleOutputWithoutRuleId(),
                  await utils.getUsername()
                );

                expectedRule.revision = 1;
                expectedRule.actions = actionsWithoutFrequencies.map((action) => ({
                  ...action,
                  frequency: NOTIFICATION_DEFAULT_FREQUENCY,
                }));

                expect(patchedRule).to.eql(expectedRule);
              });
            }
          );

          // Action throttle cannot be shorter than the schedule interval which is by default is 5m
          ['300s', '5m', '3h', '4d'].forEach((throttle) => {
            it(`@skipInServerless it correctly transforms 'throttle = ${throttle}' and sets it as a frequency of each action`, async () => {
              const actionsWithoutFrequencies = await getActionsWithoutFrequencies(supertest);

              // create simple rule
              const createdRule = await createRule(supertest, log, getSimpleRuleWithoutRuleId());

              // patch a simple rule's `throttle` and `actions`
              const patchedRule = await patchSingleRule(
                createdRule.rule_id,
                throttle,
                actionsWithoutFrequencies
              );
              const expectedRule = updateUsername(
                getSimpleRuleOutputWithoutRuleId(),
                await utils.getUsername()
              );

              expectedRule.revision = 1;
              expectedRule.actions = actionsWithoutFrequencies.map((action) => ({
                ...action,
                frequency: { summary: true, throttle, notifyWhen: 'onThrottleInterval' },
              }));

              expect(patchedRule).to.eql(expectedRule);
            });
          });
        });

        describe('actions with frequencies', () => {
          [
            undefined,
            NOTIFICATION_THROTTLE_NO_ACTIONS,
            NOTIFICATION_THROTTLE_RULE,
            '321s',
            '6m',
            '10h',
            '2d',
          ].forEach((throttle) => {
            it(`@skipInServerless it does not change actions frequency attributes when 'throttle' is '${throttle}'`, async () => {
              const actionsWithFrequencies = await getActionsWithFrequencies(supertest);

              // create simple rule
              const createdRule = await createRule(supertest, log, getSimpleRuleWithoutRuleId());

              // patch a simple rule's `throttle` and `actions`
              const patchedRule = await patchSingleRule(
                createdRule.rule_id,
                throttle,
                actionsWithFrequencies
              );

              const expectedRule = updateUsername(
                getSimpleRuleOutputWithoutRuleId(),
                await utils.getUsername()
              );

              expectedRule.revision = 1;
              expectedRule.actions = actionsWithFrequencies;

              expect(patchedRule).to.eql(expectedRule);
            });
          });
        });

        describe('@skipInServerless some actions with frequencies', () => {
          [undefined, NOTIFICATION_THROTTLE_NO_ACTIONS, NOTIFICATION_THROTTLE_RULE].forEach(
            (throttle) => {
              it(`it overrides each action's frequency attribute to default value when 'throttle' is ${throttle}`, async () => {
                const someActionsWithFrequencies = await getSomeActionsWithFrequencies(supertest);

                // create simple rule
                const createdRule = await createRule(supertest, log, getSimpleRuleWithoutRuleId());

                // patch a simple rule's `throttle` and `actions`
                const patchedRule = await patchSingleRule(
                  createdRule.rule_id,
                  throttle,
                  someActionsWithFrequencies
                );
                const expectedRule = updateUsername(
                  getSimpleRuleOutputWithoutRuleId(),
                  await utils.getUsername()
                );

                expectedRule.revision = 1;
                expectedRule.actions = someActionsWithFrequencies.map((action) => ({
                  ...action,
                  frequency: action.frequency ?? NOTIFICATION_DEFAULT_FREQUENCY,
                }));

                expect(patchedRule).to.eql(expectedRule);
              });
            }
          );

          // Action throttle cannot be shorter than the schedule interval which is by default is 5m
          ['430s', '7m', '1h', '8d'].forEach((throttle) => {
            it(`it correctly transforms 'throttle = ${throttle}' and overrides frequency attribute of each action`, async () => {
              const someActionsWithFrequencies = await getSomeActionsWithFrequencies(supertest);

              // create simple rule
              const createdRule = await createRule(supertest, log, getSimpleRuleWithoutRuleId());

              // patch a simple rule's `throttle` and `actions`
              const patchedRule = await patchSingleRule(
                createdRule.rule_id,
                throttle,
                someActionsWithFrequencies
              );

              const expectedRule = updateUsername(
                getSimpleRuleOutputWithoutRuleId(),
                await utils.getUsername()
              );
              expectedRule.revision = 1;
              expectedRule.actions = someActionsWithFrequencies.map((action) => ({
                ...action,
                frequency: action.frequency ?? {
                  summary: true,
                  throttle,
                  notifyWhen: 'onThrottleInterval',
                },
              }));

              expect(patchedRule).to.eql(expectedRule);
            });
          });
        });
      });

      describe('path action with endpoint response actions', () => {
        let superTestResponseActionsNoAuthz: TestAgent;
        let ruleToUpdate: RuleResponse;

        before(async () => {
          superTestResponseActionsNoAuthz = await utils.createSuperTestWithCustomRole({
            name: ROLE.endpoint_response_actions_no_access,
            privileges: rolesUsersProvider.loader.getPreDefinedRole(
              ROLE.endpoint_response_actions_no_access
            ),
          });
        });

        beforeEach(async () => {
          ruleToUpdate = await createRule(
            supertest,
            log,
            getCustomQueryRuleParams({
              rule_id: uuidV4(),
              response_actions: [
                {
                  action_type_id: '.endpoint',
                  params: { command: 'kill-process', config: { field: '', overwrite: true } },
                },
              ],
            })
          );
        });

        afterEach(async () => {
          await deleteAllRules(supertest, log);
        });

        it('should update rule response actions when user has authz', async () => {
          const { body } = await supertest
            .patch(DETECTION_ENGINE_RULES_URL)
            .set('kbn-xsrf', 'true')
            .set('elastic-api-version', '2023-10-31')
            .on('error', createSupertestErrorLogger(log))
            .send({ id: ruleToUpdate.id, response_actions: [] })
            .expect(200);

          expect(body.response_actions).to.eql([]);
        });

        it('should not update rule response actions when user does not have authz', async () => {
          const { body } = await superTestResponseActionsNoAuthz
            .patch(DETECTION_ENGINE_RULES_URL)
            .set('kbn-xsrf', 'true')
            .set('elastic-api-version', '2023-10-31')
            .on('error', createSupertestErrorLogger(log).ignoreCodes([403]))
            .send({ id: ruleToUpdate.id, response_actions: [] })
            .expect(403);

          expect(body).to.eql({
            message: 'User is not authorized to create/update kill-process response action',
            status_code: 403,
          });
        });

        it('should replace response actions with a process action that has a custom field', async () => {
          const responseActions = [
            {
              action_type_id: '.endpoint',
              params: {
                command: 'suspend-process',
                comment: 'example1',
                config: { field: 'process.entity_id', overwrite: false },
              },
            },
          ];

          const { body } = await supertest
            .patch(DETECTION_ENGINE_RULES_URL)
            .set('kbn-xsrf', 'true')
            .set('elastic-api-version', '2023-10-31')
            .on('error', createSupertestErrorLogger(log))
            .send({ id: ruleToUpdate.id, response_actions: responseActions })
            .expect(200);

          expect(body.response_actions).to.eql(responseActions);
        });
      });
    });

    describe('investigation fields', () => {
      describe('investigation_field', () => {
        beforeEach(async () => {
          await createAlertsIndex(supertest, log);
        });

        afterEach(async () => {
          await deleteAllAlerts(supertest, log, es);
          await deleteAllRules(supertest, log);
        });

        it('should overwrite investigation_fields value on patch - non additive', async () => {
          await createRule(supertest, log, {
            ...getSimpleRule('rule-1'),
            investigation_fields: { field_names: ['blob', 'boop'] },
          });

          const rulePatch = {
            rule_id: 'rule-1',
            investigation_fields: { field_names: ['foo', 'bar'] },
          };

          const { body } = await supertest
            .patch(DETECTION_ENGINE_RULES_URL)
            .set('kbn-xsrf', 'true')
            .set('elastic-api-version', '2023-10-31')
            .send(rulePatch)
            .expect(200);

          expect(body.investigation_fields.field_names).to.eql(['foo', 'bar']);
        });

        it('should not allow field to be unset', async () => {
          await createRule(supertest, log, {
            ...getSimpleRule('rule-1'),
            investigation_fields: { field_names: ['blob', 'boop'] },
          });

          const rulePatch = {
            rule_id: 'rule-1',
            investigation_fields: undefined,
          };

          const { body } = await supertest
            .patch(DETECTION_ENGINE_RULES_URL)
            .set('kbn-xsrf', 'true')
            .send(rulePatch)
            .expect(200);

          expect(body.investigation_fields).to.eql({ field_names: ['blob', 'boop'] });
        });

        it('should not unset investigation_fields if not specified in patch', async () => {
          await createRule(supertest, log, {
            ...getSimpleRule('rule-1'),
            investigation_fields: { field_names: ['blob', 'boop'] },
          });

          const rulePatch = {
            rule_id: 'rule-1',
            name: 'New name',
          };

          const { body } = await supertest
            .patch(DETECTION_ENGINE_RULES_URL)
            .set('kbn-xsrf', 'true')
            .send(rulePatch)
            .expect(200);

          expect(body.investigation_fields.field_names).to.eql(['blob', 'boop']);
        });
      });
    });
  });
};
