/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from 'expect';

import { createRule, deleteAllRules } from '@kbn/detections-response-ftr-services';
import type { FtrProviderContext } from '../../../../../ftr_provider_context';
import {
  getCustomQueryRuleParams,
  getSimpleRule,
  getSimpleRuleOutput,
  getSimpleRuleOutputWithoutRuleId,
  removeServerGeneratedProperties,
  removeServerGeneratedPropertiesIncludingRuleId,
  updateUsername,
} from '../../../utils';

export default ({ getService }: FtrProviderContext) => {
  const supertest = getService('supertest');
  const detectionsApi = getService('detectionsApi');
  const log = getService('log');
  const utils = getService('securitySolutionUtils');

  describe('@ess @serverless @serverlessQA patch_rules', () => {
    describe('patch rules', () => {
      beforeEach(async () => {
        await deleteAllRules(supertest, log);
      });

      it('should patch a single rule property of name using a rule_id', async () => {
        await createRule(supertest, log, getSimpleRule('rule-1'));

        // patch a simple rule's name
        const { body } = await detectionsApi
          .patchRule({ body: { rule_id: 'rule-1', name: 'some other name' } })
          .expect(200);

        const outputRule = getSimpleRuleOutput();
        outputRule.name = 'some other name';
        outputRule.revision = 1;
        const expectedRule = updateUsername(outputRule, await utils.getUsername());

        const bodyToCompare = removeServerGeneratedProperties(body);
        expect(bodyToCompare).toEqual(expectedRule);
      });

      it('should patch defaultable fields', async () => {
        const rulePatchProperties = getCustomQueryRuleParams({
          rule_id: 'rule-1',
          max_signals: 200,
          setup: '# some setup markdown',
          related_integrations: [
            { package: 'package-a', version: '^1.2.3' },
            { package: 'package-b', integration: 'integration-b', version: '~1.1.1' },
          ],
          required_fields: [{ name: '@timestamp', type: 'date' }],
        });

        const expectedRule = {
          ...rulePatchProperties,
          required_fields: [{ name: '@timestamp', type: 'date', ecs: true }],
        };

        await detectionsApi.createRule({
          body: getCustomQueryRuleParams({ rule_id: 'rule-1' }),
        });

        const { body: patchedRuleResponse } = await detectionsApi
          .patchRule({
            body: {
              ...rulePatchProperties,
            },
          })
          .expect(200);

        expect(patchedRuleResponse).toMatchObject(expectedRule);

        const { body: patchedRule } = await detectionsApi
          .readRule({
            query: { rule_id: 'rule-1' },
          })
          .expect(200);

        expect(patchedRule).toMatchObject(expectedRule);
      });

      // PATCH cannot change a rule's type. The body is validated against the schema of the
      // existing rule's type, so a `type` that contradicts it is rejected as a bad request.
      // This is license independent, unlike the 403 this case used to return when the ML license
      // gate was fed the type from the request body rather than the rule being patched.
      it('should return a "400 bad request" when patching a rule to a different type', async () => {
        await createRule(supertest, log, getSimpleRule('rule-1'));

        const { body } = await detectionsApi
          .patchRule({ body: { rule_id: 'rule-1', type: 'machine_learning' } })
          .expect(400);

        expect(body).toEqual({
          message: 'type: Invalid input: expected "query"',
          status_code: 400,
        });
      });

      it('should patch a single rule property of name using the auto-generated rule_id', async () => {
        // create a simple rule
        const rule = getSimpleRule('rule-1');
        delete rule.rule_id;
        const createRuleBody = await createRule(supertest, log, rule);

        // patch a simple rule's name
        const { body } = await detectionsApi
          .patchRule({ body: { rule_id: createRuleBody.rule_id, name: 'some other name' } })
          .expect(200);

        const outputRule = getSimpleRuleOutputWithoutRuleId();
        outputRule.name = 'some other name';
        outputRule.revision = 1;
        const expectedRule = updateUsername(outputRule, await utils.getUsername());

        const bodyToCompare = removeServerGeneratedPropertiesIncludingRuleId(body);
        expect(bodyToCompare).toEqual(expectedRule);
      });

      it('should patch a single rule property of name using the auto-generated id', async () => {
        const createdBody = await createRule(supertest, log, getSimpleRule('rule-1'));

        // patch a simple rule's name
        const { body } = await detectionsApi
          .patchRule({ body: { id: createdBody.id, name: 'some other name' } })
          .expect(200);

        const outputRule = getSimpleRuleOutput();
        outputRule.name = 'some other name';
        outputRule.revision = 1;
        const expectedRule = updateUsername(outputRule, await utils.getUsername());

        const bodyToCompare = removeServerGeneratedProperties(body);
        expect(bodyToCompare).toEqual(expectedRule);
      });

      it('should not change the revision of a rule when it patches only enabled', async () => {
        await createRule(supertest, log, getSimpleRule('rule-1'));

        // patch a simple rule's enabled to false
        const { body } = await detectionsApi
          .patchRule({ body: { rule_id: 'rule-1', enabled: false } })
          .expect(200);

        const outputRule = getSimpleRuleOutput();
        outputRule.enabled = false;
        const expectedRule = updateUsername(outputRule, await utils.getUsername());

        const bodyToCompare = removeServerGeneratedProperties(body);
        expect(bodyToCompare).toEqual(expectedRule);
      });

      it('should change the revision of a rule when it patches enabled and another property', async () => {
        await createRule(supertest, log, getSimpleRule('rule-1'));

        // patch a simple rule's enabled to false and another property
        const { body } = await detectionsApi
          .patchRule({ body: { rule_id: 'rule-1', severity: 'low', enabled: false } })
          .expect(200);

        const outputRule = getSimpleRuleOutput();
        outputRule.enabled = false;
        outputRule.severity = 'low';
        outputRule.revision = 1;
        const expectedRule = updateUsername(outputRule, await utils.getUsername());

        const bodyToCompare = removeServerGeneratedProperties(body);
        expect(bodyToCompare).toEqual(expectedRule);
      });

      it('should not change other properties when it does patches', async () => {
        await createRule(supertest, log, getSimpleRule('rule-1'));

        // patch a simple rule's timeline_title
        await detectionsApi
          .patchRule({
            body: { rule_id: 'rule-1', timeline_title: 'some title', timeline_id: 'some id' },
          })
          .expect(200);

        // patch a simple rule's name
        const { body } = await detectionsApi
          .patchRule({ body: { rule_id: 'rule-1', name: 'some other name' } })
          .expect(200);

        const outputRule = getSimpleRuleOutput();
        outputRule.name = 'some other name';
        outputRule.timeline_title = 'some title';
        outputRule.timeline_id = 'some id';
        outputRule.revision = 2;
        const expectedRule = updateUsername(outputRule, await utils.getUsername());

        const bodyToCompare = removeServerGeneratedProperties(body);
        expect(bodyToCompare).toEqual(expectedRule);
      });

      it('should give a 404 if it is given a fake id', async () => {
        const { body } = await detectionsApi
          .patchRule({
            body: { id: '5096dec6-b6b9-4d8d-8f93-6c2602079d9d', name: 'some other name' },
          })
          .expect(404);

        expect(body).toEqual({
          status_code: 404,
          message: 'id: "5096dec6-b6b9-4d8d-8f93-6c2602079d9d" not found',
        });
      });

      it('should give a 404 if it is given a fake rule_id', async () => {
        const { body } = await detectionsApi
          .patchRule({ body: { rule_id: 'fake_id', name: 'some other name' } })
          .expect(404);

        expect(body).toEqual({
          status_code: 404,
          message: 'rule_id: "fake_id" not found',
        });
      });

      describe('max signals', () => {
        it('does NOT patch a rule when max_signals is less than 1', async () => {
          await detectionsApi.createRule({
            body: getCustomQueryRuleParams({ rule_id: 'rule-1', max_signals: 100 }),
          });

          const { body } = await detectionsApi
            .patchRule({
              body: {
                rule_id: 'rule-1',
                max_signals: 0,
              },
            })
            .expect(400);

          expect(body.message).toEqual(
            '[request body]: max_signals: Too small: expected number to be >=1'
          );
        });
      });

      it('should not change required_fields when not present in patch body', async () => {
        await detectionsApi.createRule({
          body: getCustomQueryRuleParams({
            rule_id: 'rule-1',
            required_fields: [
              {
                name: 'event.action',
                type: 'keyword',
              },
            ],
          }),
        });

        // patch a simple rule's name
        const { body: patchedRule } = await detectionsApi
          .patchRule({ body: { rule_id: 'rule-1', name: 'some other name' } })
          .expect(200);

        expect(patchedRule.required_fields).toEqual([
          {
            name: 'event.action',
            type: 'keyword',
            ecs: true,
          },
        ]);
      });
    });
  });
};
