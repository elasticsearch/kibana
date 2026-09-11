/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from 'expect';

import { DETECTION_ENGINE_RULES_IMPORT_URL } from '@kbn/security-solution-plugin/common/constants';
import { ROLES } from '@kbn/security-solution-plugin/common/test';
import { deleteAllRules, createRule } from '@kbn/detections-response-ftr-services';
import {
  createLegacyRuleAction,
  getLegacyActionSO,
  fetchRule,
  checkInvestigationFieldSoValue,
  combineToNdJson,
  getCustomQueryRuleParams,
  getMLRuleParams,
} from '../../../utils';
import { createUserAndRole, deleteUserAndRole } from '../../../../../config/services/common';
import type { FtrProviderContext } from '../../../../../ftr_provider_context';
import { createConnector } from '../../../utils/connectors';
import { getWebHookConnectorParams } from '../../../utils/connectors/get_web_hook_connector_params';

export default ({ getService }: FtrProviderContext): void => {
  const supertest = getService('supertest');
  const detectionsApi = getService('detectionsApi');
  const log = getService('log');
  const es = getService('es');
  const supertestWithoutAuth = getService('supertestWithoutAuth');

  describe('@ess import_rules - ESS specific logic', () => {
    beforeEach(async () => {
      await deleteAllRules(supertest, log);
    });

    it('should migrate legacy actions in existing rule if overwrite is set to true', async () => {
      const ruleToOverwrite = getCustomQueryRuleParams({
        rule_id: 'rule-1',
        interval: '1h', // action frequency can't be shorter than the schedule interval
      });

      const [connectorId, createdRule] = await Promise.all([
        createConnector(supertest, {
          name: 'My action',
          connector_type_id: '.slack',
          config: {},
          secrets: {
            webhookUrl: 'http://localhost:1234',
          },
        }),
        createRule(supertest, log, ruleToOverwrite),
      ]);
      await createLegacyRuleAction(supertest, createdRule.id, connectorId);

      // check for legacy sidecar action
      const sidecarActionsResults = await getLegacyActionSO(es);

      expect(sidecarActionsResults.hits.hits.length).toBe(1);
      expect(sidecarActionsResults.hits.hits[0]?._source?.references[0].id).toBe(createdRule.id);

      const ndjson = combineToNdJson(
        getCustomQueryRuleParams({ rule_id: 'rule-1', name: 'some other name' })
      );

      await supertest
        .post(`${DETECTION_ENGINE_RULES_IMPORT_URL}?overwrite=true`)
        .set('kbn-xsrf', 'true')
        .set('elastic-api-version', '2023-10-31')
        .attach('file', Buffer.from(ndjson), 'rules.ndjson')
        .expect(200);

      // legacy sidecar action should be gone
      const sidecarActionsPostResults = await getLegacyActionSO(es);

      expect(sidecarActionsPostResults.hits.hits.length).toBe(0);

      const overwritten = await fetchRule(supertest, { ruleId: 'rule-1' });
      expect(overwritten.id).toBe(createdRule.id);
      expect(overwritten.name).toBe('some other name');
    });

    describe('importing rules with different roles', () => {
      before(async () => {
        await createUserAndRole(getService, ROLES.hunter_no_actions);
        await createUserAndRole(getService, ROLES.hunter);
        await createUserAndRole(getService, ROLES.t1_analyst);
      });
      after(async () => {
        await deleteUserAndRole(getService, ROLES.hunter_no_actions);
        await deleteUserAndRole(getService, ROLES.hunter);
        await deleteUserAndRole(getService, ROLES.t1_analyst);
      });

      it('returns 403 when the user lacks rules write privilege', async () => {
        const ndjson = combineToNdJson(
          getCustomQueryRuleParams({
            rule_id: 'rbac-import-denied',
            enabled: false,
          })
        );

        await supertestWithoutAuth
          .post(DETECTION_ENGINE_RULES_IMPORT_URL)
          .auth(ROLES.t1_analyst, 'changeme')
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .attach('file', Buffer.from(ndjson), 'rules.ndjson')
          .expect(403);

        await detectionsApi.readRule({ query: { rule_id: 'rbac-import-denied' } }).expect(404);
      });

      it('returns a per-rule error when the user is not an ML admin', async () => {
        const ndjson = combineToNdJson(
          getMLRuleParams({
            rule_id: 'ml-authz-denied',
            enabled: false,
          }),
          getCustomQueryRuleParams({
            rule_id: 'query-ok',
            enabled: false,
          })
        );

        const { body } = await supertestWithoutAuth
          .post(DETECTION_ENGINE_RULES_IMPORT_URL)
          .auth(ROLES.hunter, 'changeme')
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .attach('file', Buffer.from(ndjson), 'rules.ndjson')
          .expect(200);

        expect(body).toMatchObject({
          success: false,
          success_count: 1,
          rules_count: 2,
          errors: [
            {
              error: {
                message: 'The current user is not a machine learning administrator.',
                status_code: 400,
              },
              rule_id: 'ml-authz-denied',
            },
          ],
        });

        await detectionsApi.readRule({ query: { rule_id: 'ml-authz-denied' } }).expect(404);
        await detectionsApi.readRule({ query: { rule_id: 'query-ok' } }).expect(200);
      });

      it('should successfully import rules without actions when user has no actions privileges', async () => {
        const rule = getCustomQueryRuleParams({
          rule_id: 'hunter-no-actions-rule',
          name: 'Hunter no actions rule',
          enabled: false,
        });
        const ndjson = combineToNdJson(rule);

        const { body } = await supertestWithoutAuth
          .post(DETECTION_ENGINE_RULES_IMPORT_URL)
          .auth(ROLES.hunter_no_actions, 'changeme')
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .attach('file', Buffer.from(ndjson), 'rules.ndjson')
          .expect(200);

        expect(body).toMatchObject({
          errors: [],
          success: true,
          success_count: 1,
          rules_count: 1,
          action_connectors_success: true,
          action_connectors_success_count: 0,
          action_connectors_errors: [],
          action_connectors_warnings: [],
        });

        const { body: imported } = await detectionsApi
          .readRule({ query: { rule_id: 'hunter-no-actions-rule' } })
          .expect(200);
        expect(imported.name).toBe('Hunter no actions rule');
      });

      it('should NOT import rules with actions when user has "read" actions privileges', async () => {
        const connectorId = await createConnector(supertest, getWebHookConnectorParams());
        const ndjson = combineToNdJson(
          getCustomQueryRuleParams({
            rule_id: 'rule-with-actions',
            actions: [
              {
                group: 'default',
                id: 'cabc78e0-9031-11ed-b076-53cc4d57aaf1',
                action_type_id: connectorId,
                params: {},
              },
            ],
          }),
          {
            id: 'cabc78e0-9031-11ed-b076-53cc4d57aaf1',
            type: 'action',
            updated_at: '2023-01-25T14:35:52.852Z',
            created_at: '2023-01-25T14:35:52.852Z',
            version: 'WzUxNTksMV0=',
            attributes: {
              actionTypeId: '.webhook',
              name: 'webhook',
              isMissingSecrets: true,
              config: {},
              secrets: {},
            },
            references: [],
            migrationVersion: { action: '8.3.0' },
            coreMigrationVersion: '8.7.0',
          }
        );

        const { body } = await supertestWithoutAuth
          .post(DETECTION_ENGINE_RULES_IMPORT_URL)
          .auth(ROLES.hunter, 'changeme')
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .attach('file', Buffer.from(ndjson), 'rules.ndjson')
          .expect(200);

        expect(body).toMatchObject({
          errors: [
            {
              error: {
                message:
                  'Rule actions reference the following missing action IDs: cabc78e0-9031-11ed-b076-53cc4d57aaf1',
                status_code: 404,
              },
              rule_id: 'rule-with-actions',
            },
          ],
          success: false,
          success_count: 0,
          rules_count: 1,
          action_connectors_success: false,
          action_connectors_success_count: 0,
          action_connectors_errors: [
            {
              error: {
                message:
                  'You may not have actions privileges required to import actions: Unable to bulk_create action',
                status_code: 403,
              },
            },
          ],
          action_connectors_warnings: [],
        });
      });

      it('should NOT import rules with actions when a user has no actions privileges', async () => {
        const connectorId = await createConnector(supertest, getWebHookConnectorParams());
        const ndjson = combineToNdJson(
          getCustomQueryRuleParams({
            rule_id: 'rule-with-actions',
            actions: [
              {
                group: 'default',
                id: 'cabc78e0-9031-11ed-b076-53cc4d57aaf1',
                action_type_id: connectorId,
                params: {},
              },
            ],
          }),
          {
            id: 'cabc78e0-9031-11ed-b076-53cc4d57axy1',
            type: 'action',
            updated_at: '2023-01-25T14:35:52.852Z',
            created_at: '2023-01-25T14:35:52.852Z',
            version: 'WzUxNTksMV0=',
            attributes: {
              actionTypeId: '.webhook',
              name: 'webhook',
              isMissingSecrets: true,
              config: {},
              secrets: {},
            },
            references: [],
            migrationVersion: { action: '8.3.0' },
            coreMigrationVersion: '8.7.0',
          }
        );

        const { body } = await supertestWithoutAuth
          .post(DETECTION_ENGINE_RULES_IMPORT_URL)
          .auth(ROLES.hunter_no_actions, 'changeme')
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .attach('file', Buffer.from(ndjson), 'rules.ndjson')
          .expect(200);

        expect(body).toMatchObject({
          success: false,
          success_count: 0,
          errors: [
            {
              error: {
                message:
                  'You may not have actions privileges required to import rules with actions: Unauthorized to get actions',
                status_code: 403,
              },
              rule_id: 'rule-with-actions',
            },
          ],
          rules_count: 1,
          action_connectors_success: false,
          action_connectors_success_count: 0,
          action_connectors_errors: [
            {
              error: {
                message:
                  'You may not have actions privileges required to import actions: Unable to bulk_create action',
                status_code: 403,
              },
            },
          ],
          action_connectors_warnings: [],
        });
      });
    });

    describe('legacy investigation fields', () => {
      it('imports rule with investigation fields as array', async () => {
        const ndjson = combineToNdJson(
          getCustomQueryRuleParams({
            ruleId: 'rule-1',
            // mimicking what an 8.10 rule would look like
            // we don't want to support this type in our APIs any longer, but do
            // want to allow users to import rules from 8.10
            // @ts-expect-error
            investigation_fields: ['foo', 'bar'],
          })
        );

        await supertest
          .post(DETECTION_ENGINE_RULES_IMPORT_URL)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .attach('file', Buffer.from(ndjson), 'rules.ndjson')
          .expect('Content-Type', 'application/json; charset=utf-8')
          .expect(200);

        const rule = await fetchRule(supertest, { ruleId: 'rule-1' });

        expect(rule.investigation_fields).toEqual({ field_names: ['foo', 'bar'] });

        /**
         * Confirm type on SO so that it's clear in the tests whether it's expected that
         * the SO itself is migrated to the inteded object type, or if the transformation is
         * happening just on the response. In this case, change should
         * include a migration on SO.
         */
        const isInvestigationFieldMigratedInSo = await checkInvestigationFieldSoValue(
          undefined,
          { field_names: ['foo', 'bar'] },
          es,
          rule.id
        );
        expect(isInvestigationFieldMigratedInSo).toBeTruthy();
      });

      it('imports rule with investigation fields as empty array', async () => {
        const ndjson = combineToNdJson(
          getCustomQueryRuleParams({
            ruleId: 'rule-1',
            // mimicking what an 8.10 rule would look like
            // we don't want to support this type in our APIs any longer, but do
            // want to allow users to import rules from 8.10
            // @ts-expect-error
            investigation_fields: [],
          })
        );

        await supertest
          .post(DETECTION_ENGINE_RULES_IMPORT_URL)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .attach('file', Buffer.from(ndjson), 'rules.ndjson')
          .expect('Content-Type', 'application/json; charset=utf-8')
          .expect(200);

        const rule = await fetchRule(supertest, { ruleId: 'rule-1' });

        expect(rule.investigation_fields).toBeUndefined();

        /**
         * Confirm type on SO so that it's clear in the tests whether it's expected that
         * the SO itself is migrated to the inteded object type, or if the transformation is
         * happening just on the response. In this case, change should
         * include a migration on SO.
         */
        const isInvestigationFieldMigratedInSo = await checkInvestigationFieldSoValue(
          undefined,
          undefined,
          es,
          rule.id
        );
        expect(isInvestigationFieldMigratedInSo).toBeTruthy();
      });

      it('imports rule with investigation fields as intended object type', async () => {
        const ndjson = combineToNdJson(
          getCustomQueryRuleParams({
            rule_id: 'rule-1',
            investigation_fields: {
              field_names: ['foo'],
            },
          })
        );

        await supertest
          .post(DETECTION_ENGINE_RULES_IMPORT_URL)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .attach('file', Buffer.from(ndjson), 'rules.ndjson')
          .expect('Content-Type', 'application/json; charset=utf-8')
          .expect(200);

        const rule = await fetchRule(supertest, { ruleId: 'rule-1' });

        expect(rule.investigation_fields).toEqual({ field_names: ['foo'] });
        /**
         * Confirm type on SO so that it's clear in the tests whether it's expected that
         * the SO itself is migrated to the inteded object type, or if the transformation is
         * happening just on the response. In this case, change should
         * include a migration on SO.
         */
        const isInvestigationFieldIntendedTypeInSo = await checkInvestigationFieldSoValue(
          undefined,
          { field_names: ['foo'] },
          es,
          rule.id
        );
        expect(isInvestigationFieldIntendedTypeInSo).toBeTruthy();
      });
    });
  });
};
