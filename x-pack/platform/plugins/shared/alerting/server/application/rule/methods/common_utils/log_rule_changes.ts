/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { every, isUndefined } from 'lodash';
import type { LogChangeHistoryOptions } from '@kbn/change-history';
import type { RuleChangeTrackingMetadata } from '@kbn/alerting-types';
import type { Logger, SavedObject } from '@kbn/core/server';
import type {
  RuleChange,
  RuleChangeHistorySnapshot,
} from '../../../../rules_client/lib/change_tracking';
import type { RawRule, RuleTypeRegistry } from '../../../../types';
import type { RulesClientContext } from '../../../../rules_client/types';
import type { RuleDomain } from '../../types';
import { RULE_SAVED_OBJECT_TYPE } from '../../../../saved_objects';
import { transformRuleAttributesToRuleDomain } from '../../transforms';

interface EncryptedRuleFields {
  apiKey?: string | null;
  uiamApiKey?: string | null;
}

interface LogRuleChanges {
  /**
   * Rule saved objects after applying the changes
   */
  ruleSOs: Array<SavedObject<RawRule>>;
  /**
   * Plaintext encrypted field values keyed by rule id. When provided, the
   * corresponding SO attributes are overlaid before building the snapshot so
   * the real values are captured (the SO may contain ciphertext after a save
   * via unsecuredSavedObjectsClient).
   */
  encryptedFieldsMap?: Map<string, EncryptedRuleFields>;
  /**
   * Context information describing the changes
   */
  rulesClientContext: RulesClientContext;
  changesContext: {
    /**
     * Action performed on rule, e.g. rule_create or rule_update
     */
    action: string;
    /**
     * Original timestamp of the change
     */
    timestamp: string | number | Date;
    /**
     * Change metadata object to be written to the each change history item
     */
    metadata?: RuleChangeTrackingMetadata;
  };
}

export async function logRuleChanges({
  ruleSOs,
  encryptedFieldsMap,
  rulesClientContext: { changeTrackingService, ruleTypeRegistry, logger, spaceId, isSystemAction },
  changesContext: { action, timestamp, metadata },
}: LogRuleChanges): Promise<void> {
  if (!changeTrackingService) {
    return;
  }

  const effectiveRuleSOs = encryptedFieldsMap?.size
    ? overlayEncryptedFields(ruleSOs, encryptedFieldsMap)
    : ruleSOs;
  const changes: RuleChange[] = [];

  for (const ruleSO of effectiveRuleSOs) {
    if (ruleSO.error) {
      continue;
    }

    const ruleType = getRuleType(ruleTypeRegistry, ruleSO.attributes.alertTypeId, logger);

    // "ruleType.trackChanges" is activated at Alerting plugin's "plugin.ts".
    //
    // The activation is gated by the feature flag "xpack.alerting.ruleChangeTracking.enabled".
    // On top of that "xpack.alerting.ruleChangeTracking.scope" controls what solution rule
    // types will be activated, e.g. "security" or "observability".
    //
    if (!ruleType?.trackChanges) {
      continue;
    }

    try {
      // Store the snapshot as RuleDomain rather than raw SavedObject attributes.
      // RawRule is coupled to the SO schema version at write time — if the SO
      // schema evolves the stored document becomes unreadable without a migration.
      // RuleDomain is a stable application-layer type: references are baked in,
      // sensitive fields (apiKey, uiamApiKey) are retained for hashing but omitted
      // from the public Rule shape at read time, and hydration on the read path
      // reduces to date deserialisation + transformRuleDomainToRule.
      const ruleDomain = transformRuleAttributesToRuleDomain(
        ruleSO.attributes,
        {
          id: ruleSO.id,
          logger,
          ruleType,
          references: ruleSO.references ?? [],
        },
        isSystemAction
      );
      const ruleSnapshot = transformRuleDomainToRuleChangeHistorySnapshot(ruleDomain);

      changes.push({
        timestamp: new Date(timestamp).toISOString(),
        objectId: ruleSO.id,
        objectType: RULE_SAVED_OBJECT_TYPE,
        module: ruleType.solution,
        snapshot: ruleSnapshot,
        // Rule's revision is a monotonically increasing integer reflecting user edits.
        // Capture it in object.sequence to be used as a tiebreaker when sorting
        // rule changes history by @timestamp DESC, object.sequence DESC
        sequence: ruleSnapshot.revision,
      });
    } catch (e) {
      logger.debug(
        `Unable to transform rule saved object "${JSON.stringify(
          ruleSO.id
        )}" to serializable format: ${e}`
      );
    }
  }

  if (!changes.length) {
    return;
  }

  try {
    const data: LogChangeHistoryOptions['data'] = every(metadata, isUndefined)
      ? undefined
      : { metadata: metadata as Record<string, unknown> | undefined };

    await changeTrackingService.logBulk(changes, {
      action,
      spaceId,
      data,
    });
  } catch (e) {
    logger.warn(`Unable to log bulk rule changes for action "${action}": ${e}`);
  }
}

