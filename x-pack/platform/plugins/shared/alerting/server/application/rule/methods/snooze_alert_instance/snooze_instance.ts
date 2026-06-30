/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import { AlertConsumers } from '@kbn/rule-data-utils';
import { MAX_SNOOZED_ALERT_INSTANCES } from '../../../../../common/max_alert_limit';
import { RULE_SAVED_OBJECT_TYPE } from '../../../../saved_objects';
import { updateRuleSo } from '../../../../data/rule/methods/update_rule_so';
import {
  snoozeAlertInstanceBodySchema,
  snoozeAlertInstanceQuerySchema,
  snoozeAlertInstanceParamsSchema,
} from './schemas';
import type {
  SnoozeAlertInstanceBody,
  SnoozeAlertInstanceQuery,
  SnoozeAlertInstanceParams,
} from './types';
import type { RawRule } from '../../../../saved_objects/schemas/raw_rule';
import { WriteOperations, AlertingAuthorizationEntity } from '../../../../authorization';
import { retryIfConflicts } from '../../../../lib/retry_if_conflicts';
import { AlertAuditAction, alertAuditEvent } from '../../../../lib/alert_audit_events';
import type { RulesClientContext } from '../../../../rules_client/types';
import { updateMeta } from '../../../../rules_client/lib';
import {
  buildPerAlertSnoozeEntry,
  getPerAlertSnoozeSnapshotFields,
  upsertPerAlertSnoozeEntry,
} from '../../../../rules_client/common/per_alert_snooze_utils';
import { isDetectionEngineAADRuleType } from '../../../../saved_objects/migrations/utils';

export async function snoozeAlertInstance(
  context: RulesClientContext,
  {
    params,
    query,
    body,
  }: {
    params: SnoozeAlertInstanceParams;
    query: SnoozeAlertInstanceQuery;
    body: SnoozeAlertInstanceBody;
  }
): Promise<void> {
  const ruleId = params.alertId;
  try {
    snoozeAlertInstanceParamsSchema.validate(params);
  } catch (error) {
    throw Boom.badRequest(`Failed to validate params: ${error.message}`);
  }

  try {
    snoozeAlertInstanceQuerySchema.validate(query);
  } catch (error) {
    throw Boom.badRequest(`Failed to validate query: ${error.message}`);
  }

  try {
    snoozeAlertInstanceBodySchema.validate(body);
  } catch (error) {
    throw Boom.badRequest(`Failed to validate body: ${error.message}`);
  }

  return await retryIfConflicts(
    context.logger,
    `rulesClient.snoozeAlertInstance('${ruleId}')`,
    async () => await snoozeAlertInstanceWithOCC(context, params, query, body)
  );
}

async function snoozeAlertInstanceWithOCC(
  context: RulesClientContext,
  { alertId: ruleId, alertInstanceId }: SnoozeAlertInstanceParams,
  { validateAlertsExistence }: SnoozeAlertInstanceQuery,
  body: SnoozeAlertInstanceBody
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
      operation: WriteOperations.snoozeAlert,
      entity: AlertingAuthorizationEntity.Rule,
    });
  } catch (error) {
    context.auditLogger?.log(
      alertAuditEvent({
        action: AlertAuditAction.SNOOZE,
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
      `Per-alert snooze is not supported for rule type "${attributes.alertTypeId}"`
    );
  }

  const indices = context.getAlertIndicesAlias([attributes.alertTypeId], context.spaceId);
  const updatedAt = new Date().toISOString();
  const updatedBy = await context.getUserName();

  const snapshotFields = getPerAlertSnoozeSnapshotFields(body);
  let snoozeSnapshot: Record<string, unknown> | undefined;

  if (indices.length > 0 && snapshotFields.length > 0) {
    if (!context.alertsService) {
      throw Boom.internal('Alerts service is unavailable');
    }

    snoozeSnapshot =
      (await context.alertsService.getAlertSnoozeSnapshot({
        indices,
        alertId: alertInstanceId,
        ruleId,
        fields: snapshotFields,
      })) ?? undefined;

    if (!snoozeSnapshot) {
      throw Boom.notFound(
        `Alert instance with id "${alertInstanceId}" does not exist for rule with id "${ruleId}"`
      );
    }
  } else if (indices.length > 0 && validateAlertsExistence) {
    if (!context.alertsService) {
      throw Boom.internal('Alerts service is unavailable');
    }

    const isExistingAlert = await context.alertsService.isExistingAlert({
      indices,
      alertId: alertInstanceId,
      ruleId,
    });

    if (!isExistingAlert) {
      throw Boom.notFound(
        `Alert instance with id "${alertInstanceId}" does not exist for rule with id "${ruleId}"`
      );
    }
  }

  const snoozedInstance = buildPerAlertSnoozeEntry({
    alertInstanceId,
    body,
    snoozedAt: updatedAt,
    snoozedBy: updatedBy,
    snoozeSnapshot,
  });

  const snoozedInstances = upsertPerAlertSnoozeEntry({
    snoozedInstances: attributes.snoozedInstances,
    snoozedInstance,
  });

  if (snoozedInstances.length > MAX_SNOOZED_ALERT_INSTANCES) {
    throw Boom.badRequest(
      `Cannot snooze more than ${MAX_SNOOZED_ALERT_INSTANCES} alert instances for rule with id "${ruleId}"`
    );
  }

  // Audit the successful snooze only once all validation and guards have passed.
  context.auditLogger?.log(
    alertAuditEvent({
      action: AlertAuditAction.SNOOZE,
      outcome: 'unknown',
      id: alertInstanceId,
      ruleSavedObject: { type: RULE_SAVED_OBJECT_TYPE, id: ruleId, name: attributes.name },
    })
  );

  // Only the rule saved object is updated here. The `kibana.alert.snoozed` field
  // in alert-as-data documents is eventually consistent: it is written by the task
  // runner on each execution using the rule SO as its source of truth, so it will
  // reflect the new snooze state only after the next rule run. Consumers querying
  // .alerts-* indexes directly may observe stale `kibana.alert.snoozed` values until
  // the next execution.
  await updateRuleSo({
    savedObjectsClient: context.unsecuredSavedObjectsClient,
    savedObjectsUpdateOptions: { version },
    id: ruleId,
    updateRuleAttributes: updateMeta(context, {
      snoozedInstances,
      updatedBy,
      updatedAt,
    }),
  });
}
