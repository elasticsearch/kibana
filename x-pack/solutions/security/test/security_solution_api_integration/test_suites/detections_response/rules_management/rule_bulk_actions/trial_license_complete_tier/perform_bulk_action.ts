/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from 'expect';
import { v4 as uuidV4 } from 'uuid';
import {
  DETECTION_ENGINE_RULES_BULK_ACTION,
  DETECTION_ENGINE_RULES_URL,
  MAX_MANUAL_RULE_RUN_LOOKBACK_WINDOW_DAYS,
  NOTIFICATION_THROTTLE_RULE,
} from '@kbn/security-solution-plugin/common/constants';
import {
  BulkActionTypeEnum,
  BulkActionEditTypeEnum,
} from '@kbn/security-solution-plugin/common/api/detection_engine/rule_management';
import { getCreateExceptionListDetectionSchemaMock } from '@kbn/lists-plugin/common/schemas/request/create_exception_list_schema.mock';
import { EXCEPTION_LIST_ITEM_URL, EXCEPTION_LIST_URL } from '@kbn/securitysolution-list-constants';
import { getCreateExceptionListItemMinimalSchemaMock } from '@kbn/lists-plugin/common/schemas/request/create_exception_list_item_schema.mock';
import { AuthType } from '@kbn/connector-schemas/common/auth/constants';
import type { BaseDefaultableFields } from '@kbn/security-solution-plugin/common/api/detection_engine';
import { ROLES } from '@kbn/security-solution-plugin/common/test';
import moment from 'moment';
import { createRule, deleteAllRules } from '@kbn/detections-response-ftr-services';
import { getGapsByRuleId } from '@kbn/detections-response-ftr-services/rules/get_gaps_by_rule_id';
import { gapFillStatus } from '@kbn/alerting-plugin/common';
import type TestAgent from 'supertest/lib/agent';
import type { FtrProviderContext } from '../../../../../ftr_provider_context';
import { createSupertestErrorLogger } from '../../../../edr_workflows/utils';
import { ROLE } from '../../../../../config/services/security_solution_edr_workflows_roles_users';
import {
  binaryToString,
  getSimpleMlRule,
  getCustomQueryRuleParams,
  getSimpleRule,
  getSimpleRuleOutput,
  getSlackAction,
  getWebHookAction,
  installMockPrebuiltRules,
  removeServerGeneratedProperties,
  updateUsername,
} from '../../../utils';
import { deleteAllExceptions } from '../../../../lists_and_exception_lists/utils';
import { createUserAndRole, deleteUserAndRole } from '../../../../../config/services/common';

import { deleteAllGaps } from '../../../utils/event_log/delete_all_gaps';
import type { GapEvent } from '../../../utils/event_log/generate_gaps_for_rule';
import { generateGapsForRule } from '../../../utils/event_log/generate_gaps_for_rule';