function getRuleType(
  ruleTypeRegistry: RuleTypeRegistry,
  alertTypeId: string,
  logger: Logger
): ReturnType<RuleTypeRegistry['get']> | undefined {
  if (!alertTypeId) {
    return;
  }

  try {
    return ruleTypeRegistry.get(alertTypeId);
  } catch (e) {
    logger.debug(`Unable to fetch "${alertTypeId}" rule type from RuleTypeRegistry: ${e}`);
  }
}

function transformRuleDomainToRuleChangeHistorySnapshot(
  ruleDomain: RuleDomain
): RuleChangeHistorySnapshot {
  return {
    id: ruleDomain.id,
    enabled: ruleDomain.enabled,
    name: ruleDomain.name,
    tags: ruleDomain.tags,
    alertTypeId: ruleDomain.alertTypeId,
    consumer: ruleDomain.consumer,
    schedule: ruleDomain.schedule,
    actions: ruleDomain.actions,
    systemActions: ruleDomain.systemActions,
    params: ruleDomain.params,
    mapped_params: ruleDomain.mapped_params,
    createdBy: ruleDomain.createdBy,
    updatedBy: ruleDomain.updatedBy,
    createdAt: normalizeDate(ruleDomain.createdAt, new Date()),
    updatedAt: normalizeDate(ruleDomain.updatedAt, new Date()),
    apiKey: ruleDomain.apiKey,
    apiKeyOwner: ruleDomain.apiKeyOwner,
    apiKeyCreatedByUser: ruleDomain.apiKeyCreatedByUser,
    uiamApiKey: ruleDomain.uiamApiKey,
    throttle: ruleDomain.throttle,
    muteAll: ruleDomain.muteAll,
    notifyWhen: ruleDomain.notifyWhen,
    snoozedInstances: ruleDomain.snoozedInstances,
    snoozeSchedule: ruleDomain.snoozeSchedule,
    revision: ruleDomain.revision,
    alertDelay: ruleDomain.alertDelay,
    legacyId: ruleDomain.legacyId,
    flapping: ruleDomain.flapping,
    artifacts: ruleDomain.artifacts,
  } satisfies { [K in keyof Required<RuleChangeHistorySnapshot>]: RuleChangeHistorySnapshot[K] };
}

function normalizeDate(value: string | number | Date, fallback: Date): string {
  const date = new Date(value);

  if (!isNaN(date.getTime())) {
    return date.toISOString();
  }

  return fallback.toISOString();
}

function overlayEncryptedFields(
  ruleSOs: Array<SavedObject<RawRule>>,
  encryptedFieldsMap: Map<string, EncryptedRuleFields>
): Array<SavedObject<RawRule>> {
  return ruleSOs.map((so) => {
    const fields = encryptedFieldsMap.get(so.id);

    if (!fields?.apiKey && !fields?.uiamApiKey) {
      return so;
    }

    return {
      ...so,
      attributes: {
        ...so.attributes,
        ...(fields.apiKey ? { apiKey: fields.apiKey } : {}),
        ...(fields.uiamApiKey ? { uiamApiKey: fields.uiamApiKey } : {}),
      },
    };
  });
}
