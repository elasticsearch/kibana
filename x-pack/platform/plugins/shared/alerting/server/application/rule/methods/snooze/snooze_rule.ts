/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import { withSpan } from '@kbn/apm-utils';
import { RuleChangeTrackingAction } from '@kbn/alerting-types';
import { ruleSnoozeScheduleSchema } from '../../../../../common/routes/rule/request';
import { RULE_SAVED_OBJECT_TYPE } from '../../../../saved_objects';
import { getRuleSavedObject } from '../../../../rules_client/lib';
import { ruleAuditEvent, RuleAuditAction } from '../../../../rules_client/common/audit_events';
import { WriteOperations, AlertingAuthorizationEntity } from '../../../../authorization';
import { retryIfConflicts } from '../../../../lib/retry_if_conflicts';
import { validateSnoozeStartDate } from '../../../../lib/validate_snooze_date';
import { RuleMutedError } from '../../../../lib/errors/rule_muted';
import type { RulesClientContext } from '../../../../rules_client/types';
import type { RawRule, SanitizedRule } from '../../../../types';
import {
  getSnoozeAttributes,
  verifySnoozeAttributeScheduleLimit,
} from '../../../../rules_client/common';
import { updateRuleSo, getDecryptedRuleSo } from '../../../../data/rule';
import { updateMetaAttributes } from '../../../../rules_client/lib/update_meta_attributes';
import type { RuleParams } from '../../types';
import { transformRuleDomainToRule, transformRuleAttributesToRuleDomain } from '../../transforms';
import { logRuleChanges } from '../common_utils/log_rule_changes';
import { snoozeRuleParamsSchema } from './schemas';
import type { SnoozeRuleOptions } from './types';

export async function snoozeRule<Params extends RuleParams = never>(
  context: RulesClientContext,
  { id, snoozeSchedule }: SnoozeRuleOptions
): Promise<SanitizedRule<Params>> {
  try {
    snoozeRuleParamsSchema.validate({ id });
    ruleSnoozeScheduleSchema.validate({ ...snoozeSchedule });
  } catch (error) {
    throw Boom.badRequest(`Error validating snooze - ${error.message}`);
  }
  const snoozeDateValidationMsg = validateSnoozeStartDate(snoozeSchedule.rRule.dtstart);
  if (snoozeDateValidationMsg) {
    throw new RuleMutedError(snoozeDateValidationMsg);
  }

  return await retryIfConflicts(
    context.logger,
    `rulesClient.snooze('${id}', ${JSON.stringify(snoozeSchedule, null, 4)})`,
    async () => await snoozeWithOCC(context, { id, snoozeSchedule })
  );
}

async function snoozeWithOCC<Params extends RuleParams = never>(
  context: RulesClientContext,
  { id, snoozeSchedule }: SnoozeRuleOptions
) {
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
      operation: WriteOperations.Snooze,
      entity: AlertingAuthorizationEntity.Rule,
    });
  } catch (error) {
    context.auditLogger?.log(
      ruleAuditEvent({
        action: RuleAuditAction.SNOOZE,
        savedObject: { type: RULE_SAVED_OBJECT_TYPE, id, name: attributes.name },
        error,
      })
    );
    throw error;
  }

  context.auditLogger?.log(
    ruleAuditEvent({
      action: RuleAuditAction.SNOOZE,
      outcome: 'unknown',
      savedObject: { type: RULE_SAVED_OBJECT_TYPE, id, name: attributes.name },
    })
  );

  context.ruleTypeRegistry.ensureRuleTypeEnabled(attributes.alertTypeId);

  const newAttrs = getSnoozeAttributes(attributes, snoozeSchedule);

  try {
    verifySnoozeAttributeScheduleLimit(newAttrs);
  } catch (error) {
    throw Boom.badRequest(error.message);
  }

  const username = await context.getUserName();
  const ruleType = context.ruleTypeRegistry.get(attributes.alertTypeId!);

  const snoozeRuleTimestamp = Date.now();
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
      `snoozeRule(): could not load decrypted API key for rule "${id}": ${e.message}`
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
      action: RuleChangeTrackingAction.ruleSnooze,
      timestamp: snoozeRuleTimestamp,
    },
  });

  const ruleDomain = transformRuleAttributesToRuleDomain<Params>(
    updatedRuleRaw.attributes as RawRule,
    {
      id: updatedRuleRaw.id,
      logger: context.logger,
      ruleType,
      references: updatedRuleRaw.references,
    },
    context.isSystemAction
  );

  const rule = transformRuleDomainToRule<Params>(ruleDomain);

  return rule as SanitizedRule<Params>;
}
