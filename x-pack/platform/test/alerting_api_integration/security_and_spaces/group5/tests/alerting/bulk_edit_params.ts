/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from 'expect';
import { RULE_SAVED_OBJECT_TYPE } from '@kbn/alerting-plugin/server';
import type { SavedObject } from '@kbn/core-saved-objects-server';
import { ALERTING_CASES_SAVED_OBJECT_INDEX } from '@kbn/core-saved-objects-server';
import type { RawRule } from '@kbn/alerting-plugin/server/types';
import { ES_TEST_INDEX_NAME } from '@kbn/alerting-api-integration-helpers';
import { getAlwaysFiringInternalRule } from '../../../../common/lib/alert_utils';
import {
  DefaultSpace,
  GlobalReadAtSpace1,
  RulesReadExceptionsAll,
  Space1AllAtSpace1,
  Superuser,
} from '../../../scenarios';
import { checkAAD, getTestRuleData, getUrlPrefix, ObjectRemover } from '../../../../common/lib';
import type { FtrProviderContext } from '../../../../common/ftr_provider_context';
import { AlertUtils } from '../../../../common/lib';

export default function createBulkEditRuleParamsWithReadAuthTests({
  getService,
}: FtrProviderContext) {
  const spaceId = GlobalReadAtSpace1.space.id;
  const supertest = getService('supertest');
  const es = getService('es');
  const supertestWithoutAuth = getService('supertestWithoutAuth');
  const objectRemover = new ObjectRemover(supertest);

  async function createDetectionRule({
    actions,
    spaceIdToBeCreatedIn = spaceId,
    tags = [],
  }: { actions?: any[]; spaceIdToBeCreatedIn?: string; tags?: string[] } = {}): Promise<string> {
    // create a detection rule to be updated
    const response = await supertest
      .post(`${getUrlPrefix(spaceIdToBeCreatedIn)}/api/alerting/rule`)
      .set('kbn-xsrf', 'foo')
      .send({
        enabled: true,
        name: 'test siem query rule',
        tags: tags ?? [],
        rule_type_id: 'siem.queryRule',
        consumer: 'siem',
        schedule: { interval: '24h' },
        actions: actions ?? [],
        params: {
          author: [],
          description: 'test',
          falsePositives: [],
          from: 'now-86460s',
          note: 'investigate me!',
          investigationFields: { field_names: ['field-1', 'field-2', 'field-3'] },
          ruleId: '31c54f10-9d3b-45a8-b064-b92e8c6fcbe7',
          immutable: false,
          license: '',
          outputIndex: '',
          meta: {
            from: '1m',
            kibana_siem_app_url: 'https://localhost:5601/app/security',
          },
          maxSignals: 20,
          riskScore: 21,
          riskScoreMapping: [],
          severity: 'low',
          severityMapping: [],
          threat: [],
          to: 'now',
          references: [],
          version: 1,
          exceptionsList: [
            { id: '2', list_id: '123', namespace_type: 'single', type: 'rule_default' },
          ],
          relatedIntegrations: [],
          requiredFields: [],
          setup: '',
          type: 'query',
          language: 'kuery',
          index: ['test-index'],
          query: ``,
          filters: [],
        },
      })
      .expect(200);

    const ruleId = response.body.id;
    objectRemover.add(spaceIdToBeCreatedIn, ruleId, 'rule', 'alerting');
    return ruleId;
  }

  describe('bulkEditRuleParamsWithReadAuth', () => {
    const alertUtils = new AlertUtils({
      user: GlobalReadAtSpace1.user,
      space: GlobalReadAtSpace1.space,
      supertestWithoutAuth,
    });

    afterEach(async () => {
      await objectRemover.removeAll();
    });

    it('should bulk edit rule exceptions list param when user has read rule privilege', async () => {
      const ruleId = await createDetectionRule();
      // Get the rule from ES
      const rawRuleBefore = await es.get<SavedObject<RawRule>>({
        index: ALERTING_CASES_SAVED_OBJECT_INDEX,
        id: `alert:${ruleId}`,
      });

      const {
        body: { apiKey: originalApiKey },
      } = await alertUtils.getAPIKeyRequest(ruleId);

      expect((rawRuleBefore._source as any)?.alert.createdBy).toEqual('elastic');
      expect((rawRuleBefore._source as any)?.alert.updatedBy).toEqual('elastic');
      expect((rawRuleBefore._source as any)?.alert.apiKeyOwner).toEqual('elastic');

      expect((rawRuleBefore._source as any)?.alert.params.exceptionsList).toEqual([
        { id: '2', list_id: '123', type: 'rule_default', namespace_type: 'single' },
      ]);

      expect((rawRuleBefore._source as any).references).toEqual([
        { name: 'param:exceptionsList_0', id: '2', type: 'exception-list' },
      ]);

      // update the rule
      const response = await supertestWithoutAuth
        .post(`${getUrlPrefix(spaceId)}/api/alerting_fixture/_bulk_edit_params`)
        .set('kbn-xsrf', 'foo')
        .auth(RulesReadExceptionsAll.username, RulesReadExceptionsAll.password)
        .send({
          ids: [ruleId],
          operations: [
            {
              operation: 'set',
              field: 'exceptionsList',
              value: [
                { id: '1', list_id: 'xyz', namespace_type: 'single', type: 'rule_default' },
                { id: '2', list_id: '123', namespace_type: 'single', type: 'rule_default' },
              ],
            },
          ],
        })
        .expect(200);

      expect(response.body.total).toEqual(1);
      expect(response.body.errors).toEqual([]);
      expect(response.body.skipped).toEqual([]);
      expect(response.body.rules.length).toEqual(1);

      // Get the rule from ES
      const rawRuleAfter = await es.get<SavedObject<RawRule>>({
        index: ALERTING_CASES_SAVED_OBJECT_INDEX,
        id: `alert:${ruleId}`,
      });

      expect((rawRuleAfter._source as any)?.alert.createdBy).toEqual('elastic');
      expect((rawRuleAfter._source as any)?.alert.updatedBy).toEqual('rules_read_exceptions_all');
      expect((rawRuleAfter._source as any)?.alert.apiKeyOwner).toEqual('elastic');

      expect((rawRuleAfter._source as any)?.alert.params.exceptionsList).toEqual([
        { id: '1', list_id: 'xyz', namespace_type: 'single', type: 'rule_default' },
        { id: '2', list_id: '123', namespace_type: 'single', type: 'rule_default' },
      ]);

      expect((rawRuleAfter._source as any).references).toEqual([
        { name: 'param:exceptionsList_0', id: '1', type: 'exception-list' },
        { name: 'param:exceptionsList_1', id: '2', type: 'exception-list' },
      ]);

      // check that API key is unchanged
      const {
        body: { apiKey },
      } = await alertUtils.getAPIKeyRequest(ruleId);
      expect(apiKey).toEqual(originalApiKey);

      // Ensure AAD isn't broken
      await checkAAD({ supertest, spaceId, type: RULE_SAVED_OBJECT_TYPE, id: ruleId });
    });

    it('should bulk edit rule exceptions list param when user has all rule privilege', async () => {
      const ruleId = await createDetectionRule();

      // Get the rule from ES
      const rawRuleBefore = await es.get<SavedObject<RawRule>>({
        index: ALERTING_CASES_SAVED_OBJECT_INDEX,
        id: `alert:${ruleId}`,
      });

      const {
        body: { apiKey: originalApiKey },
      } = await alertUtils.getAPIKeyRequest(ruleId);

      expect((rawRuleBefore._source as any)?.alert.createdBy).toEqual('elastic');
      expect((rawRuleBefore._source as any)?.alert.updatedBy).toEqual('elastic');
      expect((rawRuleBefore._source as any)?.alert.apiKeyOwner).toEqual('elastic');

      expect((rawRuleBefore._source as any)?.alert.params.exceptionsList).toEqual([
        { id: '2', list_id: '123', namespace_type: 'single', type: 'rule_default' },
      ]);

      expect((rawRuleBefore._source as any).references).toEqual([
        { name: 'param:exceptionsList_0', id: '2', type: 'exception-list' },
      ]);

      // update the rule
      const response = await supertestWithoutAuth
        .post(`${getUrlPrefix(spaceId)}/api/alerting_fixture/_bulk_edit_params`)
        .set('kbn-xsrf', 'foo')
        .auth(Space1AllAtSpace1.user.username, Space1AllAtSpace1.user.password)
        .send({
          ids: [ruleId],
          operations: [
            {
              operation: 'set',
              field: 'exceptionsList',
              value: [
                { id: '1', list_id: 'xyz', namespace_type: 'single', type: 'rule_default' },
                { id: '2', list_id: '123', namespace_type: 'single', type: 'rule_default' },
              ],
            },
          ],
        })
        .expect(200);

      expect(response.body.total).toEqual(1);
      expect(response.body.errors).toEqual([]);
      expect(response.body.skipped).toEqual([]);
      expect(response.body.rules.length).toEqual(1);

      // Get the rule from ES
      const rawRuleAfter = await es.get<SavedObject<RawRule>>({
        index: ALERTING_CASES_SAVED_OBJECT_INDEX,
        id: `alert:${ruleId}`,
      });

      expect((rawRuleAfter._source as any)?.alert.createdBy).toEqual('elastic');
      expect((rawRuleAfter._source as any)?.alert.updatedBy).toEqual('space_1_all');
      expect((rawRuleAfter._source as any)?.alert.apiKeyOwner).toEqual('elastic');

      expect((rawRuleAfter._source as any)?.alert.params.exceptionsList).toEqual([
        { id: '1', list_id: 'xyz', namespace_type: 'single', type: 'rule_default' },
        { id: '2', list_id: '123', namespace_type: 'single', type: 'rule_default' },
      ]);

      expect((rawRuleAfter._source as any).references).toEqual([
        { name: 'param:exceptionsList_0', id: '1', type: 'exception-list' },
        { name: 'param:exceptionsList_1', id: '2', type: 'exception-list' },
      ]);

      // check that API key is unchanged
      const {
        body: { apiKey },
      } = await alertUtils.getAPIKeyRequest(ruleId);
      expect(apiKey).toEqual(originalApiKey);

      // Ensure AAD isn't broken
      await checkAAD({ supertest, spaceId, type: RULE_SAVED_OBJECT_TYPE, id: ruleId });
    });

    it('should return an error when the user cannot edit the rule exceptions list', async () => {
      const ruleId = await createDetectionRule();

      // global_read has rule read access but not the exceptions sub-feature, so the
      // rule type's params authorizer rejects the exception list edit.
      const response = await supertestWithoutAuth
        .post(`${getUrlPrefix(spaceId)}/api/alerting_fixture/_bulk_edit_params`)
        .set('kbn-xsrf', 'foo')
        .auth(GlobalReadAtSpace1.user.username, GlobalReadAtSpace1.user.password)
        .send({
          ids: [ruleId],
          operations: [
            {
              operation: 'set',
              field: 'exceptionsList',
              value: [{ id: '1', list_id: 'xyz', namespace_type: 'single', type: 'rule_default' }],
            },
          ],
        })
        .expect(200);

      expect(response.body.total).toEqual(1);
      expect(response.body.skipped).toEqual([]);
      expect(response.body.rules).toEqual([]);
      expect(response.body.errors.length).toEqual(1);
      expect(response.body.errors[0].message).toEqual(
        'The current user does not have the permissions to edit the following fields: exceptions_list'
      );
    });

    it('should handle bulk editing exceptionsLists in multiple rules', async () => {
      const ruleId1 = await createDetectionRule();
      const ruleId2 = await createDetectionRule();

      // Get the rules from ES
      const results = await Promise.all([
        es.get<SavedObject<RawRule>>({
          index: ALERTING_CASES_SAVED_OBJECT_INDEX,
          id: `alert:${ruleId1}`,
        }),
        es.get<SavedObject<RawRule>>({
          index: ALERTING_CASES_SAVED_OBJECT_INDEX,
          id: `alert:${ruleId2}`,
        }),
      ]);

      const {
        body: { apiKey: originalApiKey1 },
      } = await alertUtils.getAPIKeyRequest(ruleId1);
      const {
        body: { apiKey: originalApiKey2 },
      } = await alertUtils.getAPIKeyRequest(ruleId2);

      results.forEach((rawRule) => {
        expect((rawRule._source as any)?.alert.createdBy).toEqual('elastic');
        expect((rawRule._source as any)?.alert.updatedBy).toEqual('elastic');
        expect((rawRule._source as any)?.alert.apiKeyOwner).toEqual('elastic');

        expect((rawRule._source as any)?.alert.params.exceptionsList).toEqual([
          { id: '2', list_id: '123', namespace_type: 'single', type: 'rule_default' },
        ]);

        expect((rawRule._source as any).references).toEqual([
          { name: 'param:exceptionsList_0', id: '2', type: 'exception-list' },
        ]);
      });

      // update the rules
      const response = await supertestWithoutAuth
        .post(`${getUrlPrefix(spaceId)}/api/alerting_fixture/_bulk_edit_params`)
        .set('kbn-xsrf', 'foo')
        .auth(RulesReadExceptionsAll.username, RulesReadExceptionsAll.password)
        .send({
          ids: [ruleId1, ruleId2],
          operations: [
            {
              operation: 'set',
              field: 'exceptionsList',
              value: [
                { id: '1', list_id: 'xyz', namespace_type: 'single', type: 'rule_default' },
                { id: '2', list_id: '123', namespace_type: 'single', type: 'rule_default' },
              ],
            },
          ],
        })
        .expect(200);

      expect(response.body.total).toEqual(2);
      expect(response.body.errors).toEqual([]);
      expect(response.body.skipped).toEqual([]);
      expect(response.body.rules.length).toEqual(2);

      // Get the rules from ES
      const resultsAfter = await Promise.all([
        es.get<SavedObject<RawRule>>({
          index: ALERTING_CASES_SAVED_OBJECT_INDEX,
          id: `alert:${ruleId1}`,
        }),
        es.get<SavedObject<RawRule>>({
          index: ALERTING_CASES_SAVED_OBJECT_INDEX,
          id: `alert:${ruleId2}`,
        }),
      ]);

      resultsAfter.forEach((rawRuleAfter) => {
        expect((rawRuleAfter._source as any)?.alert.createdBy).toEqual('elastic');
        expect((rawRuleAfter._source as any)?.alert.updatedBy).toEqual('rules_read_exceptions_all');
        expect((rawRuleAfter._source as any)?.alert.apiKeyOwner).toEqual('elastic');

        expect((rawRuleAfter._source as any)?.alert.params.exceptionsList).toEqual([
          { id: '1', list_id: 'xyz', namespace_type: 'single', type: 'rule_default' },
          { id: '2', list_id: '123', namespace_type: 'single', type: 'rule_default' },
        ]);

        expect((rawRuleAfter._source as any).references).toEqual([
          { name: 'param:exceptionsList_0', id: '1', type: 'exception-list' },
          { name: 'param:exceptionsList_1', id: '2', type: 'exception-list' },
        ]);
      });

      // check that API key is unchanged
      const {
        body: { apiKey: apiKey1 },
      } = await alertUtils.getAPIKeyRequest(ruleId1);
      const {
        body: { apiKey: apiKey2 },
      } = await alertUtils.getAPIKeyRequest(ruleId2);
      expect(apiKey1).toEqual(originalApiKey1);
      expect(apiKey2).toEqual(originalApiKey2);

      // Ensure AAD isn't broken
      await checkAAD({ supertest, spaceId, type: RULE_SAVED_OBJECT_TYPE, id: ruleId1 });
      await checkAAD({ supertest, spaceId, type: RULE_SAVED_OBJECT_TYPE, id: ruleId2 });
    });

    it('should handle bulk editing rules where exceptionLists is not a valid parameter', async () => {
      const { body: createdRule } = await supertest
        .post(`${getUrlPrefix(spaceId)}/api/alerting/rule`)
        .set('kbn-xsrf', 'foo')
        .send(
          getTestRuleData({
            rule_type_id: 'test.always-firing-alert-as-data',
            schedule: { interval: '24h' },
            throttle: undefined,
            notify_when: undefined,
            params: { index: ES_TEST_INDEX_NAME, reference: 'test' },
          })
        )
        .expect(200);
      objectRemover.add(spaceId, createdRule.id, 'rule', 'alerting');

      // update the rules
      const response = await supertestWithoutAuth
        .post(`${getUrlPrefix(spaceId)}/api/alerting_fixture/_bulk_edit_params`)
        .set('kbn-xsrf', 'foo')
        .auth(RulesReadExceptionsAll.username, RulesReadExceptionsAll.password)
        .send({
          ids: [createdRule.id],
          operations: [
            {
              operation: 'set',
              field: 'exceptionsList',
              value: [
                { id: '1', list_id: 'xyz', namespace_type: 'single', type: 'rule_default' },
                { id: '2', list_id: '123', namespace_type: 'single', type: 'rule_default' },
              ],
            },
          ],
        })
        .expect(200);

      expect(response.body.total).toEqual(1);
      expect(response.body.errors.length).toEqual(1);
      expect(response.body.errors[0].message).toEqual(
        `params invalid: [exceptionsList]: Additional properties are not allowed ('exceptionsList' was unexpected)`
      );
      expect(response.body.skipped).toEqual([]);
      expect(response.body.rules).toEqual([]);
    });

    it('should handle bulk editing rules where exceptionLists value is invalid', async () => {
      const ruleId = await createDetectionRule();

      // update the rules
      const response = await supertestWithoutAuth
        .post(`${getUrlPrefix(spaceId)}/api/alerting_fixture/_bulk_edit_params`)
        .set('kbn-xsrf', 'foo')
        .auth(RulesReadExceptionsAll.username, RulesReadExceptionsAll.password)
        .send({
          ids: [ruleId],
          operations: [
            {
              operation: 'set',
              field: 'exceptionsList',
              value: 'some invalid value',
            },
          ],
        })
        .expect(200);

      expect(response.body.total).toEqual(1);
      expect(response.body.errors.length).toEqual(1);
      expect(response.body.errors[0].message).toEqual(
        `params invalid: [
  {
    "expected": "array",
    "code": "invalid_type",
    "path": [
      "exceptionsList"
    ],
    "message": "Invalid input: expected array, received string"
  }
]`
      );
      expect(response.body.skipped).toEqual([]);
      expect(response.body.rules).toEqual([]);
    });

    it('should handle extracting exceptionsList references with actions', async () => {
      const { body: createdConnector } = await supertest
        .post(`${getUrlPrefix(spaceId)}/api/actions/connector`)
        .set('kbn-xsrf', 'foo')
        .send({ name: 'MY action', connector_type_id: 'test.noop', config: {}, secrets: {} })
        .expect(200);
      objectRemover.add(spaceId, createdConnector.id, 'connector', 'actions');

      const ruleId = await createDetectionRule({
        actions: [
          {
            id: createdConnector.id,
            group: 'default',
            params: {},
            frequency: { summary: false, notify_when: 'onActiveAlert' },
          },
        ],
      });

      // Get the rule from ES
      const rawRuleBefore = await es.get<SavedObject<RawRule>>({
        index: ALERTING_CASES_SAVED_OBJECT_INDEX,
        id: `alert:${ruleId}`,
      });

      const {
        body: { apiKey: originalApiKey },
      } = await alertUtils.getAPIKeyRequest(ruleId);

      expect((rawRuleBefore._source as any)?.alert.createdBy).toEqual('elastic');
      expect((rawRuleBefore._source as any)?.alert.updatedBy).toEqual('elastic');
      expect((rawRuleBefore._source as any)?.alert.apiKeyOwner).toEqual('elastic');

      expect((rawRuleBefore._source as any)?.alert.actions).toEqual([
        {
          group: 'default',
          params: {},
          frequency: { summary: false, throttle: null, notifyWhen: 'onActiveAlert' },
          uuid: expect.any(String),
          actionRef: 'action_0',
          actionTypeId: 'test.noop',
        },
      ]);

      expect((rawRuleBefore._source as any)?.alert.params.exceptionsList).toEqual([
        { id: '2', list_id: '123', type: 'rule_default', namespace_type: 'single' },
      ]);

      expect((rawRuleBefore._source as any).references).toEqual([
        { id: createdConnector.id, name: 'action_0', type: 'action' },
        { name: 'param:exceptionsList_0', id: '2', type: 'exception-list' },
      ]);

      // update the rule
      const response = await supertestWithoutAuth
        .post(`${getUrlPrefix(spaceId)}/api/alerting_fixture/_bulk_edit_params`)
        .set('kbn-xsrf', 'foo')
        .auth(RulesReadExceptionsAll.username, RulesReadExceptionsAll.password)
        .send({
          ids: [ruleId],
          operations: [
            {
              operation: 'set',
              field: 'exceptionsList',
              value: [
                { id: '1', list_id: 'xyz', namespace_type: 'single', type: 'rule_default' },
                { id: '2', list_id: '123', namespace_type: 'single', type: 'rule_default' },
              ],
            },
          ],
        })
        .expect(200);

      expect(response.body.total).toEqual(1);
      expect(response.body.errors).toEqual([]);
      expect(response.body.skipped).toEqual([]);
      expect(response.body.rules.length).toEqual(1);

      // Get the rule from ES
      const rawRuleAfter = await es.get<SavedObject<RawRule>>({
        index: ALERTING_CASES_SAVED_OBJECT_INDEX,
        id: `alert:${ruleId}`,
      });

      expect((rawRuleAfter._source as any)?.alert.createdBy).toEqual('elastic');
      expect((rawRuleAfter._source as any)?.alert.updatedBy).toEqual('rules_read_exceptions_all');
      expect((rawRuleAfter._source as any)?.alert.apiKeyOwner).toEqual('elastic');

      expect((rawRuleBefore._source as any)?.alert.actions).toEqual([
        {
          group: 'default',
          params: {},
          frequency: { summary: false, throttle: null, notifyWhen: 'onActiveAlert' },
          uuid: expect.any(String),
          actionRef: 'action_0',
          actionTypeId: 'test.noop',
        },
      ]);

      expect((rawRuleAfter._source as any)?.alert.params.exceptionsList).toEqual([
        { id: '1', list_id: 'xyz', namespace_type: 'single', type: 'rule_default' },
        { id: '2', list_id: '123', namespace_type: 'single', type: 'rule_default' },
      ]);

      expect((rawRuleAfter._source as any).references).toEqual([
        { id: createdConnector.id, name: 'action_0', type: 'action' },
        { name: 'param:exceptionsList_0', id: '1', type: 'exception-list' },
        { name: 'param:exceptionsList_1', id: '2', type: 'exception-list' },
      ]);

      // check that API key is unchanged
      const {
        body: { apiKey },
      } = await alertUtils.getAPIKeyRequest(ruleId);
      expect(apiKey).toEqual(originalApiKey);

      // Ensure AAD isn't broken
      await checkAAD({ supertest, spaceId, type: RULE_SAVED_OBJECT_TYPE, id: ruleId });
    });

    describe('internally managed rule types', () => {
      const rulePayload = getAlwaysFiringInternalRule();

      const payloadWithFilter = {
        filter: `alert.attributes.tags: "internally-managed"`,
        operations: [
          {
            operation: 'set',
            field: 'exceptionsList',
            value: [{ id: 'new', list_id: 'foo', namespace_type: 'single', type: 'rule_default' }],
          },
        ],
      };

      const alertUtilsSuperUser = new AlertUtils({
        user: Superuser,
        space: DefaultSpace,
        supertestWithoutAuth: supertest,
      });

      it('should ignore internal rule types when trying to bulk update using the filter param', async () => {
        const { body: internalRuleType } = await supertest
          .post('/api/alerts_fixture/rule/internally_managed')
          .set('kbn-xsrf', 'foo')
          .send({ ...rulePayload, tags: ['internally-managed'] })
          .expect(200);

        const nonInternalRuleTypeId = await createDetectionRule({
          spaceIdToBeCreatedIn: 'default',
          tags: ['internally-managed'],
        });

        await supertest
          .post('/api/alerting_fixture/_bulk_edit_params')
          .set('kbn-xsrf', 'foo')
          .send(payloadWithFilter)
          .expect(200);

        const { body: updatedInternalRuleType } = await supertest
          .get(`/api/alerting/rule/${internalRuleType.id}`)
          .set('kbn-xsrf', 'foo')
          .expect(200);

        const { body: updatedNonInternalRuleType } = await supertest
          .get(`/api/alerting/rule/${nonInternalRuleTypeId}`)
          .set('kbn-xsrf', 'foo')
          .expect(200);

        expect(updatedInternalRuleType.params).toEqual({});
        expect(updatedNonInternalRuleType.params.exceptionsList).toEqual([
          { id: 'new', list_id: 'foo', namespace_type: 'single', type: 'rule_default' },
        ]);

        const res = await alertUtilsSuperUser.deleteInternallyManagedRule(internalRuleType.id);

        expect(res.statusCode).toEqual(200);
      });
    });
  });
}
