/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import { withSpan } from '@kbn/apm-utils';
import { RuleChangeTrackingAction } from '@kbn/alerting-types';
import { RULE_SAVED_OBJECT_TYPE } from '../../../../saved_objects';
import { ruleAuditEvent, RuleAuditAction } from '../../../../rules_client/common/audit_events';
import { getRuleSavedObject } from '../../../../rules_client/lib';
import { WriteOperations, AlertingAuthorizationEntity } from '../../../../authorization';
import { retryIfConflicts } from '../../../../lib/retry_if_conflicts';
import type { RulesClientContext } from '../../../../rules_client/types';
import { getUnsnoozeAttributes } from '../../../../rules_client/common';
import { updateRuleSo, getDecryptedRuleSo } from '../../../../data/rule';
import { updateMetaAttributes } from '../../../../rules_client/lib/update_meta_attributes';
import { logRuleChanges } from '../common_utils/log_rule_changes';
import { unsnoozeRuleParamsSchema } from './schemas';

export interface UnsnoozeParams {
  id: string;
  scheduleIds?: string[];
}

export async function unsnoozeRule(
  context: RulesClientContext,
  { id, scheduleIds }: UnsnoozeParams
): Promise<void> {
  return await retryIfConflicts(
    context.logger,
    `rulesClient.unsnooze('${id}')`,
    async () => await unsnoozeWithOCC(context, { id, scheduleIds })
  );
}

async function unsnoozeWithOCC(context: RulesClientContext, { id, scheduleIds }: UnsnoozeParams) {
  try {
    unsnoozeRuleParamsSchema.validate({ id, scheduleIds });
  } catch (error) {
    throw Boom.badRequest(`Error validating unsnooze params - ${error.message}`);
  }
  const { attributes, version } = await withSpan(
    { name: 'getRuleSavedObject', type: 'rules' },
    () =>
      getRuleSavedObject(context, {
        ruleId: id,
      })
  );

  try {
    await context.authorization.ensureAuthorized({
      ruleTypeId: attributes.alertTypeId,
      consumer: attributes.consumer,
      operation: WriteOperations.Unsnooze,
      entity: AlertingAuthorizationEntity.Rule,
    });
  } catch (error) {
    context.auditLogger?.log(
      ruleAuditEvent({
        action: RuleAuditAction.UNSNOOZE,
        savedObject: { type: RULE_SAVED_OBJECT_TYPE, id, name: attributes.name },
        error,
      })
    );
    throw error;
  }

  context.auditLogger?.log(
    ruleAuditEvent({
      action: RuleAuditAction.UNSNOOZE,
      outcome: 'unknown',
      savedObject: { type: RULE_SAVED_OBJECT_TYPE, id, name: attributes.name },
    })
  );

  context.ruleTypeRegistry.ensureRuleTypeEnabled(attributes.alertTypeId);
  const newAttrs = getUnsnoozeAttributes(attributes, scheduleIds);
  const username = await context.getUserName();

  const unsnoozeRuleTimestamp = Date.now();
  const updatedRuleRaw = await updateRuleSo({
    savedObjectsClient: context.unsecuredSavedObjectsClient,
    savedObjectsUpdateOptions: { version },
    id,
    updateRuleAttributes: updateMetaAttributes(context, {
      ...newAttrs,
      updatedBy: username,
      updatedAt: new Date().toISOString(),
    }),
  });

  let decryptedApiKey: string | null | undefined;
  let decryptedUiamApiKey: string | null | undefined;
  try {
    const decryptedRule = await getDecryptedRuleSo({
      encryptedSavedObjectsClient: context.encryptedSavedObjectsClient,
      id,
      savedObjectsGetOptions: { namespace: context.namespace },
    });
    decryptedApiKey = decryptedRule.attributes.apiKey;
    decryptedUiamApiKey = decryptedRule.attributes.uiamApiKey ?? null;
  } catch (e) {
    context.logger.debug(
      `unsnoozeRule(): could not load decrypted API key for rule "${id}": ${e.message}`
    );
  }

  await logRuleChanges({
    ruleSOs: [
      {
        ...updatedRuleRaw,
        attributes: { ...attributes, ...updatedRuleRaw.attributes },
        references: updatedRuleRaw.references ?? [],
      },
    ],
    encryptedFieldsMap:
      decryptedApiKey !== undefined
        ? new Map([[id, { apiKey: decryptedApiKey, uiamApiKey: decryptedUiamApiKey ?? null }]])
        : undefined,
    rulesClientContext: context,
    changesContext: {
      action: RuleChangeTrackingAction.ruleUnsnooze,
      timestamp: unsnoozeRuleTimestamp,
    },
  });
}
