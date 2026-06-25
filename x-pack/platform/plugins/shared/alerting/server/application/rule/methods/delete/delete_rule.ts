/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import type { SavedObject } from '@kbn/core/server';
import { AlertConsumers } from '@kbn/rule-data-utils';
import { RuleChangeTrackingAction } from '@kbn/alerting-types';
import type { RawRule } from '../../../../types';
import { WriteOperations, AlertingAuthorizationEntity } from '../../../../authorization';
import { retryIfConflicts } from '../../../../lib/retry_if_conflicts';
import { bulkMarkApiKeysForInvalidation } from '../../../../invalidate_pending_api_keys/bulk_mark_api_keys_for_invalidation';
import { ruleAuditEvent, RuleAuditAction } from '../../../../rules_client/common/audit_events';
import type { RulesClientContext } from '../../../../rules_client/types';
import { untrackRuleAlerts, bulkMigrateLegacyActions } from '../../../../rules_client/lib';
import { RULE_SAVED_OBJECT_TYPE } from '../../../../saved_objects';
import type { DeleteRuleParams } from './types';
import { deleteRuleParamsSchema } from './schemas';
import { deleteRuleSo, getDecryptedRuleSo, getRuleSo } from '../../../../data/rule';
import { softDeleteGaps } from '../../../../lib/rule_gaps/soft_delete/soft_delete_gaps';
import { logRuleChanges } from '../common_utils/log_rule_changes';

export async function deleteRule(context: RulesClientContext, params: DeleteRuleParams) {
  try {
    deleteRuleParamsSchema.validate(params);
  } catch (error) {
    throw Boom.badRequest(`Error validating delete params - ${error.message}`);
  }

  const { id, invalidateApiKeyNow } = params;

  return await retryIfConflicts(
    context.logger,
    `rulesClient.delete('${id}')`,
    async () => await deleteRuleWithOCC(context, { id, invalidateApiKeyNow })
  );
}

