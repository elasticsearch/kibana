/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { Rule } from '@kbn/alerting-plugin/common';
import type { BaseRuleParams } from '@kbn/security-solution-plugin/server/lib/detection_engine/rule_schema';

import { DETECTION_ENGINE_RULES_URL } from '@kbn/security-solution-plugin/common/constants';

import {
  createAlertsIndex,
  deleteAllRules,
  deleteAllAlerts,
  createRule,
} from '@kbn/detections-response-ftr-services';
import {
  removeServerGeneratedProperties,
  createRuleThroughAlertingEndpoint,
  getRuleSavedObjectWithLegacyInvestigationFields,
  getRuleSavedObjectWithLegacyInvestigationFieldsEmptyArray,
  getLegacyActionSO,
  getSimpleRuleOutput,
  updateUsername,
  createLegacyRuleAction,
  getSimpleRule,
  checkInvestigationFieldSoValue,
} from '../../../utils';
import type { FtrProviderContext } from '../../../../../ftr_provider_context';

export default ({ getService }: FtrProviderContext) => {
  const supertest = getService('supertest');
  const log = getService('log');
  const es = getService('es');
  const utils = getService('securitySolutionUtils');

  describe('@ess patch_rules - ESS specific logic', () => {
    describe('patch rules', () => {
      beforeEach(async () => {
        await createAlertsIndex(supertest, log);
      });

      afterEach(async () => {
        await deleteAllAlerts(supertest, log, es);
        await deleteAllRules(supertest, log);
      });

      // This is breaking due to this bug: https://github.com/elastic/kibana/issues/252794
      it.skip('should return the rule with migrated actions after the enable patch', async () => {
        const [connector, rule] = await Promise.all([
          supertest
            .post(`/api/actions/connector`)
            .set('kbn-xsrf', 'foo')
            .send({
              name: 'My action',
              connector_type_id: '.slack',
              secrets: {
                webhookUrl: 'http://localhost:1234',
              },
            }),
          createRule(supertest, log, getSimpleRule('rule-1')),
        ]);
        await createLegacyRuleAction(supertest, rule.id, connector.body.id);

        // check for legacy sidecar action
        const sidecarActionsResults = await getLegacyActionSO(es);
        expect(sidecarActionsResults.hits.hits.length).to.eql(1);
        expect(sidecarActionsResults.hits.hits[0]?._source?.references[0].id).to.eql(rule.id);

        // patch disable the rule
        const patchResponse = await supertest
          .patch(DETECTION_ENGINE_RULES_URL)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .send({ id: rule.id, enabled: false })
          .expect(200);

        const bodyToCompare = removeServerGeneratedProperties(patchResponse.body);
        const outputRule = updateUsername(getSimpleRuleOutput(), await utils.getUsername());

        outputRule.actions = [
          {
            action_type_id: '.slack',
            group: 'default',
            id: connector.body.id,
            params: {
              message:
                'Hourly\nRule {{context.rule.name}} generated {{state.signals_count}} alerts',
            },
            uuid: bodyToCompare.actions[0].uuid,
            frequency: { summary: true, throttle: '1h', notifyWhen: 'onThrottleInterval' },
          },
        ];
        outputRule.revision = 1;
        expect(bodyToCompare).to.eql(outputRule);

        // legacy sidecar action should be gone
        const sidecarActionsPostResults = await getLegacyActionSO(es);
        expect(sidecarActionsPostResults.hits.hits.length).to.eql(0);
      });

      describe('investigation_fields legacy', () => {
        let ruleWithLegacyInvestigationField: Rule<BaseRuleParams>;
        let ruleWithLegacyInvestigationFieldEmptyArray: Rule<BaseRuleParams>;

        beforeEach(async () => {
          ruleWithLegacyInvestigationField = await createRuleThroughAlertingEndpoint(
            supertest,
            getRuleSavedObjectWithLegacyInvestigationFields()
          );
          ruleWithLegacyInvestigationFieldEmptyArray = await createRuleThroughAlertingEndpoint(
            supertest,
            getRuleSavedObjectWithLegacyInvestigationFieldsEmptyArray()
          );
        });

        afterEach(async () => {
          await deleteAllRules(supertest, log);
        });

        it('errors if trying to patch investigation fields using legacy format', async () => {
          const { body } = await supertest
            .patch(DETECTION_ENGINE_RULES_URL)
            .set('kbn-xsrf', 'true')
            .set('elastic-api-version', '2023-10-31')
            .send({
              rule_id: ruleWithLegacyInvestigationField.params.ruleId,
              name: 'some other name',
              investigation_fields: ['client.foo'],
            })
            .expect(400);

          expect(body.message).to.eql(
            '[request body]: investigation_fields: Invalid input: expected object, received array'
          );
        });

        it('should patch a rule with a legacy investigation field and migrate field', async () => {
          const { body } = await supertest
            .patch(DETECTION_ENGINE_RULES_URL)
            .set('kbn-xsrf', 'true')
            .set('elastic-api-version', '2023-10-31')
            .send({
              rule_id: ruleWithLegacyInvestigationField.params.ruleId,
              name: 'some other name',
            })
            .expect(200);

          const bodyToCompare = removeServerGeneratedProperties(body);
          expect(bodyToCompare.investigation_fields).to.eql({
            field_names: ['client.address', 'agent.name'],
          });

          const isInvestigationFieldMigratedInSo = await checkInvestigationFieldSoValue(
            undefined,
            {
              field_names: ['client.address', 'agent.name'],
            },
            es,
            body.id
          );
          expect(isInvestigationFieldMigratedInSo).to.eql(true);
        });

        it('should patch a rule with a legacy investigation field - empty array - and transform response', async () => {
          const { body } = await supertest
            .patch(DETECTION_ENGINE_RULES_URL)
            .set('kbn-xsrf', 'true')
            .set('elastic-api-version', '2023-10-31')
            .send({
              rule_id: ruleWithLegacyInvestigationFieldEmptyArray.params.ruleId,
              name: 'some other name',
            })
            .expect(200);

          const bodyToCompare = removeServerGeneratedProperties(body);
          expect(bodyToCompare.investigation_fields).to.eql(undefined);
          /**
           * Confirm type on SO so that it's clear in the tests whether it's expected that
           * the SO itself is migrated to the inteded object type, or if the transformation is
           * happening just on the response. In this case, change should
           * NOT include a migration on SO.
           */
          const isInvestigationFieldMigratedInSo = await checkInvestigationFieldSoValue(
            undefined,
            {
              field_names: [],
            },
            es,
            body.id
          );
          expect(isInvestigationFieldMigratedInSo).to.eql(false);
        });
      });
    });
  });
};
