/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import type {
  SavedObject,
  SavedObjectsBulkUpdateResponse,
} from '@kbn/core-saved-objects-api-server';
import { isSavedObjectErrorResult } from '@kbn/core/server';
import { bulkGetRulesSo, bulkUpdateRuleSo } from '../../../../data/rule';
import type { BulkEditOperationResult } from '../../../../rules_client/common/bulk_edit';
import { retryIfBulkEditConflicts } from '../../../../rules_client/common';
import { transformParamsRulesToAlertInstances } from '../../transforms/transform_bulk_mute_unmute_rules_to_alert_instances';
import { RULE_SAVED_OBJECT_TYPE } from '../../../../saved_objects';
import { bulkMuteUnmuteAlertsParamsSchema } from '../../schemas/bulk_mute_unmute_schema';
import type { BulkMuteUnmuteAlertsParams } from '../../types';
import type { BulkEnsureAuthorizedOpts } from '../../../../authorization';
import { AlertingAuthorizationEntity, WriteOperations } from '../../../../authorization';
import { RuleAuditAction, ruleAuditEvent } from '../../../../rules_client/common/audit_events';
import type { RulesClientContext } from '../../../../rules_client/types';
import { transformMuteRequestToRuleAttributes } from './transforms/transform_rule_mute_instance_ids';
import { transformUnmuteRequestToRuleAttributes } from './transforms/transform_rule_unmute_instance_ids';
import type { RawRule } from '../../../../saved_objects/schemas/raw_rule';

interface BulkMuteUnmuteArgs {
  params: BulkMuteUnmuteAlertsParams;
  mute: boolean;
}

export async function bulkMuteUnmuteInstances(
  context: RulesClientContext,
  { params, mute }: BulkMuteUnmuteArgs
): Promise<void> {
  try {
    bulkMuteUnmuteAlertsParamsSchema.validate(params);
  } catch (error) {
    throw Boom.badRequest(`Failed to validate params: ${error.message}`);
  }

  await retryIfBulkEditConflicts(
    context.logger,
    `rulesClient.bulkMuteUnmuteInstances('${JSON.stringify(params)}', ${mute})`,
    async () => await bulkMuteUnmuteInstancesWithOCC(context, { params, mute })
  );
}

const EMPTY_RESULT: BulkEditOperationResult = {
  apiKeysToInvalidate: [],
  resultSavedObjects: [],
  errors: [],
  rules: [],
  skipped: [],
};

async function bulkMuteUnmuteInstancesWithOCC(
  context: RulesClientContext,
  { params, mute }: BulkMuteUnmuteArgs
): Promise<BulkEditOperationResult> {
  let bulkUpdateRes: SavedObjectsBulkUpdateResponse<RawRule>;

  if (params.rules.length === 0) {
    return EMPTY_RESULT;
  }

  const rules = await bulkGetRulesSo({
    savedObjectsClient: context.unsecuredSavedObjectsClient,
    ids: params.rules.map((p) => p.id),
  });

  try {
    const rulesSavedObjects: Array<SavedObject<RawRule>> = [];
    const ruleTypeIdConsumersPairs: BulkEnsureAuthorizedOpts['ruleTypeIdConsumersPairs'] = [];
    const ruleTypeIds = new Set<string>();

    if (rules.saved_objects.length === 0) {
      throw Boom.badRequest(`Rules not found: ${JSON.stringify(params.rules.map((r) => r.id))}`);
    }

    rules.saved_objects.forEach((rule) => {
      if (isSavedObjectErrorResult(rule)) {
        return;
      }

      rulesSavedObjects.push(rule);
      ruleTypeIds.add(rule.attributes.alertTypeId);
      ruleTypeIdConsumersPairs.push({
        ruleTypeId: rule.attributes.alertTypeId,
        consumers: [rule.attributes.consumer],
      });
    });
    const indices = context.getAlertIndicesAlias(Array.from(ruleTypeIds), context.spaceId);

    await context.authorization.bulkEnsureAuthorized({
      ruleTypeIdConsumersPairs,
      operation: mute ? WriteOperations.MuteAlert : WriteOperations.UnmuteAlert,
      entity: AlertingAuthorizationEntity.Rule,
    });

    const action = mute ? RuleAuditAction.BULK_MUTE_ALERTS : RuleAuditAction.BULK_UNMUTE_ALERTS;
    for (const rule of rulesSavedObjects) {
      context.auditLogger?.log(
        ruleAuditEvent({
          action,
          outcome: 'unknown',
          savedObject: { type: RULE_SAVED_OBJECT_TYPE, id: rule.id, name: rule.attributes.name },
        })
      );
    }

    const rulesToUpdate = mute
      ? transformMuteRequestToRuleAttributes({
          savedRules: rulesSavedObjects,
          paramRules: params.rules,
        })
      : transformUnmuteRequestToRuleAttributes({
          savedRules: rulesSavedObjects,
          paramRules: params.rules,
        });

    bulkUpdateRes = await bulkUpdateRuleSo({
      savedObjectsClient: context.unsecuredSavedObjectsClient,
      rules: rulesToUpdate,
    });

    if (indices && indices.length > 0) {
      const options = {
        targets: transformParamsRulesToAlertInstances(params.rules),
        indices,
        logger: context.logger,
      };
      if (mute) {
        await context.alertsService?.muteAlertInstances(options);
      } else {
        await context.alertsService?.unmuteAlertInstances(options);
      }
    }
  } catch (error) {
    const action = mute ? RuleAuditAction.BULK_MUTE_ALERTS : RuleAuditAction.BULK_UNMUTE_ALERTS;
    context.auditLogger?.log(
      ruleAuditEvent({
        action,
        error,
      })
    );
    const alertAction = mute ? 'muting' : 'unmuting';
    context.logger.error(`Error while bulk ${alertAction} alerts: ${error.message}`);

    throw error;
  }

  return {
    apiKeysToInvalidate: [],
    resultSavedObjects: bulkUpdateRes.saved_objects ?? [],
    errors: [],
    rules: [],
    skipped: [],
  };
}