async function deleteRuleWithOCC(
  context: RulesClientContext,
  { id, invalidateApiKeyNow }: { id: string; invalidateApiKeyNow?: boolean }
) {
  let taskIdToRemove: string | undefined | null;
  let apiKeyToInvalidate: string | null = null;
  let uiamApiKeyToInvalidate: string | null = null;
  let apiKeyCreatedByUser: boolean | undefined | null = false;
  let attributes: RawRule;
  let rule: SavedObject<RawRule>;

  try {
    const decryptedRule = await getDecryptedRuleSo({
      encryptedSavedObjectsClient: context.encryptedSavedObjectsClient,
      id,
      savedObjectsGetOptions: {
        namespace: context.namespace,
      },
    });

    const { uiamApiKey, apiKey } = decryptedRule.attributes;

    apiKeyToInvalidate = apiKey;
    if (uiamApiKey) {
      uiamApiKeyToInvalidate = uiamApiKey;
    }
    apiKeyCreatedByUser = decryptedRule.attributes.apiKeyCreatedByUser;
    taskIdToRemove = decryptedRule.attributes.scheduledTaskId;
    attributes = decryptedRule.attributes;
    rule = decryptedRule;
  } catch (e) {
    // We'll skip invalidating the API key since we failed to load the decrypted saved object
    context.logger.error(
      `delete(): Failed to load API key to invalidate on alert ${id}: ${e.message}`
    );

    // Still attempt to load the scheduledTaskId using SOC
    rule = await getRuleSo({
      savedObjectsClient: context.unsecuredSavedObjectsClient,
      id,
    });
    taskIdToRemove = rule.attributes.scheduledTaskId;
    attributes = rule.attributes;
  }

  try {
    await context.authorization.ensureAuthorized({
      ruleTypeId: attributes.alertTypeId,
      consumer: attributes.consumer,
      operation: WriteOperations.Delete,
      entity: AlertingAuthorizationEntity.Rule,
    });
  } catch (error) {
    context.auditLogger?.log(
      ruleAuditEvent({
        action: RuleAuditAction.DELETE,
        savedObject: { type: RULE_SAVED_OBJECT_TYPE, id, name: attributes.name },
        error,
      })
    );
    throw error;
  }

  await untrackRuleAlerts(context, id, attributes);

  // migrate legacy actions only for SIEM rules
  // TODO (http-versioning): Remove this cast, this enables us to move forward
  // without fixing all of other solution types
  if (attributes.consumer === AlertConsumers.SIEM) {
    await bulkMigrateLegacyActions({ context, rules: [rule], skipActionsValidation: true });
  }

  context.auditLogger?.log(
    ruleAuditEvent({
      action: RuleAuditAction.DELETE,
      outcome: 'unknown',
      savedObject: { type: RULE_SAVED_OBJECT_TYPE, id, name: attributes.name },
    })
  );

  try {
    const eventLogClient = await context.getEventLogClient();

    await softDeleteGaps({
      ruleIds: [id],
      logger: context.logger,
      eventLogClient,
      eventLogger: context.eventLogger,
    });
  } catch (error) {
    // Failing to soft delete gaps should not block the rule deletion
    context.logger.error(`delete(): Failed to soft delete gaps for rule ${id}: ${error.message}`);
  }

  const deleteTime = Date.now();
  const removeResult = await deleteRuleSo({
    savedObjectsClient: context.unsecuredSavedObjectsClient,
    id,
  });

  await logRuleChanges({
    ruleSOs: [rule],
    encryptedFieldsMap: new Map([
      [id, { apiKey: apiKeyToInvalidate, uiamApiKey: uiamApiKeyToInvalidate }],
    ]),
    rulesClientContext: context,
    changesContext: {
      action: RuleChangeTrackingAction.ruleDelete,
      timestamp: deleteTime,
    },
  });

  await Promise.all([
    taskIdToRemove ? context.taskManager.removeIfExists(taskIdToRemove) : null,
    context.backfillClient.deleteBackfillForRules({
      ruleIds: [id],
      namespace: context.namespace,
      unsecuredSavedObjectsClient: context.unsecuredSavedObjectsClient,
    }),
    invalidateRuleApiKeys({
      context,
      ruleId: id,
      ruleName: attributes.name,
      apiKey: apiKeyToInvalidate,
      uiamApiKey: uiamApiKeyToInvalidate,
      apiKeyCreatedByUser,
      invalidateNow: invalidateApiKeyNow,
    }),
  ]);

  return removeResult;
}

/**
 * Routes a rule's API keys to either synchronous or queued invalidation.
 *
 * - Returns `null` (no-op) if the rule has no keys to invalidate or the user owns the key.
 * - Calls {@link RulesClientContext.invalidateApiKeyNow} when the caller requested it
 *   *and* the context supports it.
 * - Otherwise queues the keys via {@link bulkMarkApiKeysForInvalidation}; if sync was
 *   requested but the context did not wire it (test contexts), logs a warning so we
 *   never silently skip invalidation.
 */
function invalidateRuleApiKeys({
  context,
  ruleId,
  ruleName,
  apiKey,
  uiamApiKey,
  apiKeyCreatedByUser,
  invalidateNow,
}: {
  context: RulesClientContext;
  ruleId: string;
  ruleName: string;
  apiKey: string | null;
  uiamApiKey: string | null;
  apiKeyCreatedByUser?: boolean | null;
  invalidateNow?: boolean;
}): Promise<unknown> | null {
  if (apiKeyCreatedByUser || (!apiKey && !uiamApiKey)) {
    return null;
  }

  if (invalidateNow && context.invalidateApiKeyNow) {
    return context.invalidateApiKeyNow({ ruleName, apiKey, uiamApiKey });
  }

  if (invalidateNow) {
    context.logger.warn(
      `delete(): invalidateApiKeyNow=true requested for rule ${ruleId} but the rules client context does not support synchronous invalidation; falling back to queued invalidation.`
    );
  }

  return bulkMarkApiKeysForInvalidation(
    {
      apiKeys: [...(apiKey ? [apiKey] : []), ...(uiamApiKey ? [uiamApiKey] : [])],
    },
    context.logger,
    context.unsecuredSavedObjectsClient
  );
}
