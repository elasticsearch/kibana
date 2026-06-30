/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import { AlertConsumers } from '@kbn/rule-data-utils';
import { updateRuleSo } from '../../../../data/rule/methods/update_rule_so';
import { RULE_SAVED_OBJECT_TYPE } from '../../../../saved_objects';
import type { RawRule } from '../../../../saved_objects/schemas/raw_rule';
import { AlertingAuthorizationEntity, WriteOperations } from '../../../../authorization';
import { retryIfConflicts } from '../../../../lib/retry_if_conflicts';
import { updateMeta } from '../../../../rules_client/lib';
import { AlertAuditAction, alertAuditEvent } from '../../../../lib/alert_audit_events';
import { removePerAlertSnoozeEntry } from '../../../../rules_client/common/per_alert_snooze_utils';
import type { RulesClientContext } from '../../../../rules_client/types';
import { unsnoozeAlertParamsSchema } from './schemas';
import type { UnsnoozeAlertParams } from './types';
import { isDetectionEngineAADRuleType } from '../../../../saved_objects/migrations/utils';

export async function unsnoozeAlertInstance(
  context: RulesClientContext,
  params: UnsnoozeAlertParams
): Promise<void> {
  const ruleId = params.alertId;
  try {
    unsnoozeAlertParamsSchema.validate(params);
  } catch (error) {
    throw Boom.badRequest(`Failed to validate params: ${error.message}`);
  }

  return await retryIfConflicts(
    context.logger,
    `rulesClient.unsnoozeAlertInstance('${ruleId}')`,
    async () => await unsnoozeInstanceWithOCC(context, params)
  );
}

async function unsnoozeInstanceWithOCC(
  context: RulesClientContext,
  { alertId: ruleId, alertInstanceId }: UnsnoozeAlertParams
) {
  const ruleSavedObject = await context.unsecuredSavedObjectsClient.get<RawRule>(
    RULE_SAVED_OBJECT_TYPE,
    ruleId
  );
  const { attributes, version } = ruleSavedObject;

  try {
    await context.authorization.ensureAuthorized({
      ruleTypeId: attributes.alertTypeId,
      consumer: attributes.consumer,
      operation: WriteOperations.unsnoozeAlert,
      entity: AlertingAuthorizationEntity.Rule,
    });
  } catch (error) {
    context.auditLogger?.log(
      alertAuditEvent({
        action: AlertAuditAction.UNSNOOZE,
        id: alertInstanceId,
        ruleSavedObject: { type: RULE_SAVED_OBJECT_TYPE, id: ruleId, name: attributes.name },
        error,
      })
    );
    throw error;
  }

  context.ruleTypeRegistry.ensureRuleTypeEnabled(attributes.alertTypeId);

  if (
    isDetectionEngineAADRuleType(ruleSavedObject) ||
    attributes.consumer === AlertConsumers.SIEM
  ) {
    throw Boom.badRequest(
      `Per-alert unsnooze is not supported for rule type "${attributes.alertTypeId}"`
    );
  }

  // Audit the successful unsnooze only once all validation and guards have passed.
  context.auditLogger?.log(
    alertAuditEvent({
      action: AlertAuditAction.UNSNOOZE,
      outcome: 'unknown',
      id: alertInstanceId,
      ruleSavedObject: { type: RULE_SAVED_OBJECT_TYPE, id: ruleId, name: attributes.name },
    })
  );

  const snoozedInstances = removePerAlertSnoozeEntry({
    snoozedInstances: attributes.snoozedInstances,
    alertInstanceId,
  });

  if (snoozedInstances.length === (attributes.snoozedInstances ?? []).length) {
    return;
  }

  // Only the rule saved object is updated here. The `kibana.alert.snoozed` field
  // in alert-as-data documents is eventually consistent and will reflect the
  // unsnooze only after the next rule execution.
  await updateRuleSo({
    savedObjectsClient: context.unsecuredSavedObjectsClient,
    savedObjectsUpdateOptions: { version },
    id: ruleId,
    updateRuleAttributes: updateMeta(context, {
      snoozedInstances,
      updatedBy: await context.getUserName(),
      updatedAt: new Date().toISOString(),
    }),
  });
}