export default ({ getService }: FtrProviderContext): void => {
  const supertest = getService('supertest');
  const detectionsApi = getService('detectionsApi');
  const es = getService('es');
  const log = getService('log');
  const esArchiver = getService('esArchiver');
  const utils = getService('securitySolutionUtils');
  const rolesUsersProvider = getService('rolesUsersProvider');
  const retry = getService('retry');

  const EVENT_LOG_DATA_STREAM = '.kibana-event-log-ds';

  const countSoftDeletedGaps = async (ruleId: string): Promise<number> => {
    await es.indices.refresh({ index: EVENT_LOG_DATA_STREAM });
    const { count } = await es.count({
      index: EVENT_LOG_DATA_STREAM,
      query: {
        bool: {
          must: [
            { term: { 'event.action': 'gap' } },
            { term: { 'event.provider': 'alerting' } },
            { term: { 'rule.id': ruleId } },
            { term: { 'kibana.alert.rule.gap.deleted': true } },
          ],
        },
      },
    });
    return count;
  };

  const countActiveGaps = async (ruleId: string): Promise<number> => {
    await es.indices.refresh({ index: EVENT_LOG_DATA_STREAM });
    const { count } = await es.count({
      index: EVENT_LOG_DATA_STREAM,
      query: {
        bool: {
          must: [
            { term: { 'event.action': 'gap' } },
            { term: { 'event.provider': 'alerting' } },
            { term: { 'rule.id': ruleId } },
          ],
          must_not: [{ term: { 'kibana.alert.rule.gap.deleted': true } }],
        },
      },
    });
    return count;
  };

  const postBulkAction = () =>
    supertest
      .post(DETECTION_ENGINE_RULES_BULK_ACTION)
      .set('kbn-xsrf', 'true')
      .set('elastic-api-version', '2023-10-31');

  const fetchRule = (ruleId: string) =>
    supertest
      .get(`${DETECTION_ENGINE_RULES_URL}?rule_id=${ruleId}`)
      .set('kbn-xsrf', 'true')
      .set('elastic-api-version', '2023-10-31');

  const fetchPrebuiltRule = async () => {
    const { body: findBody } = await supertest
      .get(
        `${DETECTION_ENGINE_RULES_URL}/_find?per_page=1&filter=alert.attributes.params.immutable: true`
      )
      .set('kbn-xsrf', 'true')
      .set('elastic-api-version', '2023-10-31');

    return findBody.data[0];
  };

  /**
   * allows to get access to internal property: notifyWhen
   */
  const fetchRuleByAlertApi = (ruleId: string) =>
    supertest.get(`/api/alerting/rule/${ruleId}`).set('kbn-xsrf', 'true');

  const createConnector = async (payload: Record<string, unknown>) =>
    (
      await supertest
        .post('/api/actions/connector')
        .set('kbn-xsrf', 'true')
        .send(payload)
        .expect(200)
    ).body;

  const createWebHookConnector = () => createConnector(getWebHookAction());
  const createSlackConnector = () => createConnector(getSlackAction());

  describe('@ess @serverless perform_bulk_action', () => {
    beforeEach(async () => {
      await deleteAllRules(supertest, log);
      await esArchiver.load('x-pack/platform/test/fixtures/es_archives/auditbeat/hosts');
    });

    afterEach(async () => {
      await esArchiver.unload('x-pack/platform/test/fixtures/es_archives/auditbeat/hosts');
    });

    it('should export rules', async () => {
      const mockRule = getCustomQueryRuleParams();

      await detectionsApi.createRule({ body: mockRule });

      const { body } = await postBulkAction()
        .send({ query: '', action: BulkActionTypeEnum.export })
        .expect(200)
        .expect('Content-Type', 'application/ndjson')
        .expect('Content-Disposition', 'attachment; filename="rules_export.ndjson"')
        .parse(binaryToString);

      const [ruleJson, exportDetailsJson] = body.toString().split(/\n/);

      expect(JSON.parse(ruleJson)).toMatchObject(mockRule);
      expect(JSON.parse(exportDetailsJson)).toEqual({
        exported_exception_list_count: 0,
        exported_exception_list_item_count: 0,
        exported_count: 1,
        exported_rules_count: 1,
        missing_exception_list_item_count: 0,
        missing_exception_list_items: [],
        missing_exception_lists: [],
        missing_exception_lists_count: 0,
        missing_rules: [],
        missing_rules_count: 0,
        excluded_action_connection_count: 0,
        excluded_action_connections: [],
        exported_action_connector_count: 0,
        missing_action_connection_count: 0,
        missing_action_connections: [],
      });
    });

    it('should export rules with defaultable fields when values are set', async () => {
      const defaultableFields: BaseDefaultableFields = {
        related_integrations: [
          { package: 'package-a', version: '^1.2.3' },
          { package: 'package-b', integration: 'integration-b', version: '~1.1.1' },
        ],
        max_signals: 100,
        setup: '# some setup markdown',
        required_fields: [
          { name: '@timestamp', type: 'date' },
          { name: 'my-non-ecs-field', type: 'keyword' },
        ],
      };
      const mockRule = getCustomQueryRuleParams(defaultableFields);

      await detectionsApi.createRule({ body: mockRule });

      const { body } = await detectionsApi
        .performRulesBulkAction({
          query: {},
          body: {
            action: BulkActionTypeEnum.export,
          },
        })
        .expect(200)
        .expect('Content-Type', 'application/ndjson')
        .expect('Content-Disposition', 'attachment; filename="rules_export.ndjson"')
        .parse(binaryToString);

      const [ruleJson] = body.toString().split(/\n/);

      expect(JSON.parse(ruleJson)).toMatchObject(defaultableFields);
    });

    it('should export rules with actions connectors', async () => {
      // create new actions
      const webHookAction = await createWebHookConnector();

      const defaultRuleAction = {
        id: webHookAction.id,
        action_type_id: '.webhook',
        group: 'default',
        params: {
          body: '{"test":"a default action"}',
        },
      };

      const ruleId = 'rule-1';
      await createRule(supertest, log, {
        ...getSimpleRule(ruleId),
        actions: [defaultRuleAction],
      });
      const exportedConnectors = {
        attributes: {
          actionTypeId: '.webhook',
          config: {
            authType: AuthType.Basic,
            hasAuth: true,
            method: 'post',
            url: 'http://localhost',
          },
          isMissingSecrets: true,
          name: 'Some connector',
          secrets: {},
        },
        coreMigrationVersion: '8.7.0',
        id: webHookAction.id,
        migrationVersion: {
          action: '8.3.0',
        },
        references: [],
        type: 'action',
      };

      const { body } = await postBulkAction()
        .send({ query: '', action: BulkActionTypeEnum.export })
        .expect(200)
        .expect('Content-Type', 'application/ndjson')
        .expect('Content-Disposition', 'attachment; filename="rules_export.ndjson"')
        .parse(binaryToString);

      const [ruleJson, connectorsJson, exportDetailsJson] = body.toString().split(/\n/);

      const rule = removeServerGeneratedProperties(JSON.parse(ruleJson));
      const expectedRule = updateUsername(getSimpleRuleOutput(), await utils.getUsername());

      expect(rule).toEqual({
        ...expectedRule,
        actions: [
          {
            action_type_id: '.webhook',
            group: 'default',
            id: webHookAction.id,
            params: {
              body: '{"test":"a default action"}',
            },
            uuid: rule.actions[0].uuid,
            frequency: { summary: true, throttle: null, notifyWhen: 'onActiveAlert' },
          },
        ],
      });
      const { attributes, id, type } = JSON.parse(connectorsJson);
      expect(attributes.actionTypeId).toEqual(exportedConnectors.attributes.actionTypeId);
      expect(id).toEqual(exportedConnectors.id);
      expect(type).toEqual(exportedConnectors.type);
      expect(attributes.name).toEqual(exportedConnectors.attributes.name);
      expect(attributes.secrets).toEqual(exportedConnectors.attributes.secrets);
      expect(attributes.isMissingSecrets).toEqual(exportedConnectors.attributes.isMissingSecrets);
      const exportDetails = JSON.parse(exportDetailsJson);
      expect(exportDetails).toEqual({
        exported_exception_list_count: 0,
        exported_exception_list_item_count: 0,
        exported_count: 2,
        exported_rules_count: 1,
        missing_exception_list_item_count: 0,
        missing_exception_list_items: [],
        missing_exception_lists: [],
        missing_exception_lists_count: 0,
        missing_rules: [],
        missing_rules_count: 0,
        excluded_action_connection_count: 0,
        excluded_action_connections: [],
        exported_action_connector_count: 1,
        missing_action_connection_count: 0,
        missing_action_connections: [],
      });
    });

    it('should delete rules', async () => {
      const ruleId = 'ruleId';
      const testRule = getSimpleRule(ruleId);
      await createRule(supertest, log, testRule);

      const { body } = await postBulkAction()
        .send({ query: '', action: BulkActionTypeEnum.delete })
        .expect(200);

      expect(body.attributes.summary).toEqual({ failed: 0, skipped: 0, succeeded: 1, total: 1 });

      // Check that the deleted rule is returned with the response
      expect(body.attributes.results.deleted[0].name).toEqual(testRule.name);

      // Check that the updates have been persisted
      await fetchRule(ruleId).expect(404);
    });

    it('should soft-delete gaps when deleting rules', async () => {
      const ruleId = 'ruleId';
      const createdRule = await createRule(supertest, log, getSimpleRule(ruleId));

      const { gapEvents } = await generateGapsForRule(
        es,
        { id: createdRule.id, name: createdRule.name },
        5
      );
      expect(gapEvents).toHaveLength(5);
      expect(await countActiveGaps(createdRule.id)).toBe(5);

      await postBulkAction().send({ query: '', action: BulkActionTypeEnum.delete }).expect(200);

      await fetchRule(ruleId).expect(404);

      // Gap soft-deletion is synchronous (a blocking update_by_query), so gaps are
      // updated by the time the API responds; retry only covers ES refresh visibility.
      await retry.tryForTime(30_000, async () => {
        expect(await countSoftDeletedGaps(createdRule.id)).toBe(5);
        expect(await countActiveGaps(createdRule.id)).toBe(0);
      });
    });

    it('should soft-delete gaps for every rule when bulk deleting multiple rules', async () => {
      const ruleA = await createRule(supertest, log, getSimpleRule('rule-a'));
      const ruleB = await createRule(supertest, log, getSimpleRule('rule-b'));

      await generateGapsForRule(es, { id: ruleA.id, name: ruleA.name }, 3);
      await generateGapsForRule(es, { id: ruleB.id, name: ruleB.name }, 4);
      expect(await countActiveGaps(ruleA.id)).toBe(3);
      expect(await countActiveGaps(ruleB.id)).toBe(4);

      await postBulkAction().send({ query: '', action: BulkActionTypeEnum.delete }).expect(200);

      await retry.tryForTime(30_000, async () => {
        expect(await countSoftDeletedGaps(ruleA.id)).toBe(3);
        expect(await countActiveGaps(ruleA.id)).toBe(0);
        expect(await countSoftDeletedGaps(ruleB.id)).toBe(4);
        expect(await countActiveGaps(ruleB.id)).toBe(0);
      });
    });

    it('should leave already soft-deleted gaps untouched and soft-delete the remaining ones', async () => {
      const createdRule = await createRule(supertest, log, getSimpleRule('rule-mixed'));

      const { gapEvents } = await generateGapsForRule(
        es,
        { id: createdRule.id, name: createdRule.name },
        5
      );
      expect(gapEvents).toHaveLength(5);

      // Pre-mark 2 of the 5 gaps as already soft-deleted.
      const alreadyDeletedIds = gapEvents.slice(0, 2).map((gap) => gap._id as string);
      await es.updateByQuery({
        index: EVENT_LOG_DATA_STREAM,
        refresh: true,
        conflicts: 'proceed',
        query: { ids: { values: alreadyDeletedIds } },
        script: {
          source: 'ctx._source.kibana.alert.rule.gap.deleted = true;',
          lang: 'painless',
        },
      });
      expect(await countSoftDeletedGaps(createdRule.id)).toBe(2);
      expect(await countActiveGaps(createdRule.id)).toBe(3);

      await postBulkAction().send({ query: '', action: BulkActionTypeEnum.delete }).expect(200);

      await retry.tryForTime(30_000, async () => {
        expect(await countSoftDeletedGaps(createdRule.id)).toBe(5);
        expect(await countActiveGaps(createdRule.id)).toBe(0);
      });
    });

    it('should duplicate rules', async () => {
      const ruleId = 'ruleId';
      const ruleToDuplicate = getCustomQueryRuleParams({
        rule_id: ruleId,
        max_signals: 100,
        setup: '# some setup markdown',
        related_integrations: [
          { package: 'package-a', version: '^1.2.3' },
          { package: 'package-b', integration: 'integration-b', version: '~1.1.1' },
        ],
      });

      await detectionsApi.createRule({ body: ruleToDuplicate });

      const { body } = await postBulkAction()
        .send({
          query: '',
          action: BulkActionTypeEnum.duplicate,
          duplicate: { include_exceptions: false, include_expired_exceptions: false },
        })
        .expect(200);

      expect(body.attributes.summary).toEqual({ failed: 0, skipped: 0, succeeded: 1, total: 1 });

      // Check that the duplicated rule is returned with the response
      expect(body.attributes.results.created[0].name).toEqual(
        `${ruleToDuplicate.name} [Duplicate]`
      );

      // Check that the updates have been persisted
      const { body: rulesResponse } = await detectionsApi.findRules({ query: {} });

      expect(rulesResponse.total).toEqual(2);

      const duplicatedRuleId = body.attributes.results.created[0].id;
      const { body: duplicatedRule } = await detectionsApi
        .readRule({
          query: { id: duplicatedRuleId },
        })
        .expect(200);

      expect(duplicatedRule).toMatchObject({
        ...ruleToDuplicate,
        name: `${ruleToDuplicate.name} [Duplicate]`,
        rule_id: expect.any(String),
      });
    });

    it('should duplicate rules with exceptions - expired exceptions included', async () => {
      await deleteAllExceptions(supertest, log);

      const expiredDate = new Date(Date.now() - 1000000).toISOString();

      // create an exception list
      const { body: exceptionList } = await supertest
        .post(EXCEPTION_LIST_URL)
        .set('kbn-xsrf', 'true')
        .send(getCreateExceptionListDetectionSchemaMock())
        .expect(200);
      // create an exception list item
      await supertest
        .post(EXCEPTION_LIST_ITEM_URL)
        .set('kbn-xsrf', 'true')
        .send({ ...getCreateExceptionListItemMinimalSchemaMock(), expire_time: expiredDate })
        .expect(200);

      const ruleId = 'ruleId';
      const ruleToDuplicate = {
        ...getSimpleRule(ruleId),
        exceptions_list: [
          {
            type: exceptionList.type,
            list_id: exceptionList.list_id,
            id: exceptionList.id,
            namespace_type: exceptionList.namespace_type,
          },
        ],
      };
      const newRule = await createRule(supertest, log, ruleToDuplicate);

      // add an exception item to the rule
      await supertest
        .post(`${DETECTION_ENGINE_RULES_URL}/${newRule.id}/exceptions`)
        .set('kbn-xsrf', 'true')
        .send({
          items: [
            {
              description: 'Exception item for rule default exception list',
              entries: [
                {
                  field: 'some.not.nested.field',
                  operator: 'included',
                  type: 'match',
                  value: 'some value',
                },
              ],
              name: 'Sample exception item',
              type: 'simple',
              expire_time: expiredDate,
            },
          ],
        })
        .expect(200);

      const { body } = await postBulkAction()
        .send({
          query: '',
          action: BulkActionTypeEnum.duplicate,
          duplicate: { include_exceptions: true, include_expired_exceptions: true },
        })
        .expect(200);

      const { body: foundItems } = await supertest
        .get(
          `${EXCEPTION_LIST_ITEM_URL}/_find?list_id=${body.attributes.results.created[0].exceptions_list[1].list_id}`
        )
        .set('kbn-xsrf', 'true')
        .send()
        .expect(200);

      // Item should have been duplicated, even if expired
      expect(foundItems.total).toEqual(1);

      expect(body.attributes.summary).toEqual({ failed: 0, skipped: 0, succeeded: 1, total: 1 });

      // Check that the duplicated rule is returned with the response
      expect(body.attributes.results.created[0].name).toEqual(
        `${ruleToDuplicate.name} [Duplicate]`
      );

      // Check that the exceptions are duplicated
      expect(body.attributes.results.created[0].exceptions_list).toEqual([
        {
          type: exceptionList.type,
          list_id: exceptionList.list_id,
          id: exceptionList.id,
          namespace_type: exceptionList.namespace_type,
        },
        {
          id: body.attributes.results.created[0].exceptions_list[1].id,
          list_id: body.attributes.results.created[0].exceptions_list[1].list_id,
          namespace_type: 'single',
          type: 'rule_default',
        },
      ]);

      // Check that the updates have been persisted
      const { body: rulesResponse } = await supertest
        .get(`${DETECTION_ENGINE_RULES_URL}/_find`)
        .set('kbn-xsrf', 'true')
        .set('elastic-api-version', '2023-10-31')
        .expect(200);

      expect(rulesResponse.total).toEqual(2);
    });

    it('should duplicate rules with exceptions - expired exceptions excluded', async () => {
      await deleteAllExceptions(supertest, log);

      const expiredDate = new Date(Date.now() - 1000000).toISOString();

      // create an exception list
      const { body: exceptionList } = await supertest
        .post(EXCEPTION_LIST_URL)
        .set('kbn-xsrf', 'true')
        .send(getCreateExceptionListDetectionSchemaMock())
        .expect(200);
      // create an exception list item
      await supertest
        .post(EXCEPTION_LIST_ITEM_URL)
        .set('kbn-xsrf', 'true')
        .send({ ...getCreateExceptionListItemMinimalSchemaMock(), expire_time: expiredDate })
        .expect(200);

      const ruleId = 'ruleId';
      const ruleToDuplicate = {
        ...getSimpleRule(ruleId),
        exceptions_list: [
          {
            type: exceptionList.type,
            list_id: exceptionList.list_id,
            id: exceptionList.id,
            namespace_type: exceptionList.namespace_type,
          },
        ],
      };
      const newRule = await createRule(supertest, log, ruleToDuplicate);

      // add an exception item to the rule
      await supertest
        .post(`${DETECTION_ENGINE_RULES_URL}/${newRule.id}/exceptions`)
        .set('kbn-xsrf', 'true')
        .send({
          items: [
            {
              description: 'Exception item for rule default exception list',
              entries: [
                {
                  field: 'some.not.nested.field',
                  operator: 'included',
                  type: 'match',
                  value: 'some value',
                },
              ],
              name: 'Sample exception item',
              type: 'simple',
              expire_time: expiredDate,
            },
          ],
        })
        .expect(200);

      const { body } = await postBulkAction()
        .send({
          query: '',
          action: BulkActionTypeEnum.duplicate,
          duplicate: { include_exceptions: true, include_expired_exceptions: false },
        })
        .expect(200);

      const { body: foundItems } = await supertest
        .get(
          `${EXCEPTION_LIST_ITEM_URL}/_find?list_id=${body.attributes.results.created[0].exceptions_list[1].list_id}`
        )
        .set('kbn-xsrf', 'true')
        .send()
        .expect(200);

      // Item should NOT have been duplicated, since it is expired
      expect(foundItems.total).toEqual(0);

      expect(body.attributes.summary).toEqual({ failed: 0, skipped: 0, succeeded: 1, total: 1 });

      // Check that the duplicated rule is returned with the response
      expect(body.attributes.results.created[0].name).toEqual(
        `${ruleToDuplicate.name} [Duplicate]`
      );

      // Check that the exceptions are duplicted
      expect(body.attributes.results.created[0].exceptions_list).toEqual([
        {
          type: exceptionList.type,
          list_id: exceptionList.list_id,
          id: exceptionList.id,
          namespace_type: exceptionList.namespace_type,
        },
        {
          id: body.attributes.results.created[0].exceptions_list[1].id,
          list_id: body.attributes.results.created[0].exceptions_list[1].list_id,
          namespace_type: 'single',
          type: 'rule_default',
        },
      ]);

      // Check that the updates have been persisted
      const { body: rulesResponse } = await supertest
        .get(`${DETECTION_ENGINE_RULES_URL}/_find`)
        .set('elastic-api-version', '2023-10-31')
        .set('kbn-xsrf', 'true')
        .expect(200);

      expect(rulesResponse.total).toEqual(2);
    });

    describe('Duplicate bulk action with Response Actions', () => {
      let superTestResponseActionsNoAuthz: TestAgent;
      let id: string;

      before(async () => {
        superTestResponseActionsNoAuthz = await utils.createSuperTestWithCustomRole({
          name: ROLE.endpoint_response_actions_no_access,
          privileges: rolesUsersProvider.loader.getPreDefinedRole(
            ROLE.endpoint_response_actions_no_access
          ),
        });
      });

      beforeEach(async () => {
        const { body } = await detectionsApi
          .createRule({
            body: getCustomQueryRuleParams({
              rule_id: uuidV4(),
              response_actions: [{ action_type_id: '.endpoint', params: { command: 'isolate' } }],
            }),
          })
          .expect(200);

        id = body.id;
      });

      afterEach(async () => {
        await deleteAllRules(supertest, log);
      });

      it('should duplicate rules with response actions when user has authz', async () => {
        const { body } = await postBulkAction()
          .on('error', createSupertestErrorLogger(log))
          .send({
            ids: [id],
            action: BulkActionTypeEnum.duplicate,
            duplicate: { include_exceptions: false, include_expired_exceptions: false },
          })
          .expect(200);

        expect(body.attributes.summary).toEqual({ failed: 0, skipped: 0, succeeded: 1, total: 1 });
        expect(body.attributes.results.created[0].response_actions).toEqual([
          { action_type_id: '.endpoint', params: { command: 'isolate' } },
        ]);
      });

      it('should error when duplicating rules with response actions and user DOES NOT have authz', async () => {
        const { body } = await superTestResponseActionsNoAuthz
          .post(DETECTION_ENGINE_RULES_BULK_ACTION)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .on('error', createSupertestErrorLogger(log).ignoreCodes([500]))
          .send({
            ids: [id],
            action: BulkActionTypeEnum.duplicate,
            duplicate: { include_exceptions: false, include_expired_exceptions: false },
          })
          .expect(500);

        expect(body.attributes.summary).toEqual({ failed: 1, skipped: 0, succeeded: 0, total: 1 });
        expect(body.attributes.errors[0].message).toEqual(
          'User is not authorized to create/update isolate response action'
        );
      });
    });

    describe('edit action', () => {
      describe('tags actions', () => {
        const overwriteTagsCases = [
          {
            caseName: '3 existing tags overwritten with 2 of them = 2 existing tags',
            existingTags: ['tag1', 'tag2', 'tag3'],
            tagsToOverwrite: ['tag1', 'tag2'],
            resultingTags: ['tag1', 'tag2'],
          },
          {
            caseName: '3 existing tags overwritten with 2 other tags = 2 other tags',
            existingTags: ['tag1', 'tag2', 'tag3'],
            tagsToOverwrite: ['new-tag1', 'new-tag2'],
            resultingTags: ['new-tag1', 'new-tag2'],
          },
          {
            caseName:
              '3 existing tags overwritten with 1 of them + 2 other tags = 1 existing tag + 2 other tags',
            existingTags: ['tag1', 'tag2', 'tag3'],
            tagsToOverwrite: ['tag1', 'new-tag1', 'new-tag2'],
            resultingTags: ['tag1', 'new-tag1', 'new-tag2'],
          },
          {
            caseName: '0 existing tags overwritten with 2 tags = 2 tags',
            existingTags: [],
            tagsToOverwrite: ['new-tag1', 'new-tag2'],
            resultingTags: ['new-tag1', 'new-tag2'],
          },
          {
            caseName: '3 existing tags overwritten with 0 tags = 0 tags',
            existingTags: ['tag1', 'tag2', 'tag3'],
            tagsToOverwrite: [],
            resultingTags: [],
          },
        ];

        overwriteTagsCases.forEach(({ caseName, existingTags, tagsToOverwrite, resultingTags }) => {
          it(`should set tags in rules, case: "${caseName}"`, async () => {
            const ruleId = 'ruleId';

            await createRule(supertest, log, { ...getSimpleRule(ruleId), tags: existingTags });

            const { body: bulkEditResponse } = await postBulkAction()
              .send({
                query: '',
                action: BulkActionTypeEnum.edit,
                [BulkActionTypeEnum.edit]: [
                  {
                    type: BulkActionEditTypeEnum.set_tags,
                    value: tagsToOverwrite,
                  },
                ],
              })
              .expect(200);

            expect(bulkEditResponse.attributes.summary).toEqual({
              failed: 0,
              skipped: 0,
              succeeded: 1,
              total: 1,
            });

            // Check that the updated rule is returned with the response
            expect(bulkEditResponse.attributes.results.updated[0].tags).toEqual(resultingTags);

            // Check that the updates have been persisted
            const { body: updatedRule } = await fetchRule(ruleId).expect(200);

            expect(updatedRule.tags).toEqual(resultingTags);
          });
        });

        const deleteTagsCases = [
          {
            caseName: '3 existing tags - 2 of them = 1 tag',
            existingTags: ['tag1', 'tag2', 'tag3'],
            tagsToDelete: ['tag1', 'tag2'],
            resultingTags: ['tag3'],
          },
          {
            caseName: '3 existing tags - 1 of them - 2 other tags(none of them) = 2 tags',
            existingTags: ['tag1', 'tag2', 'tag3'],
            tagsToDelete: ['tag3', 'tag4', 'tag5'],
            resultingTags: ['tag1', 'tag2'],
          },
          {
            caseName: '3 existing tags - 3 of them = 0 tags',
            existingTags: ['tag1', 'tag2', 'tag3'],
            tagsToDelete: ['tag1', 'tag2', 'tag3'],
            resultingTags: [],
          },
        ];

        deleteTagsCases.forEach(({ caseName, existingTags, tagsToDelete, resultingTags }) => {
          it(`should delete tags in rules, case: "${caseName}"`, async () => {
            const ruleId = 'ruleId';

            await createRule(supertest, log, { ...getSimpleRule(ruleId), tags: existingTags });

            const { body: bulkEditResponse } = await postBulkAction()
              .send({
                query: '',
                action: BulkActionTypeEnum.edit,
                [BulkActionTypeEnum.edit]: [
                  {
                    type: BulkActionEditTypeEnum.delete_tags,
                    value: tagsToDelete,
                  },
                ],
              })
              .expect(200);

            expect(bulkEditResponse.attributes.summary).toEqual({
              failed: 0,
              skipped: 0,
              succeeded: 1,
              total: 1,
            });

            // Check that the updated rule is returned with the response
            expect(bulkEditResponse.attributes.results.updated[0].tags).toEqual(resultingTags);

            // Check that the updates have been persisted
            const { body: updatedRule } = await fetchRule(ruleId).expect(200);

            expect(updatedRule.tags).toEqual(resultingTags);
          });
        });

        const addTagsCases = [
          {
            caseName: '3 existing tags + 2 other tags(none of them) = 5 tags',
            existingTags: ['tag1', 'tag2', 'tag3'],
            addedTags: ['tag4', 'tag5'],
            resultingTags: ['tag1', 'tag2', 'tag3', 'tag4', 'tag5'],
          },
          {
            caseName: '3 existing tags + 1 of them + 2 other tags(none of them) = 5 tags',
            existingTags: ['tag1', 'tag2', 'tag3'],
            addedTags: ['tag4', 'tag5', 'tag1'],
            resultingTags: ['tag1', 'tag2', 'tag3', 'tag4', 'tag5'],
          },
          {
            caseName: '0 existing tags + 2 tags = 2 tags',
            existingTags: [],
            addedTags: ['tag4', 'tag5'],
            resultingTags: ['tag4', 'tag5'],
          },
        ];

        addTagsCases.forEach(({ caseName, existingTags, addedTags, resultingTags }) => {
          it(`should add tags to rules, case: "${caseName}"`, async () => {
            const ruleId = 'ruleId';
            await createRule(supertest, log, { ...getSimpleRule(ruleId), tags: existingTags });

            const { body: bulkEditResponse } = await postBulkAction()
              .send({
                query: '',
                action: BulkActionTypeEnum.edit,
                [BulkActionTypeEnum.edit]: [
                  {
                    type: BulkActionEditTypeEnum.add_tags,
                    value: addedTags,
                  },
                ],
              })
              .expect(200);

            expect(bulkEditResponse.attributes.summary).toEqual({
              failed: 0,
              skipped: 0,
              succeeded: 1,
              total: 1,
            });

            // Check that the updated rule is returned with the response
            expect(bulkEditResponse.attributes.results.updated[0].tags).toEqual(resultingTags);

            // Check that the updates have been persisted
            const { body: updatedRule } = await fetchRule(ruleId).expect(200);

            expect(updatedRule.tags).toEqual(resultingTags);
          });
        });

        const skipTagsUpdateCases = [
          // Delete no-ops
          {
            caseName: '3 existing tags - 0 tags = 3 tags',
            existingTags: ['tag1', 'tag2', 'tag3'],
            tagsToUpdate: [],
            resultingTags: ['tag1', 'tag2', 'tag3'],
            operation: BulkActionEditTypeEnum.delete_tags,
          },
          {
            caseName: '0 existing tags - 2 tags = 0 tags',
            existingTags: [],
            tagsToUpdate: ['tag4', 'tag5'],
            resultingTags: [],
            operation: BulkActionEditTypeEnum.delete_tags,
          },
          {
            caseName: '3 existing tags - 2 other tags (none of them) = 3 tags',
            existingTags: ['tag1', 'tag2', 'tag3'],
            tagsToUpdate: ['tag4', 'tag5'],
            resultingTags: ['tag1', 'tag2', 'tag3'],
            operation: BulkActionEditTypeEnum.delete_tags,
          },
          // Add no-ops
          {
            caseName: '3 existing tags + 2 of them = 3 tags',
            existingTags: ['tag1', 'tag2', 'tag3'],
            tagsToUpdate: ['tag1', 'tag2'],
            resultingTags: ['tag1', 'tag2', 'tag3'],
            operation: BulkActionEditTypeEnum.add_tags,
          },
          {
            caseName: '3 existing tags + 0 tags = 3 tags',
            existingTags: ['tag1', 'tag2', 'tag3'],
            tagsToUpdate: [],
            resultingTags: ['tag1', 'tag2', 'tag3'],
            operation: BulkActionEditTypeEnum.add_tags,
          },
        ];

        skipTagsUpdateCases.forEach(
          ({ caseName, existingTags, tagsToUpdate, resultingTags, operation }) => {
            it(`should skip rule updated for tags, case: "${caseName}"`, async () => {
              const ruleId = 'ruleId';

              await createRule(supertest, log, { ...getSimpleRule(ruleId), tags: existingTags });

              const { body: bulkEditResponse } = await postBulkAction()
                .send({
                  query: '',
                  action: BulkActionTypeEnum.edit,
                  [BulkActionTypeEnum.edit]: [
                    {
                      type: operation,
                      value: tagsToUpdate,
                    },
                  ],
                })
                .expect(200);

              expect(bulkEditResponse.attributes.summary).toEqual({
                failed: 0,
                skipped: 1,
                succeeded: 0,
                total: 1,
              });

              // Check that the rules is returned as skipped with expected skip reason
              expect(bulkEditResponse.attributes.results.skipped[0].skip_reason).toEqual(
                'RULE_NOT_MODIFIED'
              );

              // Check that the no changes have been persisted
              const { body: updatedRule } = await fetchRule(ruleId).expect(200);

              expect(updatedRule.tags).toEqual(resultingTags);
            });
          }
        );
      });

      describe('index patterns actions', () => {
        it('should set index patterns in rules', async () => {
          const ruleId = 'ruleId';
          await createRule(supertest, log, getSimpleRule(ruleId));

          const { body: bulkEditResponse } = await postBulkAction()
            .send({
              query: '',
              action: BulkActionTypeEnum.edit,
              [BulkActionTypeEnum.edit]: [
                {
                  type: BulkActionEditTypeEnum.set_index_patterns,
                  value: ['initial-index-*'],
                },
              ],
            })
            .expect(200);

          expect(bulkEditResponse.attributes.summary).toEqual({
            failed: 0,
            skipped: 0,
            succeeded: 1,
            total: 1,
          });

          // Check that the updated rule is returned with the response
          expect(bulkEditResponse.attributes.results.updated[0].index).toEqual(['initial-index-*']);

          // Check that the updates have been persisted
          const { body: updatedRule } = await fetchRule(ruleId).expect(200);

          expect(updatedRule.index).toEqual(['initial-index-*']);
        });

        it('should add index patterns to rules', async () => {
          const ruleId = 'ruleId';
          const indexPatterns = ['index1-*', 'index2-*'];
          const resultingIndexPatterns = ['index1-*', 'index2-*', 'index3-*'];
          await createRule(supertest, log, { ...getSimpleRule(ruleId), index: indexPatterns });

          const { body: bulkEditResponse } = await postBulkAction()
            .send({
              query: '',
              action: BulkActionTypeEnum.edit,
              [BulkActionTypeEnum.edit]: [
                {
                  type: BulkActionEditTypeEnum.add_index_patterns,
                  value: ['index3-*'],
                },
              ],
            })
            .expect(200);

          expect(bulkEditResponse.attributes.summary).toEqual({
            failed: 0,
            skipped: 0,
            succeeded: 1,
            total: 1,
          });

          // Check that the updated rule is returned with the response
          expect(bulkEditResponse.attributes.results.updated[0].index).toEqual(
            resultingIndexPatterns
          );

          // Check that the updates have been persisted
          const { body: updatedRule } = await fetchRule(ruleId).expect(200);

          expect(updatedRule.index).toEqual(resultingIndexPatterns);
        });

        it('should delete index patterns from rules', async () => {
          const ruleId = 'ruleId';
          const indexPatterns = ['index1-*', 'index2-*'];
          const resultingIndexPatterns = ['index1-*'];
          await createRule(supertest, log, { ...getSimpleRule(ruleId), index: indexPatterns });

          const { body: bulkEditResponse } = await postBulkAction()
            .send({
              query: '',
              action: BulkActionTypeEnum.edit,
              [BulkActionTypeEnum.edit]: [
                {
                  type: BulkActionEditTypeEnum.delete_index_patterns,
                  value: ['index2-*'],
                },
              ],
            })
            .expect(200);

          expect(bulkEditResponse.attributes.summary).toEqual({
            failed: 0,
            skipped: 0,
            succeeded: 1,
            total: 1,
          });

          // Check that the updated rule is returned with the response
          expect(bulkEditResponse.attributes.results.updated[0].index).toEqual(
            resultingIndexPatterns
          );

          // Check that the updates have been persisted
          const { body: updatedRule } = await fetchRule(ruleId).expect(200);

          expect(updatedRule.index).toEqual(resultingIndexPatterns);
        });

        it('should return error if index patterns action is applied to machine learning rule', async () => {
          const mlRule = await createRule(supertest, log, getSimpleMlRule());

          const { body } = await postBulkAction()
            .send({
              ids: [mlRule.id],
              action: BulkActionTypeEnum.edit,
              [BulkActionTypeEnum.edit]: [
                {
                  type: BulkActionEditTypeEnum.add_index_patterns,
                  value: ['index-*'],
                },
              ],
            })
            .expect(500);

          expect(body.attributes.summary).toEqual({
            failed: 1,
            skipped: 0,
            succeeded: 0,
            total: 1,
          });
          expect(body.attributes.errors[0]).toEqual({
            message:
              "Index patterns can't be added. Machine learning rule doesn't have index patterns property",
            status_code: 500,
            rules: [
              {
                id: mlRule.id,
                name: mlRule.name,
              },
            ],
          });
        });

        it('should return error if all index patterns removed from a rule', async () => {
          const rule = await createRule(supertest, log, {
            ...getSimpleRule(),
            index: ['simple-index-*'],
          });

          const { body } = await postBulkAction()
            .send({
              ids: [rule.id],
              action: BulkActionTypeEnum.edit,
              [BulkActionTypeEnum.edit]: [
                {
                  type: BulkActionEditTypeEnum.delete_index_patterns,
                  value: ['simple-index-*'],
                },
              ],
            })
            .expect(500);

          expect(body.attributes.summary).toEqual({
            failed: 1,
            skipped: 0,
            succeeded: 0,
            total: 1,
          });
          expect(body.attributes.errors[0]).toEqual({
            message: "Mutated params invalid: Index patterns can't be empty",
            status_code: 500,
            rules: [
              {
                id: rule.id,
                name: rule.name,
              },
            ],
          });
        });

        it('should return error if index patterns set to empty list', async () => {
          const ruleId = 'ruleId';
          const rule = await createRule(supertest, log, {
            ...getSimpleRule(ruleId),
            index: ['simple-index-*'],
          });

          const { body } = await postBulkAction()
            .send({
              ids: [rule.id],
              action: BulkActionTypeEnum.edit,
              [BulkActionTypeEnum.edit]: [
                {
                  type: BulkActionEditTypeEnum.set_index_patterns,
                  value: [],
                },
              ],
            })
            .expect(500);

          expect(body.attributes.summary).toEqual({
            failed: 1,
            skipped: 0,
            succeeded: 0,
            total: 1,
          });
          expect(body.attributes.errors[0]).toEqual({
            message: "Mutated params invalid: Index patterns can't be empty",
            status_code: 500,
            rules: [
              {
                id: rule.id,
                name: rule.name,
              },
            ],
          });

          // Check that the rule hasn't been updated
          const { body: reFetchedRule } = await fetchRule(ruleId).expect(200);

          expect(reFetchedRule.index).toEqual(['simple-index-*']);
        });

        const skipIndexPatternsUpdateCases = [
          // Delete no-ops
          {
            caseName: '3 existing indeces - 0 indeces = 3 indeces',
            existingIndexPatterns: ['index1-*', 'index2-*', 'index3-*'],
            indexPatternsToUpdate: [],
            resultingIndexPatterns: ['index1-*', 'index2-*', 'index3-*'],
            operation: BulkActionEditTypeEnum.delete_index_patterns,
          },
          {
            caseName: '0 existing indeces - 2 indeces = 0 indeces',
            existingIndexPatterns: [],
            indexPatternsToUpdate: ['index1-*', 'index2-*'],
            resultingIndexPatterns: [],
            operation: BulkActionEditTypeEnum.delete_index_patterns,
          },
          {
            caseName: '3 existing indeces - 2 other indeces (none of them) = 3 indeces',
            existingIndexPatterns: ['index1-*', 'index2-*', 'index3-*'],
            indexPatternsToUpdate: ['index8-*', 'index9-*'],
            resultingIndexPatterns: ['index1-*', 'index2-*', 'index3-*'],
            operation: BulkActionEditTypeEnum.delete_index_patterns,
          },
          // Add no-ops
          {
            caseName: '3 existing indeces + 2 exisiting indeces= 3 indeces',
            existingIndexPatterns: ['index1-*', 'index2-*', 'index3-*'],
            indexPatternsToUpdate: ['index1-*', 'index2-*'],
            resultingIndexPatterns: ['index1-*', 'index2-*', 'index3-*'],
            operation: BulkActionEditTypeEnum.add_index_patterns,
          },
          {
            caseName: '3 existing indeces + 0 indeces = 3 indeces',
            existingIndexPatterns: ['index1-*', 'index2-*', 'index3-*'],
            indexPatternsToUpdate: [],
            resultingIndexPatterns: ['index1-*', 'index2-*', 'index3-*'],
            operation: BulkActionEditTypeEnum.add_index_patterns,
          },
        ];

        skipIndexPatternsUpdateCases.forEach(
          ({
            caseName,
            existingIndexPatterns,
            indexPatternsToUpdate,
            resultingIndexPatterns,
            operation,
          }) => {
            it(`should skip rule updated for tags, case: "${caseName}"`, async () => {
              const ruleId = 'ruleId';

              await createRule(supertest, log, {
                ...getSimpleRule(ruleId),
                index: existingIndexPatterns,
              });

              const { body: bulkEditResponse } = await postBulkAction()
                .send({
                  query: '',
                  action: BulkActionTypeEnum.edit,
                  [BulkActionTypeEnum.edit]: [
                    {
                      type: operation,
                      value: indexPatternsToUpdate,
                    },
                  ],
                })
                .expect(200);

              expect(bulkEditResponse.attributes.summary).toEqual({
                failed: 0,
                skipped: 1,
                succeeded: 0,
                total: 1,
              });

              // Check that the rules is returned as skipped with expected skip reason
              expect(bulkEditResponse.attributes.results.skipped[0].skip_reason).toEqual(
                'RULE_NOT_MODIFIED'
              );

              // Check that the no changes have been persisted
              const { body: updatedRule } = await fetchRule(ruleId).expect(200);

              expect(updatedRule.index).toEqual(resultingIndexPatterns);
            });
          }
        );
      });

      describe('investigation fields actions', () => {
        it('should set investigation fields in rules', async () => {
          const ruleId = 'ruleId';
          await createRule(supertest, log, getSimpleRule(ruleId));

          const { body: bulkEditResponse } = await detectionsApi
            .performRulesBulkAction({
              query: {},
              body: {
                query: '',
                action: BulkActionTypeEnum.edit,
                [BulkActionTypeEnum.edit]: [
                  {
                    type: BulkActionEditTypeEnum.set_investigation_fields,
                    value: { field_names: ['field-1'] },
                  },
                ],
              },
            })
            .expect(200);

          expect(bulkEditResponse.attributes.summary).toEqual({
            failed: 0,
            skipped: 0,
            succeeded: 1,
            total: 1,
          });

          // Check that the updated rule is returned with the response
          expect(bulkEditResponse.attributes.results.updated[0].investigation_fields).toEqual({
            field_names: ['field-1'],
          });

          // Check that the updates have been persisted
          const { body: updatedRule } = await fetchRule(ruleId).expect(200);

          expect(updatedRule.investigation_fields).toEqual({ field_names: ['field-1'] });
        });

        it('should add investigation fields to rules', async () => {
          const ruleId = 'ruleId';
          const investigationFields = { field_names: ['field-1', 'field-2'] };
          const resultingFields = { field_names: ['field-1', 'field-2', 'field-3'] };
          await createRule(supertest, log, {
            ...getSimpleRule(ruleId),
            investigation_fields: investigationFields,
          });

          const { body: bulkEditResponse } = await detectionsApi
            .performRulesBulkAction({
              query: {},
              body: {
                query: '',
                action: BulkActionTypeEnum.edit,
                [BulkActionTypeEnum.edit]: [
                  {
                    type: BulkActionEditTypeEnum.add_investigation_fields,
                    value: { field_names: ['field-3'] },
                  },
                ],
              },
            })
            .expect(200);

          expect(bulkEditResponse.attributes.summary).toEqual({
            failed: 0,
            skipped: 0,
            succeeded: 1,
            total: 1,
          });

          // Check that the updated rule is returned with the response
          expect(bulkEditResponse.attributes.results.updated[0].investigation_fields).toEqual(
            resultingFields
          );

          // Check that the updates have been persisted
          const { body: updatedRule } = await fetchRule(ruleId).expect(200);

          expect(updatedRule.investigation_fields).toEqual(resultingFields);
        });

        it('should delete investigation fields from rules', async () => {
          const ruleId = 'ruleId';
          const investigationFields = { field_names: ['field-1', 'field-2'] };
          const resultingFields = { field_names: ['field-1'] };
          await createRule(supertest, log, {
            ...getSimpleRule(ruleId),
            investigation_fields: investigationFields,
          });

          const { body: bulkEditResponse } = await detectionsApi
            .performRulesBulkAction({
              query: {},
              body: {
                query: '',
                action: BulkActionTypeEnum.edit,
                [BulkActionTypeEnum.edit]: [
                  {
                    type: BulkActionEditTypeEnum.delete_investigation_fields,
                    value: { field_names: ['field-2'] },
                  },
                ],
              },
            })
            .expect(200);

          expect(bulkEditResponse.attributes.summary).toEqual({
            failed: 0,
            skipped: 0,
            succeeded: 1,
            total: 1,
          });

          // Check that the updated rule is returned with the response
          expect(bulkEditResponse.attributes.results.updated[0].investigation_fields).toEqual(
            resultingFields
          );

          // Check that the updates have been persisted
          const { body: updatedRule } = await fetchRule(ruleId).expect(200);

          expect(updatedRule.investigation_fields).toEqual(resultingFields);
        });

        const skipIndexPatternsUpdateCases = [
          // Delete no-ops
          {
            caseName: '0 existing fields - 2 fields = 0 fields',
            existingInvestigationFields: undefined,
            investigationFieldsToUpdate: { field_names: ['field-1', 'field-2'] },
            resultingInvestigationFields: undefined,
            operation: BulkActionEditTypeEnum.delete_investigation_fields,
          },
          {
            caseName: '3 existing fields - 2 other fields (none of them) = 3 fields',
            existingInvestigationFields: { field_names: ['field-1', 'field-2', 'field-3'] },
            investigationFieldsToUpdate: { field_names: ['field-8', 'field-9'] },
            resultingInvestigationFields: { field_names: ['field-1', 'field-2', 'field-3'] },
            operation: BulkActionEditTypeEnum.delete_investigation_fields,
          },
          // Add no-ops
          {
            caseName: '3 existing fields + 2 exisiting fields= 3 fields',
            existingInvestigationFields: { field_names: ['field-1', 'field-2', 'field-3'] },
            investigationFieldsToUpdate: { field_names: ['field-1', 'field-2'] },
            resultingInvestigationFields: { field_names: ['field-1', 'field-2', 'field-3'] },
            operation: BulkActionEditTypeEnum.add_investigation_fields,
          },
        ];

        skipIndexPatternsUpdateCases.forEach(
          ({
            caseName,
            existingInvestigationFields,
            investigationFieldsToUpdate,
            resultingInvestigationFields,
            operation,
          }) => {
            it(`should skip rule updated for investigation fields, case: "${caseName}"`, async () => {
              const ruleId = 'ruleId';

              await createRule(supertest, log, {
                ...getSimpleRule(ruleId),
                investigation_fields: existingInvestigationFields,
              });

              const { body: bulkEditResponse } = await detectionsApi
                .performRulesBulkAction({
                  query: {},
                  body: {
                    query: '',
                    action: BulkActionTypeEnum.edit,
                    [BulkActionTypeEnum.edit]: [
                      {
                        type: operation,
                        value: investigationFieldsToUpdate,
                      },
                    ],
                  },
                })
                .expect(200);

              expect(bulkEditResponse.attributes.summary).toEqual({
                failed: 0,
                skipped: 1,
                succeeded: 0,
                total: 1,
              });

              // Check that the rules is returned as skipped with expected skip reason
              expect(bulkEditResponse.attributes.results.skipped[0].skip_reason).toEqual(
                'RULE_NOT_MODIFIED'
              );

              // Check that the no changes have been persisted
              const { body: updatedRule } = await fetchRule(ruleId).expect(200);

              expect(updatedRule.investigation_fields).toEqual(resultingInvestigationFields);
            });
          }
        );
      });

      it('should set timeline template values in rule', async () => {
        const ruleId = 'ruleId';
        const timelineId = '91832785-286d-4ebe-b884-1a208d111a70';
        const timelineTitle = 'Test timeline';
        await createRule(supertest, log, getSimpleRule(ruleId));

        const { body } = await postBulkAction()
          .send({
            query: '',
            action: BulkActionTypeEnum.edit,
            [BulkActionTypeEnum.edit]: [
              {
                type: BulkActionEditTypeEnum.set_timeline,
                value: {
                  timeline_id: timelineId,
                  timeline_title: timelineTitle,
                },
              },
            ],
          })
          .expect(200);

        expect(body.attributes.summary).toEqual({ failed: 0, skipped: 0, succeeded: 1, total: 1 });

        // Check that the updated rule is returned with the response
        expect(body.attributes.results.updated[0].timeline_id).toEqual(timelineId);
        expect(body.attributes.results.updated[0].timeline_title).toEqual(timelineTitle);

        // Check that the updates have been persisted
        const { body: rule } = await fetchRule(ruleId).expect(200);

        expect(rule.timeline_id).toEqual(timelineId);
        expect(rule.timeline_title).toEqual(timelineTitle);
      });

      it('should correctly remove timeline template', async () => {
        const timelineId = 'test-id';
        const timelineTitle = 'Test timeline template';
        const ruleId = 'ruleId';
        const createdRule = await createRule(supertest, log, {
          ...getSimpleRule(ruleId),
          timeline_id: 'test-id',
          timeline_title: 'Test timeline template',
        });

        // ensure rule has been created with timeline properties
        expect(createdRule.timeline_id).toBe(timelineId);
        expect(createdRule.timeline_title).toBe(timelineTitle);

        const { body } = await postBulkAction()
          .send({
            query: '',
            action: BulkActionTypeEnum.edit,
            [BulkActionTypeEnum.edit]: [
              {
                type: BulkActionEditTypeEnum.set_timeline,
                value: {
                  timeline_id: '',
                  timeline_title: '',
                },
              },
            ],
          })
          .expect(200);

        expect(body.attributes.summary).toEqual({ failed: 0, skipped: 0, succeeded: 1, total: 1 });

        // Check that the updated rule is returned with the response
        expect(body.attributes.results.updated[0].timeline_id).toBe(undefined);
        expect(body.attributes.results.updated[0].timeline_title).toBe(undefined);

        // Check that the updates have been persisted
        const { body: rule } = await fetchRule(ruleId).expect(200);

        expect(rule.timeline_id).toBe(undefined);
        expect(rule.timeline_title).toBe(undefined);
      });

      it('should return error if index patterns action is applied to machine learning rule', async () => {
        const mlRule = await createRule(supertest, log, getSimpleMlRule());

        const { body } = await postBulkAction()
          .send({
            ids: [mlRule.id],
            action: BulkActionTypeEnum.edit,
            [BulkActionTypeEnum.edit]: [
              {
                type: BulkActionEditTypeEnum.add_index_patterns,
                value: ['index-*'],
              },
            ],
          })
          .expect(500);

        expect(body.attributes.summary).toEqual({ failed: 1, skipped: 0, succeeded: 0, total: 1 });
        expect(body.attributes.errors[0]).toEqual({
          message:
            "Index patterns can't be added. Machine learning rule doesn't have index patterns property",
          status_code: 500,
          rules: [
            {
              id: mlRule.id,
              name: mlRule.name,
            },
          ],
        });
      });

      it('should return error if all index patterns removed from a rule', async () => {
        const rule = await createRule(supertest, log, {
          ...getSimpleRule(),
          index: ['simple-index-*'],
        });

        const { body } = await postBulkAction()
          .send({
            ids: [rule.id],
            action: BulkActionTypeEnum.edit,
            [BulkActionTypeEnum.edit]: [
              {
                type: BulkActionEditTypeEnum.delete_index_patterns,
                value: ['simple-index-*'],
              },
            ],
          })
          .expect(500);

        expect(body.attributes.summary).toEqual({ failed: 1, skipped: 0, succeeded: 0, total: 1 });
        expect(body.attributes.errors[0]).toEqual({
          message: "Mutated params invalid: Index patterns can't be empty",
          status_code: 500,
          rules: [
            {
              id: rule.id,
              name: rule.name,
            },
          ],
        });
      });

      it('should increment version on rule bulk edit', async () => {
        const ruleId = 'ruleId';
        const rule = await createRule(supertest, log, getSimpleRule(ruleId));
        const { body } = await postBulkAction()
          .send({
            ids: [rule.id],
            action: BulkActionTypeEnum.edit,
            [BulkActionTypeEnum.edit]: [
              {
                type: BulkActionEditTypeEnum.add_tags,
                value: ['test'],
              },
            ],
          })
          .expect(200);

        expect(body.attributes.results.updated[0].version).toBe(rule.version + 1);

        // Check that the updates have been persisted
        const { body: updatedRule } = await fetchRule(ruleId).expect(200);

        expect(updatedRule.version).toBe(rule.version + 1);
      });

      describe('rule actions', () => {
        const webHookActionMock = {
          group: 'default',
          params: {
            body: '{"test":"action to be saved in a rule"}',
          },
        };

        describe('set_rule_actions', () => {
          it('should set action correctly to existing empty actions list', async () => {
            const ruleId = 'ruleId';
            const createdRule = await createRule(supertest, log, getSimpleRule(ruleId));

            // create a new connector
            const webHookConnector = await createWebHookConnector();

            const { body } = await postBulkAction()
              .send({
                ids: [createdRule.id],
                action: BulkActionTypeEnum.edit,
                [BulkActionTypeEnum.edit]: [
                  {
                    type: BulkActionEditTypeEnum.set_rule_actions,
                    value: {
                      throttle: '1h',
                      actions: [
                        {
                          ...webHookActionMock,
                          id: webHookConnector.id,
                        },
                      ],
                    },
                  },
                ],
              })
              .expect(200);

            const expectedRuleActions = [
              {
                ...webHookActionMock,
                id: webHookConnector.id,
                action_type_id: '.webhook',
                uuid: body.attributes.results.updated[0].actions[0].uuid,
                frequency: { summary: true, throttle: '1h', notifyWhen: 'onThrottleInterval' },
              },
            ];

            // Check that the updated rule is returned with the response
            expect(body.attributes.results.updated[0].actions).toEqual(expectedRuleActions);

            // Check that the updates have been persisted
            const { body: readRule } = await fetchRule(ruleId).expect(200);

            expect(readRule.actions).toEqual(expectedRuleActions);
          });

          it('should set action correctly to existing non empty actions list', async () => {
            const webHookConnector = await createWebHookConnector();

            const existingRuleAction = {
              id: webHookConnector.id,
              action_type_id: '.webhook',
              group: 'default',
              params: {
                body: '{"test":"an existing action"}',
              },
            };

            const ruleId = 'ruleId';
            const createdRule = await createRule(supertest, log, {
              ...getSimpleRule(ruleId),
              actions: [existingRuleAction],
            });

            const { body } = await postBulkAction()
              .send({
                ids: [createdRule.id],
                action: BulkActionTypeEnum.edit,
                [BulkActionTypeEnum.edit]: [
                  {
                    type: BulkActionEditTypeEnum.set_rule_actions,
                    value: {
                      throttle: '1h',
                      actions: [
                        {
                          ...webHookActionMock,
                          id: webHookConnector.id,
                        },
                      ],
                    },
                  },
                ],
              })
              .expect(200);

            const expectedRuleActions = [
              {
                ...webHookActionMock,
                id: webHookConnector.id,
                action_type_id: '.webhook',
                uuid: body.attributes.results.updated[0].actions[0].uuid,
                frequency: { summary: true, throttle: '1h', notifyWhen: 'onThrottleInterval' },
              },
            ];

            // Check that the updated rule is returned with the response
            expect(body.attributes.results.updated[0].actions).toEqual(expectedRuleActions);

            // Check that the updates have been persisted
            const { body: readRule } = await fetchRule(ruleId).expect(200);

            expect(readRule.actions).toEqual(expectedRuleActions);
          });

          it('should set actions to empty list, actions payload is empty list', async () => {
            // create a new connector
            const webHookConnector = await createWebHookConnector();

            const defaultRuleAction = {
              id: webHookConnector.id,
              action_type_id: '.webhook',
              group: 'default',
              params: {
                body: '{"test":"a default action"}',
              },
            };

            const ruleId = 'ruleId';
            const createdRule = await createRule(supertest, log, {
              ...getSimpleRule(ruleId),
              actions: [defaultRuleAction],
              throttle: '1d',
            });

            const { body } = await postBulkAction()
              .send({
                ids: [createdRule.id],
                action: BulkActionTypeEnum.edit,
                [BulkActionTypeEnum.edit]: [
                  {
                    type: BulkActionEditTypeEnum.set_rule_actions,
                    value: {
                      throttle: '1h',
                      actions: [],
                    },
                  },
                ],
              })
              .expect(200);

            // Check that the updated rule is returned with the response
            expect(body.attributes.results.updated[0].actions).toEqual([]);

            // Check that the updates have been persisted
            const { body: readRule } = await fetchRule(ruleId).expect(200);

            expect(readRule.actions).toEqual([]);
          });
        });

        describe('add_rule_actions', () => {
          it('should add action correctly to empty actions list', async () => {
            const ruleId = 'ruleId';
            const createdRule = await createRule(supertest, log, getSimpleRule(ruleId));

            // create a new connector
            const webHookConnector = await createWebHookConnector();

            const { body } = await postBulkAction()
              .send({
                ids: [createdRule.id],
                action: BulkActionTypeEnum.edit,
                [BulkActionTypeEnum.edit]: [
                  {
                    type: BulkActionEditTypeEnum.add_rule_actions,
                    value: {
                      throttle: '1h',
                      actions: [
                        {
                          ...webHookActionMock,
                          id: webHookConnector.id,
                        },
                      ],
                    },
                  },
                ],
              })
              .expect(200);

            const expectedRuleActions = [
              {
                ...webHookActionMock,
                id: webHookConnector.id,
                action_type_id: '.webhook',
                uuid: body.attributes.results.updated[0].actions[0].uuid,
                frequency: { summary: true, throttle: '1h', notifyWhen: 'onThrottleInterval' },
              },
            ];

            // Check that the updated rule is returned with the response
            expect(body.attributes.results.updated[0].actions).toEqual(expectedRuleActions);

            // Check that the updates have been persisted
            const { body: readRule } = await fetchRule(ruleId).expect(200);

            expect(readRule.actions).toEqual(expectedRuleActions);
          });

          it('should add action correctly to non empty actions list of the same type', async () => {
            // create a new connector
            const webHookConnector = await createWebHookConnector();

            const defaultRuleAction = {
              id: webHookConnector.id,
              action_type_id: '.webhook',
              group: 'default',
              params: {
                body: '{"test":"a default action"}',
              },
            };

            const ruleId = 'ruleId';
            const createdRule = await createRule(supertest, log, {
              ...getSimpleRule(ruleId),
              actions: [defaultRuleAction],
              throttle: '1d',
            });

            const { body } = await postBulkAction()
              .send({
                ids: [createdRule.id],
                action: BulkActionTypeEnum.edit,
                [BulkActionTypeEnum.edit]: [
                  {
                    type: BulkActionEditTypeEnum.add_rule_actions,
                    value: {
                      throttle: '1h',
                      actions: [
                        {
                          ...webHookActionMock,
                          id: webHookConnector.id,
                        },
                      ],
                    },
                  },
                ],
              })
              .expect(200);

            const expectedRuleActions = [
              {
                ...defaultRuleAction,
                uuid: body.attributes.results.updated[0].actions[0].uuid,
                frequency: { summary: true, throttle: '1d', notifyWhen: 'onThrottleInterval' },
              },
              {
                ...webHookActionMock,
                id: webHookConnector.id,
                action_type_id: '.webhook',
                uuid: body.attributes.results.updated[0].actions[1].uuid,
                frequency: { summary: true, throttle: '1h', notifyWhen: 'onThrottleInterval' },
              },
            ];

            // Check that the updated rule is returned with the response
            expect(body.attributes.results.updated[0].actions).toEqual(expectedRuleActions);

            // Check that the updates have been persisted
            const { body: readRule } = await fetchRule(ruleId).expect(200);

            expect(readRule.actions).toEqual(expectedRuleActions);
          });

          it('should add action correctly to non empty actions list of a different type', async () => {
            // create new actions
            const webHookAction = await createWebHookConnector();
            const slackConnector = await createSlackConnector();

            const defaultRuleAction = {
              id: webHookAction.id,
              action_type_id: '.webhook',
              group: 'default',
              params: {
                body: '{"test":"a default action"}',
              },
            };

            const slackConnectorMockProps = {
              group: 'default',
              params: {
                message: 'test slack message',
              },
            };

            const ruleId = 'ruleId';
            const createdRule = await createRule(supertest, log, {
              ...getSimpleRule(ruleId),
              actions: [defaultRuleAction],
              throttle: '1d',
            });

            const { body } = await postBulkAction()
              .send({
                ids: [createdRule.id],
                action: BulkActionTypeEnum.edit,
                [BulkActionTypeEnum.edit]: [
                  {
                    type: BulkActionEditTypeEnum.add_rule_actions,
                    value: {
                      throttle: '1h',
                      actions: [
                        {
                          ...slackConnectorMockProps,
                          id: slackConnector.id,
                        },
                      ],
                    },
                  },
                ],
              })
              .expect(200);

            const expectedRuleActions = [
              {
                ...defaultRuleAction,
                uuid: body.attributes.results.updated[0].actions[0].uuid,
                frequency: { summary: true, throttle: '1d', notifyWhen: 'onThrottleInterval' },
              },
              {
                ...slackConnectorMockProps,
                id: slackConnector.id,
                action_type_id: '.slack',
                uuid: body.attributes.results.updated[0].actions[1].uuid,
                frequency: { summary: true, throttle: '1h', notifyWhen: 'onThrottleInterval' },
              },
            ];

            // Check that the updated rule is returned with the response
            expect(body.attributes.results.updated[0].actions).toEqual(expectedRuleActions);

            // Check that the updates have been persisted
            const { body: readRule } = await fetchRule(ruleId).expect(200);

            expect(readRule.actions).toEqual(expectedRuleActions);
          });

          it('should not change actions of rule if empty list of actions added', async () => {
            // create a new connector
            const webHookConnector = await createWebHookConnector();

            const defaultRuleAction = {
              id: webHookConnector.id,
              action_type_id: '.webhook',
              group: 'default',
              params: {
                body: '{"test":"a default action"}',
              },
            };

            const ruleId = 'ruleId';
            const createdRule = await createRule(supertest, log, {
              ...getSimpleRule(ruleId),
              actions: [defaultRuleAction],
              throttle: '1d',
            });

            const { body } = await postBulkAction()
              .send({
                ids: [createdRule.id],
                action: BulkActionTypeEnum.edit,
                [BulkActionTypeEnum.edit]: [
                  {
                    type: BulkActionEditTypeEnum.add_rule_actions,
                    value: {
                      throttle: '1h',
                      actions: [],
                    },
                  },
                ],
              })
              .expect(200);

            // Check that the rule is skipped and was not updated
            expect(body.attributes.results.skipped[0].id).toEqual(createdRule.id);

            // Check that the updates have been persisted
            const { body: readRule } = await fetchRule(ruleId).expect(200);

            expect(readRule.actions).toEqual([
              {
                ...defaultRuleAction,
                uuid: createdRule.actions[0].uuid,
                frequency: { summary: true, throttle: '1d', notifyWhen: 'onThrottleInterval' },
              },
            ]);
          });

          it('should not change throttle if actions list in payload is empty', async () => {
            // create a new connector
            const webHookConnector = await createWebHookConnector();

            const defaultRuleAction = {
              id: webHookConnector.id,
              action_type_id: '.webhook',
              group: 'default',
              params: {
                body: '{"test":"a default action"}',
              },
            };

            const ruleId = 'ruleId';
            const createdRule = await createRule(supertest, log, {
              ...getSimpleRule(ruleId),
              actions: [defaultRuleAction],
              throttle: '8h',
            });

            const { body } = await postBulkAction()
              .send({
                ids: [createdRule.id],
                action: BulkActionTypeEnum.edit,
                [BulkActionTypeEnum.edit]: [
                  {
                    type: BulkActionEditTypeEnum.add_rule_actions,
                    value: {
                      throttle: '1h',
                      actions: [],
                    },
                  },
                ],
              })
              .expect(200);

            // Check that the rule is skipped and was not updated
            expect(body.attributes.results.skipped[0].id).toEqual(createdRule.id);

            // Check that the updates have been persisted
            const { body: readRule } = await fetchRule(ruleId).expect(200);

            expect(readRule.throttle).toEqual(undefined);
            expect(readRule.actions).toEqual(createdRule.actions);
          });
        });

        describe('prebuilt rules', () => {
          const cases = [
            {
              type: BulkActionEditTypeEnum.set_rule_actions,
            },
            {
              type: BulkActionEditTypeEnum.add_rule_actions,
            },
          ];
          cases.forEach(({ type }) => {
            it(`should apply "${type}" rule action to prebuilt rule`, async () => {
              await installMockPrebuiltRules(supertest, es);
              const prebuiltRule = await fetchPrebuiltRule();
              const webHookConnector = await createWebHookConnector();

              const { body } = await postBulkAction()
                .send({
                  ids: [prebuiltRule.id],
                  action: BulkActionTypeEnum.edit,
                  [BulkActionTypeEnum.edit]: [
                    {
                      type,
                      value: {
                        throttle: '1h',
                        actions: [
                          {
                            ...webHookActionMock,
                            id: webHookConnector.id,
                          },
                        ],
                      },
                    },
                  ],
                })
                .expect(200);

              const editedRule = body.attributes.results.updated[0];
              // Check that the updated rule is returned with the response
              expect(editedRule.actions).toEqual([
                {
                  ...webHookActionMock,
                  id: webHookConnector.id,
                  action_type_id: '.webhook',
                  uuid: editedRule.actions[0].uuid,
                  frequency: { summary: true, throttle: '1h', notifyWhen: 'onThrottleInterval' },
                },
              ]);
              // version of prebuilt rule should not change
              expect(editedRule.version).toBe(prebuiltRule.version);

              // Check that the updates have been persisted
              const { body: readRule } = await fetchRule(prebuiltRule.rule_id).expect(200);

              expect(readRule.actions).toEqual([
                {
                  ...webHookActionMock,
                  id: webHookConnector.id,
                  action_type_id: '.webhook',
                  uuid: readRule.actions[0].uuid,
                  frequency: { summary: true, throttle: '1h', notifyWhen: 'onThrottleInterval' },
                },
              ]);
              expect(prebuiltRule.version).toBe(readRule.version);
            });
          });
        });

        describe('throttle', () => {
          // For bulk editing of rule actions, NOTIFICATION_THROTTLE_NO_ACTIONS
          // is not available as payload, because "Perform No Actions" is not a valid option
          const casesForEmptyActions = [
            {
              payloadThrottle: NOTIFICATION_THROTTLE_RULE,
            },
            {
              payloadThrottle: '1d',
            },
          ];
          casesForEmptyActions.forEach(({ payloadThrottle }) => {
            it(`should not update throttle, if payload throttle="${payloadThrottle}" and actions list is empty`, async () => {
              const ruleId = 'ruleId';
              const createdRule = await createRule(supertest, log, {
                ...getSimpleRule(ruleId),
                throttle: '8h',
              });

              const { body } = await postBulkAction()
                .send({
                  ids: [createdRule.id],
                  action: BulkActionTypeEnum.edit,
                  [BulkActionTypeEnum.edit]: [
                    {
                      type: BulkActionEditTypeEnum.set_rule_actions,
                      value: {
                        throttle: payloadThrottle,
                        actions: [],
                      },
                    },
                  ],
                })
                .expect(200);

              // Check that the rule is skipped and was not updated
              expect(body.attributes.results.skipped[0].id).toEqual(createdRule.id);

              // Check that the updates have been persisted
              const { body: rule } = await fetchRule(ruleId).expect(200);

              expect(rule.throttle).toEqual(undefined);
            });
          });

          const casesForNonEmptyActions = [
            {
              payloadThrottle: NOTIFICATION_THROTTLE_RULE,
              expectedThrottle: undefined,
            },
            {
              payloadThrottle: '1h',
              expectedThrottle: undefined,
            },
            {
              payloadThrottle: '1d',
              expectedThrottle: undefined,
            },
            {
              payloadThrottle: '7d',
              expectedThrottle: undefined,
            },
          ];
          [
            BulkActionEditTypeEnum.set_rule_actions,
            BulkActionEditTypeEnum.add_rule_actions,
          ].forEach((ruleAction) => {
            casesForNonEmptyActions.forEach(({ payloadThrottle, expectedThrottle }) => {
              it(`throttle is updated correctly for rule action "${ruleAction}", if payload throttle="${payloadThrottle}" and actions non empty`, async () => {
                // create a new connector
                const webHookConnector = await createWebHookConnector();

                const ruleId = 'ruleId';
                const createdRule = await createRule(supertest, log, getSimpleRule(ruleId));

                const { body } = await postBulkAction()
                  .send({
                    ids: [createdRule.id],
                    action: BulkActionTypeEnum.edit,
                    [BulkActionTypeEnum.edit]: [
                      {
                        type: BulkActionEditTypeEnum.set_rule_actions,
                        value: {
                          throttle: payloadThrottle,
                          actions: [
                            {
                              id: webHookConnector.id,
                              group: 'default',
                              params: { body: '{}' },
                            },
                          ],
                        },
                      },
                    ],
                  })
                  .expect(200);

                // Check that the updated rule is returned with the response
                expect(body.attributes.results.updated[0].throttle).toEqual(expectedThrottle);

                const expectedActions = body.attributes.results.updated[0].actions.map(
                  (action: any) => ({
                    ...action,
                    frequency: {
                      summary: true,
                      throttle: payloadThrottle !== 'rule' ? payloadThrottle : null,
                      notifyWhen:
                        payloadThrottle !== 'rule' ? 'onThrottleInterval' : 'onActiveAlert',
                    },
                  })
                );

                // Check that the updates have been persisted
                const { body: rule } = await fetchRule(ruleId).expect(200);

                expect(rule.throttle).toEqual(expectedThrottle);
                expect(rule.actions).toEqual(expectedActions);
              });
            });
          });
        });

        describe('notifyWhen', () => {
          // For bulk editing of rule actions, NOTIFICATION_THROTTLE_NO_ACTIONS
          // is not available as payload, because "Perform No Actions" is not a valid option
          const cases = [
            {
              payload: { throttle: '1d' },
              expected: { notifyWhen: null },
            },
            {
              payload: { throttle: NOTIFICATION_THROTTLE_RULE },
              expected: { notifyWhen: null },
            },
          ];
          cases.forEach(({ payload, expected }) => {
            it(`should set notifyWhen correctly, if payload throttle="${payload.throttle}"`, async () => {
              const createdRule = await createRule(supertest, log, getSimpleRule('ruleId'));

              await postBulkAction()
                .send({
                  ids: [createdRule.id],
                  action: BulkActionTypeEnum.edit,
                  [BulkActionTypeEnum.edit]: [
                    {
                      type: BulkActionEditTypeEnum.set_rule_actions,
                      value: {
                        throttle: payload.throttle,
                        actions: [],
                      },
                    },
                  ],
                })
                .expect(200);

              // Check whether notifyWhen set correctly
              const { body: rule } = await fetchRuleByAlertApi(createdRule.id).expect(200);

              expect(rule.notify_when).toEqual(expected.notifyWhen);
            });
          });
        });
      });

      describe('schedule actions', () => {
        it('should return bad request error if payload is invalid', async () => {
          const ruleId = 'ruleId';
          const intervalMinutes = 0;
          const interval = `${intervalMinutes}m`;
          const lookbackMinutes = -1;
          const lookback = `${lookbackMinutes}m`;
          await createRule(supertest, log, getSimpleRule(ruleId));

          const { body } = await postBulkAction()
            .send({
              query: '',
              action: BulkActionTypeEnum.edit,
              [BulkActionTypeEnum.edit]: [
                {
                  type: BulkActionEditTypeEnum.set_schedule,
                  value: {
                    interval,
                    lookback,
                  },
                },
              ],
            })
            .expect(400);

          expect(body.statusCode).toEqual(400);
          expect(body.error).toEqual('Bad Request');
          expect(body.message).toContain('[request body]: edit.0.value.interval: Invalid string');
        });

        it('should update schedule values in rules with a valid payload', async () => {
          const ruleId = 'ruleId';
          const intervalMinutes = 15;
          const interval = `${intervalMinutes}m`;
          const lookbackMinutes = 10;
          const lookback = `${lookbackMinutes}m`;
          await createRule(supertest, log, getSimpleRule(ruleId));

          const { body } = await postBulkAction()
            .send({
              query: '',
              action: BulkActionTypeEnum.edit,
              [BulkActionTypeEnum.edit]: [
                {
                  type: BulkActionEditTypeEnum.set_schedule,
                  value: {
                    interval,
                    lookback,
                  },
                },
              ],
            })
            .expect(200);

          expect(body.attributes.summary).toEqual({
            failed: 0,
            skipped: 0,
            succeeded: 1,
            total: 1,
          });

          expect(body.attributes.results.updated[0].interval).toEqual(interval);
          expect(body.attributes.results.updated[0].meta).toEqual({ from: `${lookbackMinutes}m` });
          expect(body.attributes.results.updated[0].from).toEqual(
            `now-${(intervalMinutes + lookbackMinutes) * 60}s`
          );
        });
      });
    });

    // skipped on MKI since feature flags are not supported there
    describe('@skipInServerlessMKI manual rule run action', () => {
      it('should return all existing and enabled rules as succeeded', async () => {
        const intervalInMinutes = 25;
        const interval = `${intervalInMinutes}m`;
        await createRule(
          supertest,
          log,
          getCustomQueryRuleParams({
            rule_id: 'rule-1',
            enabled: true,
            interval,
          })
        );
        await createRule(
          supertest,
          log,
          getCustomQueryRuleParams({
            rule_id: 'rule-2',
            enabled: true,
            interval,
          })
        );

        const endDate = moment();
        const startDate = endDate.clone().subtract(1, 'h');

        const { body } = await detectionsApi
          .performRulesBulkAction({
            query: {},
            body: {
              query: '',
              action: BulkActionTypeEnum.run,
              [BulkActionTypeEnum.run]: {
                start_date: startDate.toISOString(),
                end_date: endDate.toISOString(),
              },
            },
          })
          .expect(200);

        expect(body.attributes.summary).toEqual({
          failed: 0,
          skipped: 0,
          succeeded: 2,
          total: 2,
        });
        expect(body.attributes.errors).toBeUndefined();
      });

      it('should return 400 error when start date > end date', async () => {
        const intervalInMinutes = 25;
        const interval = `${intervalInMinutes}m`;
        const createdRule1 = await createRule(
          supertest,
          log,
          getCustomQueryRuleParams({
            rule_id: 'rule-1',
            enabled: true,
            interval,
          })
        );
        const createdRule2 = await createRule(
          supertest,
          log,
          getCustomQueryRuleParams({
            rule_id: 'rule-2',
            enabled: true,
            interval,
          })
        );

        const endDate = moment();
        const startDate = endDate.clone().subtract(1, 'h');

        const { body } = await detectionsApi
          .performRulesBulkAction({
            query: {},
            body: {
              ids: [createdRule1.id, createdRule2.id],
              action: BulkActionTypeEnum.run,
              [BulkActionTypeEnum.run]: {
                start_date: endDate.toISOString(),
                end_date: startDate.toISOString(),
              },
            },
          })
          .expect(400);

        expect(body.message).toContain('[0]: Backfill end must be greater than backfill start');
      });

      it('should return 400 error when start date = end date', async () => {
        const intervalInMinutes = 25;
        const interval = `${intervalInMinutes}m`;
        const createdRule1 = await createRule(
          supertest,
          log,
          getCustomQueryRuleParams({
            rule_id: 'rule-1',
            enabled: true,
            interval,
          })
        );
        const createdRule2 = await createRule(
          supertest,
          log,
          getCustomQueryRuleParams({
            rule_id: 'rule-2',
            enabled: true,
            interval,
          })
        );

        const endDate = moment().subtract(1, 'h');
        const startDate = endDate.clone();

        const { body } = await detectionsApi
          .performRulesBulkAction({
            query: {},
            body: {
              ids: [createdRule1.id, createdRule2.id],
              action: BulkActionTypeEnum.run,
              [BulkActionTypeEnum.run]: {
                start_date: startDate.toISOString(),
                end_date: endDate.toISOString(),
              },
            },
          })
          .expect(400);

        expect(body.message).toContain('[0]: Backfill end must be greater than backfill start');
      });

      it('should return 400 error when start date is in the future', async () => {
        const intervalInMinutes = 25;
        const interval = `${intervalInMinutes}m`;
        const createdRule1 = await createRule(
          supertest,
          log,
          getCustomQueryRuleParams({
            rule_id: 'rule-1',
            enabled: true,
            interval,
          })
        );
        const createdRule2 = await createRule(
          supertest,
          log,
          getCustomQueryRuleParams({
            rule_id: 'rule-2',
            enabled: true,
            interval,
          })
        );

        const startDate = moment().add(1, 'd');
        const endDate = moment().add(2, 'd');

        const { body } = await detectionsApi
          .performRulesBulkAction({
            query: {},
            body: {
              ids: [createdRule1.id, createdRule2.id],
              action: BulkActionTypeEnum.run,
              [BulkActionTypeEnum.run]: {
                start_date: startDate.toISOString(),
                end_date: endDate.toISOString(),
              },
            },
          })
          .expect(400);

        expect(body.message).toContain('[0]: Backfill cannot be scheduled for the future');
      });

      it('should return 400 error when end date is in the future', async () => {
        const intervalInMinutes = 25;
        const interval = `${intervalInMinutes}m`;
        const createdRule1 = await createRule(
          supertest,
          log,
          getCustomQueryRuleParams({
            rule_id: 'rule-1',
            enabled: true,
            interval,
          })
        );
        const createdRule2 = await createRule(
          supertest,
          log,
          getCustomQueryRuleParams({
            rule_id: 'rule-2',
            enabled: true,
            interval,
          })
        );

        const endDate = moment().add(1, 'd');
        const startDate = moment().subtract(1, 'd');

        const { body } = await detectionsApi
          .performRulesBulkAction({
            query: {},
            body: {
              ids: [createdRule1.id, createdRule2.id],
              action: BulkActionTypeEnum.run,
              [BulkActionTypeEnum.run]: {
                start_date: startDate.toISOString(),
                end_date: endDate.toISOString(),
              },
            },
          })
          .expect(400);

        expect(body.message).toContain('[0]: Backfill cannot be scheduled for the future');
      });

      it('should return 400 error when start date is far in the past', async () => {
        const intervalInMinutes = 25;
        const interval = `${intervalInMinutes}m`;
        const createdRule1 = await createRule(
          supertest,
          log,
          getCustomQueryRuleParams({
            rule_id: 'rule-1',
            enabled: true,
            interval,
          })
        );
        const createdRule2 = await createRule(
          supertest,
          log,
          getCustomQueryRuleParams({
            rule_id: 'rule-2',
            enabled: true,
            interval,
          })
        );

        const endDate = moment();
        const startDate = moment().subtract(MAX_MANUAL_RULE_RUN_LOOKBACK_WINDOW_DAYS + 1, 'd');

        const { body } = await detectionsApi
          .performRulesBulkAction({
            query: {},
            body: {
              ids: [createdRule1.id, createdRule2.id],
              action: BulkActionTypeEnum.run,
              [BulkActionTypeEnum.run]: {
                start_date: startDate.toISOString(),
                end_date: endDate.toISOString(),
              },
            },
          })
          .expect(400);

        expect(body.message).toContain(
          `[0]: Backfill cannot look back more than ${MAX_MANUAL_RULE_RUN_LOOKBACK_WINDOW_DAYS} days`
        );
      });

      it('should return 500 error if some rules do not exist', async () => {
        const intervalInMinutes = 25;
        const interval = `${intervalInMinutes}m`;
        const createdRule1 = await createRule(
          supertest,
          log,
          getCustomQueryRuleParams({
            rule_id: 'rule-1',
            enabled: true,
            interval,
          })
        );

        const endDate = moment();
        const startDate = endDate.clone().subtract(1, 'h');

        const { body } = await detectionsApi
          .performRulesBulkAction({
            query: {},
            body: {
              ids: [createdRule1.id, 'rule-2'],
              action: BulkActionTypeEnum.run,
              [BulkActionTypeEnum.run]: {
                start_date: startDate.toISOString(),
                end_date: endDate.toISOString(),
              },
            },
          })
          .expect(500);

        expect(body.attributes.summary).toEqual({
          failed: 1,
          skipped: 0,
          succeeded: 1,
          total: 2,
        });

        expect(body.attributes.errors).toHaveLength(1);
        expect(body.attributes.errors[0]).toEqual({
          message: 'Rule not found',
          status_code: 500,
          rules: [
            {
              id: 'rule-2',
            },
          ],
        });
      });

      it('should return 500 error if some rules are disabled', async () => {
        const intervalInMinutes = 25;
        const interval = `${intervalInMinutes}m`;
        const createdRule1 = await createRule(
          supertest,
          log,
          getCustomQueryRuleParams({
            rule_id: 'rule-1',
            enabled: false,
            interval,
          })
        );
        const createdRule2 = await createRule(
          supertest,
          log,
          getCustomQueryRuleParams({
            rule_id: 'rule-2',
            enabled: true,
            interval,
          })
        );

        const endDate = moment();
        const startDate = endDate.clone().subtract(1, 'h');

        const { body } = await detectionsApi
          .performRulesBulkAction({
            query: {},
            body: {
              ids: [createdRule1.id, createdRule2.id],
              action: BulkActionTypeEnum.run,
              [BulkActionTypeEnum.run]: {
                start_date: startDate.toISOString(),
                end_date: endDate.toISOString(),
              },
            },
          })
          .expect(500);

        expect(body.attributes.summary).toEqual({
          failed: 1,
          skipped: 0,
          succeeded: 1,
          total: 2,
        });

        expect(body.attributes.errors).toHaveLength(1);
        expect(body.attributes.errors).toEqual(
          expect.arrayContaining([
            {
              message: 'Cannot schedule manual rule run for a disabled rule',
              status_code: 500,
              err_code: 'MANUAL_RULE_RUN_DISABLED_RULE',
              rules: [{ id: createdRule1.id, name: createdRule1.name }],
            },
          ])
        );
        expect(body.attributes.results).toEqual({
          updated: [expect.objectContaining(createdRule2)],
          created: [],
          deleted: [],
          skipped: [],
        });
      });

      describe('@skipInServerless RBAC', () => {
        describe('with rules_read_manual_run_all user role', () => {
          const roleWithManualRun = ROLES.rules_read_manual_run_all;

          beforeEach(async () => {
            await createUserAndRole(getService, roleWithManualRun);
          });

          afterEach(async () => {
            await deleteUserAndRole(getService, roleWithManualRun);
          });

          it('should return all existing and enabled rules as succeeded', async () => {
            const intervalInMinutes = 25;
            const interval = `${intervalInMinutes}m`;
            await createRule(
              supertest,
              log,
              getCustomQueryRuleParams({
                rule_id: 'rule-1',
                enabled: true,
                interval,
              })
            );
            await createRule(
              supertest,
              log,
              getCustomQueryRuleParams({
                rule_id: 'rule-2',
                enabled: true,
                interval,
              })
            );

            const endDate = moment();
            const startDate = endDate.clone().subtract(1, 'h');

            const { body } = await detectionsApi
              .performRulesBulkAction({
                query: {},
                body: {
                  query: '',
                  action: BulkActionTypeEnum.run,
                  [BulkActionTypeEnum.run]: {
                    start_date: startDate.toISOString(),
                    end_date: endDate.toISOString(),
                  },
                },
              })
              .expect(200);

            expect(body.attributes.summary).toEqual({
              failed: 0,
              skipped: 0,
              succeeded: 2,
              total: 2,
            });
            expect(body.attributes.errors).toBeUndefined();
          });
        });

        describe('with rules_all_manual_run_none user role', () => {
          const roleWithoutManualRun = ROLES.rules_all_manual_run_none;

          beforeEach(async () => {
            await createUserAndRole(getService, roleWithoutManualRun);
          });

          afterEach(async () => {
            await deleteUserAndRole(getService, roleWithoutManualRun);
          });
          it('should fail triggering manual runs', async () => {
            const intervalInMinutes = 25;
            const interval = `${intervalInMinutes}m`;
            await createRule(
              supertest,
              log,
              getCustomQueryRuleParams({
                rule_id: 'rule-1',
                enabled: true,
                interval,
              })
            );
            await createRule(
              supertest,
              log,
              getCustomQueryRuleParams({
                rule_id: 'rule-2',
                enabled: true,
                interval,
              })
            );

            const endDate = moment();
            const startDate = endDate.clone().subtract(1, 'h');

            const restrictedUser = { username: roleWithoutManualRun, password: 'changeme' };
            const restrictedApis = detectionsApi.withUser(restrictedUser);

            await restrictedApis
              .performRulesBulkAction({
                query: {},
                body: {
                  query: '',
                  action: BulkActionTypeEnum.run,
                  [BulkActionTypeEnum.run]: {
                    start_date: startDate.toISOString(),
                    end_date: endDate.toISOString(),
                  },
                },
              })
              .expect(500);
          });
        });
      });
    });

    describe('@skipInServerlessMKI fill gaps run action', () => {
      const intervalInMinutes = 5;
      const interval = `${intervalInMinutes}m`;
      const totalRules = 3;
      type GapFromEvent = GapEvent['kibana']['alert']['rule']['gap'] & { _id: string };
      let generatedGapEvents: Record<
        string,
        { rule: { id: string; name: string }; gapEvents: GapFromEvent[] }
      >;

      let backfillStart: Date;
      let backfillEnd: Date;
      let createdRules: Array<Awaited<ReturnType<typeof createRule>>>;
      let createdRuleIds: string[];

      const resetEverything = async () => {
        await deleteAllGaps(es);
        await deleteAllRules(supertest, log);
      };

      const initializeTestGapEvents = async () => {
        generatedGapEvents = {};
        for (const rule of createdRules) {
          const { gapEvents } = await generateGapsForRule(es, rule, 100);
          generatedGapEvents[rule.id] = {
            rule,
            gapEvents: gapEvents.map((gapEvent) => {
              if (!gapEvent._id) {
                throw new Error('generated gap event id cannot be undefined');
              }
              return { ...gapEvent.kibana.alert.rule.gap, _id: gapEvent._id };
            }),
          };
        }

        let earliest = Date.now();
        let latest = 0;

        Object.values(generatedGapEvents).forEach(({ gapEvents }) => {
          gapEvents
            .flatMap((event) => event.unfilled_intervals)
            .forEach(({ gte, lte }) => {
              earliest = Math.min(earliest, new Date(gte).getTime());
              latest = Math.max(latest, new Date(lte).getTime());
            });
        });

        backfillEnd = new Date(latest);
        backfillStart = new Date(earliest);
      };

      afterEach(resetEverything);

      beforeEach(async () => {
        createdRules = [];

        for (let idx = 0; idx < totalRules; idx++) {
          const rule = await createRule(
            supertest,
            log,
            getCustomQueryRuleParams({
              rule_id: idx.toString(),
              enabled: true,
              interval,
            }),
            'default'
          );

          createdRules.push(rule);

          backfillEnd = new Date();
          backfillStart = new Date(backfillEnd.getTime() - 24 * 60 * 60 * 1000);
        }

        createdRuleIds = createdRules.map(({ id }) => id);
      });

      describe('scheduling gap fills for rules', () => {
        beforeEach(async () => {
          await initializeTestGapEvents();
        });

        it('should trigger the scheduling of gap fills for the rules in the request', async () => {
          // Only backfill the first 2 rules
          const ruleIdsToBackfill = Object.keys(generatedGapEvents).slice(0, 2);

          // Trigger the backfill for the selected rules
          const { body } = await detectionsApi
            .performRulesBulkAction({
              query: {},
              body: {
                ids: ruleIdsToBackfill,
                action: BulkActionTypeEnum.fill_gaps,
                [BulkActionTypeEnum.fill_gaps]: {
                  start_date: backfillStart.toISOString(),
                  end_date: backfillEnd.toISOString(),
                },
              },
            })
            .expect(200);

          expect(body.success).toEqual(true);
          expect(body.attributes.summary).toEqual({
            failed: 0,
            succeeded: 2,
            skipped: 0,
            total: 2,
          });

          const expectedUpdatedRules = Object.values(generatedGapEvents)
            .slice(0, 2)
            .map((event) => event.rule);

          expect(body.attributes.results).toEqual({
            updated: expect.arrayContaining(
              expectedUpdatedRules.map((expected) => expect.objectContaining(expected))
            ),
            created: [],
            deleted: [],
            skipped: [],
          });

          for (const ruleId of ruleIdsToBackfill) {
            const fetchedGaps = await getGapsByRuleId(
              supertest,
              ruleId,
              { start: backfillStart.toISOString(), end: backfillEnd.toISOString() },
              100
            );

            const generatedGaps = generatedGapEvents[ruleId].gapEvents;

            // Verify that every single gap is marked as in progress
            generatedGaps.forEach((generatedGap) => {
              const fetchedGap = fetchedGaps.find(({ _id }) => _id === generatedGap._id);
              expect(fetchedGap?.unfilled_intervals).toEqual([]);
              expect(fetchedGap?.in_progress_intervals).toEqual(generatedGap.unfilled_intervals);
            });
          }

          // For the rules we didn't backfill, verify that their gaps are still unfilled
          for (const ruleId of Object.keys(generatedGapEvents).slice(2)) {
            const fetchedGaps = await getGapsByRuleId(
              supertest,
              ruleId,
              { start: backfillStart.toISOString(), end: backfillEnd.toISOString() },
              100
            );

            const generatedGaps = generatedGapEvents[ruleId].gapEvents;

            generatedGaps.forEach((generatedGap) => {
              const fetchedGap = fetchedGaps.find(({ _id }) => _id === generatedGap._id);
              expect(fetchedGap?.unfilled_intervals).toEqual(generatedGap.unfilled_intervals);
              expect(fetchedGap?.in_progress_intervals).toEqual([]);
            });
          }
        });

        it('should return 500 error if some rules do not exist', async () => {
          const existentRules = createdRuleIds;
          const nonExistentRule = 'non-existent-rule';
          const { body } = await detectionsApi
            .performRulesBulkAction({
              query: {},
              body: {
                ids: [...existentRules, nonExistentRule],
                action: BulkActionTypeEnum.fill_gaps,
                [BulkActionTypeEnum.fill_gaps]: {
                  start_date: backfillStart.toISOString(),
                  end_date: backfillEnd.toISOString(),
                },
              },
            })
            .expect(500);

          expect(body.attributes.summary).toEqual({
            failed: 1,
            skipped: 0,
            succeeded: existentRules.length,
            total: existentRules.length + 1,
          });

          expect(body.attributes.errors).toHaveLength(1);
          expect(body.attributes.errors[0]).toEqual({
            message: 'Rule not found',
            status_code: 500,
            rules: [
              {
                id: nonExistentRule,
              },
            ],
          });
        });

        it('should return 500 error if some rules are disabled', async () => {
          const enabledRules = createdRuleIds;
          const disabledRule = await createRule(
            supertest,
            log,
            getCustomQueryRuleParams({
              rule_id: 'rule-disabled',
              enabled: false,
              interval,
            })
          );

          await generateGapsForRule(es, disabledRule, 100);

          const { body } = await detectionsApi
            .performRulesBulkAction({
              query: {},
              body: {
                ids: [...enabledRules, disabledRule.id],
                action: BulkActionTypeEnum.fill_gaps,
                [BulkActionTypeEnum.fill_gaps]: {
                  start_date: backfillStart.toISOString(),
                  end_date: backfillEnd.toISOString(),
                },
              },
            })
            .expect(500);

          expect(body.attributes.summary).toEqual({
            failed: 1,
            skipped: 0,
            succeeded: enabledRules.length,
            total: enabledRules.length + 1,
          });

          expect(body.attributes.errors).toHaveLength(1);
          expect(body.attributes.errors).toEqual(
            expect.arrayContaining([
              {
                message: 'Cannot bulk fill gaps for a disabled rule',
                status_code: 500,
                err_code: 'RULE_FILL_GAPS_DISABLED_RULE',
                rules: [{ id: disabledRule.id, name: disabledRule.name }],
              },
            ])
          );

          const expectedUpdatedRules = Object.values(generatedGapEvents).map((event) => event.rule);
          expect(body.attributes.results).toEqual({
            updated: expect.arrayContaining(
              expectedUpdatedRules.map((expected) => expect.objectContaining(expected))
            ),
            created: [],
            deleted: [],
            skipped: [],
          });
        });
      });

      it('should return 400 error when the end date is not strictly greater than the start date', async () => {
        const { body } = await detectionsApi
          .performRulesBulkAction({
            query: {},
            body: {
              ids: createdRuleIds,
              action: BulkActionTypeEnum.fill_gaps,
              [BulkActionTypeEnum.fill_gaps]: {
                start_date: backfillStart.toISOString(),
                end_date: backfillStart.toISOString(),
              },
            },
          })
          .expect(400);

        expect(body.message).toContain('Backfill end must be greater than backfill start');
      });

      it('should return 400 error when start date is in the future', async () => {
        const { body } = await detectionsApi
          .performRulesBulkAction({
            query: {},
            body: {
              ids: createdRuleIds,
              action: BulkActionTypeEnum.fill_gaps,
              [BulkActionTypeEnum.fill_gaps]: {
                start_date: new Date(Date.now() + 10000).toISOString(),
                end_date: backfillEnd.toISOString(),
              },
            },
          })
          .expect(400);

        expect(body.message).toContain('Backfill cannot be scheduled for the future');
      });

      it('should return 400 error when end date is in the future', async () => {
        const { body } = await detectionsApi
          .performRulesBulkAction({
            query: {},
            body: {
              ids: createdRuleIds,
              action: BulkActionTypeEnum.fill_gaps,
              [BulkActionTypeEnum.fill_gaps]: {
                start_date: backfillStart.toISOString(),
                end_date: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
              },
            },
          })
          .expect(400);

        expect(body.message).toContain('Backfill cannot be scheduled for the future');
      });

      it('should return 400 error when range between start and end are greater than 90 days', async () => {
        const { body } = await detectionsApi
          .performRulesBulkAction({
            query: {},
            body: {
              ids: createdRuleIds,
              action: BulkActionTypeEnum.fill_gaps,
              [BulkActionTypeEnum.fill_gaps]: {
                start_date: new Date(
                  backfillEnd.getTime() - 1 - 90 * 24 * 60 * 60 * 1000
                ).toISOString(),
                end_date: backfillEnd.toISOString(),
              },
            },
          })
          .expect(400);

        expect(body.message).toContain('Backfill cannot look back more than 90 days');
      });

      describe('@skipInServerless RBAC', () => {
        describe('with rules_read_manual_run_all user role', () => {
          const roleWithManualRun = ROLES.rules_read_manual_run_all;

          beforeEach(async () => {
            await initializeTestGapEvents();
            await createUserAndRole(getService, roleWithManualRun);
          });

          afterEach(async () => {
            await deleteUserAndRole(getService, roleWithManualRun);
          });

          it('should trigger the scheduling of gap fills for the rules in the request', async () => {
            // Only backfill the first 2 rules
            const ruleIdsToBackfill = Object.keys(generatedGapEvents).slice(0, 2);

            const restrictedUser = { username: roleWithManualRun, password: 'changeme' };
            const restrictedApis = detectionsApi.withUser(restrictedUser);

            // Trigger the backfill for the selected rules
            const { body } = await restrictedApis
              .performRulesBulkAction({
                query: {},
                body: {
                  ids: ruleIdsToBackfill,
                  action: BulkActionTypeEnum.fill_gaps,
                  [BulkActionTypeEnum.fill_gaps]: {
                    start_date: backfillStart.toISOString(),
                    end_date: backfillEnd.toISOString(),
                  },
                },
              })
              .expect(200);

            expect(body.success).toEqual(true);
            expect(body.attributes.summary).toEqual({
              failed: 0,
              succeeded: 2,
              skipped: 0,
              total: 2,
            });
          });
        });

        describe('@skipInServerless with rules_all_manual_run_none user role', () => {
          const roleWithoutManualRun = ROLES.rules_all_manual_run_none;

          beforeEach(async () => {
            await createUserAndRole(getService, roleWithoutManualRun);
          });

          afterEach(async () => {
            await deleteUserAndRole(getService, roleWithoutManualRun);
          });

          it('should fail triggering fill gaps', async () => {
            // Only backfill the first 2 rules
            const ruleIdsToBackfill = Object.keys(generatedGapEvents).slice(0, 2);

            const restrictedUser = { username: roleWithoutManualRun, password: 'changeme' };
            const restrictedApis = detectionsApi.withUser(restrictedUser);

            // Trigger the backfill for the selected rules
            await restrictedApis
              .performRulesBulkAction({
                query: {},
                body: {
                  ids: ruleIdsToBackfill,
                  action: BulkActionTypeEnum.fill_gaps,
                  [BulkActionTypeEnum.fill_gaps]: {
                    start_date: backfillStart.toISOString(),
                    end_date: backfillEnd.toISOString(),
                  },
                },
              })
              .expect(500);
          });
        });
      });
    });

    describe('overwrite_data_views', () => {
      it('should add an index pattern to a rule and overwrite the data view when overwrite_data_views is true', async () => {
        const ruleId = 'ruleId';
        const dataViewId = 'index1-*';
        const simpleRule = {
          ...getSimpleRule(ruleId),
          index: undefined,
          data_view_id: dataViewId,
        };
        await createRule(supertest, log, simpleRule);

        const { body: setIndexBody } = await postBulkAction()
          .send({
            query: '',
            action: BulkActionTypeEnum.edit,
            [BulkActionTypeEnum.edit]: [
              {
                type: BulkActionEditTypeEnum.add_index_patterns,
                value: ['initial-index-*'],
                overwrite_data_views: true,
              },
            ],
          })
          .expect(200);

        expect(setIndexBody.attributes.summary).toEqual({
          failed: 0,
          skipped: 0,
          succeeded: 1,
          total: 1,
        });

        // Check that the updated rule is returned with the response
        expect(setIndexBody.attributes.results.updated[0].index).toEqual(['initial-index-*']);
        expect(setIndexBody.attributes.results.updated[0].data_view_id).toEqual(undefined);

        // Check that the updates have been persisted
        const { body: setIndexRule } = await fetchRule(ruleId).expect(200);

        expect(setIndexRule.index).toEqual(['initial-index-*']);
      });

      it('should return skipped rule and NOT add an index pattern to a rule or overwrite the data view when overwrite_data_views is false', async () => {
        const ruleId = 'ruleId';
        const dataViewId = 'index1-*';

        const simpleRule = await createRule(supertest, log, {
          ...getSimpleRule(ruleId),
          index: undefined,
          data_view_id: dataViewId,
        });

        const { body: setIndexBody } = await postBulkAction()
          .send({
            query: '',
            action: BulkActionTypeEnum.edit,
            [BulkActionTypeEnum.edit]: [
              {
                type: BulkActionEditTypeEnum.add_index_patterns,
                value: ['initial-index-*'],
                overwrite_data_views: false,
              },
            ],
          })
          .expect(200);

        expect(setIndexBody.attributes.summary).toEqual({
          failed: 0,
          skipped: 1,
          succeeded: 0,
          total: 1,
        });

        expect(setIndexBody.attributes.errors).toBe(undefined);

        // Check that the skipped rule is returned with the response
        expect(setIndexBody.attributes.results.skipped[0].id).toEqual(simpleRule.id);
        expect(setIndexBody.attributes.results.skipped[0].name).toEqual(simpleRule.name);
        expect(setIndexBody.attributes.results.skipped[0].skip_reason).toEqual('RULE_NOT_MODIFIED');

        // Check that the rule has not been updated
        const { body: setIndexRule } = await fetchRule(ruleId).expect(200);

        expect(setIndexRule.index).toEqual(undefined);
        expect(setIndexRule.data_view_id).toEqual(dataViewId);
      });

      it('should set an index pattern to a rule and overwrite the data view when overwrite_data_views is true', async () => {
        const ruleId = 'ruleId';
        const dataViewId = 'index1-*';
        const simpleRule = {
          ...getSimpleRule(ruleId),
          index: undefined,
          data_view_id: dataViewId,
        };
        await createRule(supertest, log, simpleRule);

        const { body: setIndexBody } = await postBulkAction()
          .send({
            query: '',
            action: BulkActionTypeEnum.edit,
            [BulkActionTypeEnum.edit]: [
              {
                type: BulkActionEditTypeEnum.set_index_patterns,
                value: ['initial-index-*'],
                overwrite_data_views: true,
              },
            ],
          })
          .expect(200);

        expect(setIndexBody.attributes.summary).toEqual({
          failed: 0,
          skipped: 0,
          succeeded: 1,
          total: 1,
        });

        // Check that the updated rule is returned with the response
        expect(setIndexBody.attributes.results.updated[0].index).toEqual(['initial-index-*']);
        expect(setIndexBody.attributes.results.updated[0].data_view_id).toEqual(undefined);

        // Check that the updates have been persisted
        const { body: setIndexRule } = await fetchRule(ruleId).expect(200);

        expect(setIndexRule.index).toEqual(['initial-index-*']);
        expect(setIndexRule.data_view_id).toEqual(undefined);
      });

      it('should return error when set an empty index pattern to a rule and overwrite the data view when overwrite_data_views is true', async () => {
        const dataViewId = 'index1-*';
        const simpleRule = {
          ...getSimpleRule(),
          index: undefined,
          data_view_id: dataViewId,
        };
        const rule = await createRule(supertest, log, simpleRule);

        const { body } = await postBulkAction()
          .send({
            query: '',
            action: BulkActionTypeEnum.edit,
            [BulkActionTypeEnum.edit]: [
              {
                type: BulkActionEditTypeEnum.set_index_patterns,
                value: [],
                overwrite_data_views: true,
              },
            ],
          })
          .expect(500);

        expect(body.attributes.summary).toEqual({ failed: 1, skipped: 0, succeeded: 0, total: 1 });
        expect(body.attributes.errors[0]).toEqual({
          message: "Mutated params invalid: Index patterns can't be empty",
          status_code: 500,
          rules: [
            {
              id: rule.id,
              name: rule.name,
            },
          ],
        });
      });

      it('should return skipped rule and NOT set an index pattern to a rule or overwrite the data view when overwrite_data_views is false', async () => {
        const ruleId = 'ruleId';
        const dataViewId = 'index1-*';
        const simpleRule = await createRule(supertest, log, {
          ...getSimpleRule(ruleId),
          index: undefined,
          data_view_id: dataViewId,
        });

        const { body: setIndexBody } = await postBulkAction()
          .send({
            query: '',
            action: BulkActionTypeEnum.edit,
            [BulkActionTypeEnum.edit]: [
              {
                type: BulkActionEditTypeEnum.set_index_patterns,
                value: ['initial-index-*'],
                overwrite_data_views: false,
              },
            ],
          })
          .expect(200);

        expect(setIndexBody.attributes.summary).toEqual({
          failed: 0,
          skipped: 1,
          succeeded: 0,
          total: 1,
        });

        expect(setIndexBody.attributes.errors).toBe(undefined);

        // Check that the skipped rule is returned with the response
        expect(setIndexBody.attributes.results.skipped[0].id).toEqual(simpleRule.id);
        expect(setIndexBody.attributes.results.skipped[0].name).toEqual(simpleRule.name);
        expect(setIndexBody.attributes.results.skipped[0].skip_reason).toEqual('RULE_NOT_MODIFIED');

        // Check that the rule has not been updated
        const { body: setIndexRule } = await fetchRule(ruleId).expect(200);

        expect(setIndexRule.index).toEqual(undefined);
        expect(setIndexRule.data_view_id).toEqual(dataViewId);
      });

      // This rule will now not have a source defined - as has been the behavior of rules since the beginning
      // this rule will use the default index patterns on rule run
      it('should be successful on an attempt to remove index patterns from a rule with only a dataView (no index patterns exist on the rule), if overwrite_data_views is true', async () => {
        const dataViewId = 'index1-*';
        const ruleId = 'ruleId';
        const rule = await createRule(supertest, log, {
          ...getSimpleRule(ruleId),
          data_view_id: dataViewId,
          index: undefined,
        });

        const { body } = await postBulkAction()
          .send({
            ids: [rule.id],
            action: BulkActionTypeEnum.edit,
            [BulkActionTypeEnum.edit]: [
              {
                type: BulkActionEditTypeEnum.delete_index_patterns,
                value: ['simple-index-*'],
                overwrite_data_views: true,
              },
            ],
          })
          .expect(200);

        expect(body.attributes.summary).toEqual({
          failed: 0,
          skipped: 0,
          succeeded: 1,
          total: 1,
        });

        // Check that the updated rule is returned with the response
        expect(body.attributes.results.updated[0].index).toEqual(undefined);
        expect(body.attributes.results.updated[0].data_view_id).toEqual(undefined);

        // Check that the updates have been persisted
        const { body: setIndexRule } = await fetchRule(ruleId).expect(200);

        expect(setIndexRule.index).toEqual(undefined);
        expect(setIndexRule.data_view_id).toEqual(undefined);
      });

      it('should return error if all index patterns removed from a rule with data views and overwrite_data_views is true', async () => {
        const dataViewId = 'index1-*';
        const ruleId = 'ruleId';
        const rule = await createRule(supertest, log, {
          ...getSimpleRule(ruleId),
          data_view_id: dataViewId,
          index: ['simple-index-*'],
        });

        const { body } = await postBulkAction()
          .send({
            ids: [rule.id],
            action: BulkActionTypeEnum.edit,
            [BulkActionTypeEnum.edit]: [
              {
                type: BulkActionEditTypeEnum.delete_index_patterns,
                value: ['simple-index-*'],
                overwrite_data_views: true,
              },
            ],
          })
          .expect(500);

        expect(body.attributes.summary).toEqual({ failed: 1, skipped: 0, succeeded: 0, total: 1 });
        expect(body.attributes.errors[0]).toEqual({
          message: "Mutated params invalid: Index patterns can't be empty",
          status_code: 500,
          rules: [
            {
              id: rule.id,
              name: rule.name,
            },
          ],
        });
      });

      it('should return a skipped rule if all index patterns removed from a rule with data views and overwrite_data_views is false', async () => {
        const dataViewId = 'index1-*';
        const ruleId = 'ruleId';
        const rule = await createRule(supertest, log, {
          ...getSimpleRule(ruleId),
          data_view_id: dataViewId,
          index: ['simple-index-*'],
        });

        const { body } = await postBulkAction()
          .send({
            ids: [rule.id],
            action: BulkActionTypeEnum.edit,
            [BulkActionTypeEnum.edit]: [
              {
                type: BulkActionEditTypeEnum.delete_index_patterns,
                value: ['simple-index-*'],
                overwrite_data_views: false,
              },
            ],
          })
          .expect(200);

        expect(body.attributes.summary).toEqual({ failed: 0, skipped: 1, succeeded: 0, total: 1 });
        expect(body.attributes.errors).toBe(undefined);

        // Check that the skipped rule is returned with the response
        expect(body.attributes.results.skipped[0].id).toEqual(rule.id);
        expect(body.attributes.results.skipped[0].name).toEqual(rule.name);
        expect(body.attributes.results.skipped[0].skip_reason).toEqual('RULE_NOT_MODIFIED');
      });
    });

    describe('multiple_actions', () => {
      it('should return one updated rule when applying two valid operations on a rule', async () => {
        const ruleId = 'ruleId';
        const rule = await createRule(supertest, log, {
          ...getSimpleRule(ruleId),
          index: ['index1-*'],
          tags: ['tag1', 'tag2'],
        });

        const { body } = await postBulkAction()
          .send({
            ids: [rule.id],
            action: BulkActionTypeEnum.edit,
            [BulkActionTypeEnum.edit]: [
              {
                type: BulkActionEditTypeEnum.add_index_patterns,
                value: ['initial-index-*'],
              },
              {
                type: BulkActionEditTypeEnum.add_tags,
                value: ['tag3'],
              },
            ],
          })
          .expect(200);

        expect(body.attributes.summary).toEqual({ failed: 0, skipped: 0, succeeded: 1, total: 1 });

        // Check that the updated rule is returned with the response
        expect(body.attributes.results.updated[0].tags).toEqual(['tag1', 'tag2', 'tag3']);
        expect(body.attributes.results.updated[0].index).toEqual(['index1-*', 'initial-index-*']);

        // Check that the rule has been persisted
        const { body: updatedRule } = await fetchRule(ruleId).expect(200);

        expect(updatedRule.index).toEqual(['index1-*', 'initial-index-*']);
        expect(updatedRule.tags).toEqual(['tag1', 'tag2', 'tag3']);
      });

      it('should return one updated rule when applying one valid operation and one operation to be skipped on a rule', async () => {
        const ruleId = 'ruleId';
        const rule = await createRule(supertest, log, {
          ...getSimpleRule(ruleId),
          index: ['index1-*'],
          tags: ['tag1', 'tag2'],
        });

        const { body } = await postBulkAction()
          .send({
            ids: [rule.id],
            action: BulkActionTypeEnum.edit,
            [BulkActionTypeEnum.edit]: [
              // Valid operation
              {
                type: BulkActionEditTypeEnum.add_index_patterns,
                value: ['initial-index-*'],
              },
              // Operation to be skipped
              {
                type: BulkActionEditTypeEnum.add_tags,
                value: ['tag1'],
              },
            ],
          })
          .expect(200);

        expect(body.attributes.summary).toEqual({ failed: 0, skipped: 0, succeeded: 1, total: 1 });

        // Check that the updated rule is returned with the response
        expect(body.attributes.results.updated[0].tags).toEqual(['tag1', 'tag2']);
        expect(body.attributes.results.updated[0].index).toEqual(['index1-*', 'initial-index-*']);

        // Check that the rule has been persisted
        const { body: updatedRule } = await fetchRule(ruleId).expect(200);

        expect(updatedRule.index).toEqual(['index1-*', 'initial-index-*']);
        expect(updatedRule.tags).toEqual(['tag1', 'tag2']);
      });

      it('should return one skipped rule when two (all) operations result in a no-op', async () => {
        const ruleId = 'ruleId';
        const rule = await createRule(supertest, log, {
          ...getSimpleRule(ruleId),
          index: ['index1-*'],
          tags: ['tag1', 'tag2'],
        });

        const { body } = await postBulkAction()
          .send({
            ids: [rule.id],
            action: BulkActionTypeEnum.edit,
            [BulkActionTypeEnum.edit]: [
              // Operation to be skipped
              {
                type: BulkActionEditTypeEnum.add_index_patterns,
                value: ['index1-*'],
              },
              // Operation to be skipped
              {
                type: BulkActionEditTypeEnum.add_tags,
                value: ['tag1'],
              },
            ],
          })
          .expect(200);

        expect(body.attributes.summary).toEqual({ failed: 0, skipped: 1, succeeded: 0, total: 1 });

        // Check that the skipped rule is returned with the response
        expect(body.attributes.results.skipped[0].name).toEqual(rule.name);
        expect(body.attributes.results.skipped[0].id).toEqual(rule.id);
        expect(body.attributes.results.skipped[0].skip_reason).toEqual('RULE_NOT_MODIFIED');

        // Check that no change to the rule have been persisted
        const { body: skippedRule } = await fetchRule(ruleId).expect(200);

        expect(skippedRule.index).toEqual(['index1-*']);
        expect(skippedRule.tags).toEqual(['tag1', 'tag2']);
      });
    });

    describe('gaps_range filtering', () => {
      it('should not affect rules without gaps when using gaps_range filters', async () => {
        // Create two rules without gaps
        await createRule(supertest, log, {
          ...getSimpleRule('rule-without-gaps-1'),
        });
        await createRule(supertest, log, {
          ...getSimpleRule('rule-without-gaps-2'),
        });

        // Execute bulk action with gaps range filter
        const { body } = await postBulkAction().send({
          query: '',
          action: BulkActionTypeEnum.duplicate,
          gaps_range_start: '2025-01-01T00:00:00.000Z',
          gaps_range_end: '2025-01-02T00:00:00.000Z',
          gap_fill_statuses: [gapFillStatus.UNFILLED],
          duplicate: { include_exceptions: false, include_expired_exceptions: false },
        });

        // Verify the summary shows no rules were processed
        expect(body.attributes.summary).toEqual({
          failed: 0,
          skipped: 0,
          succeeded: 0,
          total: 0,
        });
      });
    });

    it('should limit concurrent requests to 5', async () => {
      const ruleId = 'ruleId';
      const timelineId = '91832785-286d-4ebe-b884-1a208d111a70';
      const timelineTitle = 'Test timeline';
      await createRule(supertest, log, getSimpleRule(ruleId));

      const responses = await Promise.all(
        Array.from({ length: 10 }).map(() =>
          postBulkAction().send({
            query: '',
            action: BulkActionTypeEnum.edit,
            [BulkActionTypeEnum.edit]: [
              {
                type: BulkActionEditTypeEnum.set_timeline,
                value: {
                  timeline_id: timelineId,
                  timeline_title: timelineTitle,
                },
              },
            ],
          })
        )
      );

      expect(responses.filter((r) => r.body.statusCode === 429).length).toEqual(5);
    });

    it('should bulk update rule by id', async () => {
      const ruleId = 'ruleId';
      const timelineId = '91832785-286d-4ebe-b884-1a208d111a70';
      const timelineTitle = 'Test timeline';
      await createRule(supertest, log, getSimpleRule(ruleId));
      const {
        body: { id },
      } = await fetchRule(ruleId);

      const { body } = await postBulkAction()
        .send({
          ids: [id],
          action: BulkActionTypeEnum.edit,
          [BulkActionTypeEnum.edit]: [
            {
              type: BulkActionEditTypeEnum.set_timeline,
              value: {
                timeline_id: timelineId,
                timeline_title: timelineTitle,
              },
            },
          ],
        })
        .expect(200);

      expect(body.attributes.summary).toEqual({ failed: 0, skipped: 0, succeeded: 1, total: 1 });

      // Check that the updated rule is returned with the response
      expect(body.attributes.results.updated[0].timeline_id).toEqual(timelineId);
      expect(body.attributes.results.updated[0].timeline_title).toEqual(timelineTitle);

      // Check that the updates have been persisted
      const { body: rule } = await fetchRule(ruleId).expect(200);

      expect(rule.timeline_id).toEqual(timelineId);
      expect(rule.timeline_title).toEqual(timelineTitle);
    });

    describe('RBAC', () => {
      describe('@skipInServerless with rules_read_custom_highlighted_fields_all user role', () => {
        const role = ROLES.rules_read_custom_highlighted_fields_all;

        beforeEach(async () => {
          await createUserAndRole(getService, role);
        });

        afterEach(async () => {
          await deleteUserAndRole(getService, role);
        });

        it('should allow bulk setting investigation_fields', async () => {
          const ruleId = 'ruleId';
          const createdRule = await createRule(
            supertest,
            log,
            getCustomQueryRuleParams({ rule_id: ruleId })
          );

          const restrictedUser = { username: role, password: 'changeme' };
          const restrictedApis = detectionsApi.withUser(restrictedUser);

          const { body } = await restrictedApis.performRulesBulkAction({
            query: {},
            body: {
              ids: [createdRule.id],
              action: BulkActionTypeEnum.edit,
              [BulkActionTypeEnum.edit]: [
                {
                  type: BulkActionEditTypeEnum.set_investigation_fields,
                  value: { field_names: ['host.name', 'user.name'] },
                },
              ],
            },
          });

          expect(body.attributes.summary).toEqual({
            failed: 0,
            skipped: 0,
            succeeded: 1,
            total: 1,
          });
          expect(body.attributes.results.updated[0].investigation_fields).toEqual({
            field_names: ['host.name', 'user.name'],
          });
        });

        it('should allow bulk adding investigation_fields', async () => {
          const ruleId = 'ruleId';
          const createdRule = await createRule(supertest, log, {
            ...getSimpleRule(ruleId),
            investigation_fields: { field_names: ['host.name'] },
          });

          const restrictedUser = { username: role, password: 'changeme' };
          const restrictedApis = detectionsApi.withUser(restrictedUser);

          const { body } = await restrictedApis.performRulesBulkAction({
            query: {},
            body: {
              ids: [createdRule.id],
              action: BulkActionTypeEnum.edit,
              [BulkActionTypeEnum.edit]: [
                {
                  type: BulkActionEditTypeEnum.add_investigation_fields,
                  value: { field_names: ['user.name'] },
                },
              ],
            },
          });

          expect(body.attributes.summary).toEqual({
            failed: 0,
            skipped: 0,
            succeeded: 1,
            total: 1,
          });
          expect(body.attributes.results.updated[0].investigation_fields).toEqual({
            field_names: ['host.name', 'user.name'],
          });
        });

        it('should allow bulk deleting investigation_fields', async () => {
          const ruleId = 'ruleId';
          const createdRule = await createRule(supertest, log, {
            ...getSimpleRule(ruleId),
            investigation_fields: { field_names: ['host.name', 'user.name'] },
          });

          const restrictedUser = { username: role, password: 'changeme' };
          const restrictedApis = detectionsApi.withUser(restrictedUser);

          const { body } = await restrictedApis.performRulesBulkAction({
            query: {},
            body: {
              ids: [createdRule.id],
              action: BulkActionTypeEnum.edit,
              [BulkActionTypeEnum.edit]: [
                {
                  type: BulkActionEditTypeEnum.delete_investigation_fields,
                  value: { field_names: ['user.name'] },
                },
              ],
            },
          });

          expect(body.attributes.summary).toEqual({
            failed: 0,
            skipped: 0,
            succeeded: 1,
            total: 1,
          });
          expect(body.attributes.results.updated[0].investigation_fields).toEqual({
            field_names: ['host.name'],
          });
        });
      });

      describe('@skipInServerless without custom highlighted fields subfeature permission', () => {
        const role = ROLES.rules_read_investigation_guide_all;

        beforeEach(async () => {
          await createUserAndRole(getService, role);
        });

        afterEach(async () => {
          await deleteUserAndRole(getService, role);
        });

        it('should fail bulk setting investigation_fields', async () => {
          const ruleId = 'ruleId';
          const createdRule = await createRule(
            supertest,
            log,
            getCustomQueryRuleParams({ rule_id: ruleId })
          );

          const restrictedUser = { username: role, password: 'changeme' };
          const restrictedApis = detectionsApi.withUser(restrictedUser);

          const { body } = await restrictedApis.performRulesBulkAction({
            query: {},
            body: {
              ids: [createdRule.id],
              action: BulkActionTypeEnum.edit,
              [BulkActionTypeEnum.edit]: [
                {
                  type: BulkActionEditTypeEnum.set_investigation_fields,
                  value: { field_names: ['host.name', 'user.name'] },
                },
              ],
            },
          });

          expect(body.attributes.summary).toEqual({
            failed: 1,
            skipped: 0,
            succeeded: 0,
            total: 1,
          });
          expect(body.attributes.errors[0]).toEqual({
            message: 'User does not have permission to edit custom highlighted fields',
            status_code: 500,
            rules: [
              {
                id: createdRule.id,
                name: createdRule.name,
              },
            ],
          });
        });

        it('should fail bulk adding investigation_fields', async () => {
          const ruleId = 'ruleId';
          const createdRule = await createRule(supertest, log, {
            ...getSimpleRule(ruleId),
            investigation_fields: { field_names: ['host.name'] },
          });

          const restrictedUser = { username: role, password: 'changeme' };
          const restrictedApis = detectionsApi.withUser(restrictedUser);

          const { body } = await restrictedApis.performRulesBulkAction({
            query: {},
            body: {
              ids: [createdRule.id],
              action: BulkActionTypeEnum.edit,
              [BulkActionTypeEnum.edit]: [
                {
                  type: BulkActionEditTypeEnum.add_investigation_fields,
                  value: { field_names: ['user.name'] },
                },
              ],
            },
          });

          expect(body.attributes.summary).toEqual({
            failed: 1,
            skipped: 0,
            succeeded: 0,
            total: 1,
          });
          expect(body.attributes.errors[0]).toEqual({
            message: 'User does not have permission to edit custom highlighted fields',
            status_code: 500,
            rules: [
              {
                id: createdRule.id,
                name: createdRule.name,
              },
            ],
          });
        });

        it('should fail bulk deleting investigation_fields', async () => {
          const ruleId = 'ruleId';
          const createdRule = await createRule(supertest, log, {
            ...getSimpleRule(ruleId),
            investigation_fields: { field_names: ['host.name', 'user.name'] },
          });

          const restrictedUser = { username: role, password: 'changeme' };
          const restrictedApis = detectionsApi.withUser(restrictedUser);

          const { body } = await restrictedApis.performRulesBulkAction({
            query: {},
            body: {
              ids: [createdRule.id],
              action: BulkActionTypeEnum.edit,
              [BulkActionTypeEnum.edit]: [
                {
                  type: BulkActionEditTypeEnum.delete_investigation_fields,
                  value: { field_names: ['user.name'] },
                },
              ],
            },
          });

          expect(body.attributes.summary).toEqual({
            failed: 1,
            skipped: 0,
            succeeded: 0,
            total: 1,
          });
          expect(body.attributes.errors[0]).toEqual({
            message: 'User does not have permission to edit custom highlighted fields',
            status_code: 500,
            rules: [
              {
                id: createdRule.id,
                name: createdRule.name,
              },
            ],
          });
        });
      });
    });
  });
};
