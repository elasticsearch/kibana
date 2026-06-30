/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import type { KueryNode } from '@kbn/es-query';
import { nodeBuilder } from '@kbn/es-query';
import type { SavedObject } from '@kbn/core/server';
import { withSpan } from '@kbn/apm-utils';
import type { RuleChangeTracking } from '@kbn/alerting-types';
import { RuleChangeTrackingAction } from '@kbn/alerting-types';
import {
  combineFiltersWithInternalRuleTypeFilter,
  constructIgnoreInternalRuleTypesFilter,
} from '../../../../rules_client/common/construct_ignore_internal_rule_type_filters';
import { RULE_SAVED_OBJECT_TYPE } from '../../../../saved_objects';
import { convertRuleIdsToKueryNode } from '../../../../lib';
import { bulkMarkApiKeysForInvalidation } from '../../../../invalidate_pending_api_keys/bulk_mark_api_keys_for_invalidation';
import { ruleAuditEvent, RuleAuditAction } from '../../../../rules_client/common/audit_events';
import { tryToRemoveTasks } from '../../../../rules_client/common';
import {
  getAuthorizationFilter,
  checkAuthorizationAndGetTotal,
  bulkMigrateLegacyActions,
} from '../../../../rules_client/lib';
import {
  retryIfBulkOperationConflicts,
  buildKueryNodeFilter,
} from '../../../../rules_client/common';
import type { RulesClientContext } from '../../../../rules_client/types';
import type { BulkOperationError, BulkDeleteRulesResult, BulkDeleteRulesParams } from './types';
import { validateBulkDeleteRulesBody } from './validation';
import { bulkDeleteRulesSo } from '../../../../data/rule';
import { transformRuleAttributesToRuleDomain, transformRuleDomainToRule } from '../../transforms';
import { ruleDomainSchema } from '../../schemas';
import type { RuleParams, RuleDomain } from '../../types';
import type { RawRule, SanitizedRule } from '../../../../types';
import { untrackRuleAlerts } from '../../../../rules_client/lib';
import { softDeleteGaps } from '../../../../lib/rule_gaps/soft_delete/soft_delete_gaps';
import { logRuleChanges } from '../common_utils/log_rule_changes';

export const bulkDeleteRules = async <Params extends RuleParams>(
  context: RulesClientContext,
  options: BulkDeleteRulesParams
): Promise<BulkDeleteRulesResult<Params>> => {
  try {
    validateBulkDeleteRulesBody(options);
  } catch (error) {
    throw Boom.badRequest(`Error validating bulk delete data - ${error.message}`);
  }

  const { ids, filter } = options;
  const actionsClient = await context.getActionsClient();
  const ignoreInternalRuleTypes = options.ignoreInternalRuleTypes ?? true;

  const kueryNodeFilter = ids ? convertRuleIdsToKueryNode(ids) : buildKueryNodeFilter(filter);
  const authorizationFilter = await getAuthorizationFilter(context, { action: 'DELETE' });
  const internalRuleTypeFilter = constructIgnoreInternalRuleTypesFilter({
    ruleTypes: context.ruleTypeRegistry.list(),
  });

  const kueryNodeFilterWithAuth =
    authorizationFilter && kueryNodeFilter
      ? nodeBuilder.and([kueryNodeFilter, authorizationFilter as KueryNode])
      : kueryNodeFilter;

  const finalFilter = ignoreInternalRuleTypes
    ? combineFiltersWithInternalRuleTypeFilter({
        filter: kueryNodeFilterWithAuth,
        internalRuleTypeFilter,
      })
    : kueryNodeFilterWithAuth;

  const { total } = await checkAuthorizationAndGetTotal(context, {
    filter: finalFilter,
    action: 'DELETE',
  });

  const { rules, errors, accListSpecificForBulkOperation } = await withSpan(
    { name: 'retryIfBulkOperationConflicts', type: 'rules' },
    () =>
      retryIfBulkOperationConflicts({
        action: 'DELETE',
        logger: context.logger,
        bulkOperation: (filterKueryNode: KueryNode | null) =>
          bulkDeleteWithOCC(context, {
            filter: filterKueryNode,
            changeTracking: {
              metadata: { bulkCount: total, ...options.changeTracking?.metadata },
            },
          }),
        filter: finalFilter,
      })
  );

  const [apiKeysToInvalidate, taskIdsToDelete] = accListSpecificForBulkOperation;

  const [result] = await Promise.allSettled([
    tryToRemoveTasks({
      taskIdsToDelete,
      logger: context.logger,
      taskManager: context.taskManager,
    }),
    context.backfillClient.deleteBackfillForRules({
      ruleIds: rules.map(({ id }) => id),
      namespace: context.namespace,
      unsecuredSavedObjectsClient: context.unsecuredSavedObjectsClient,
    }),
    bulkMarkApiKeysForInvalidation(
      {
        apiKeys: apiKeysToInvalidate,
      },
      context.logger,
      context.unsecuredSavedObjectsClient
    ),
  ]);

  const deletedRules = rules.map(({ id, attributes, references }) => {
    // TODO (http-versioning): alertTypeId should never be null, but we need to
    // fix the type cast from SavedObjectsBulkUpdateObject to SavedObjectsBulkUpdateObject
    // when we are doing the bulk delete and this should fix itself
    const ruleType = context.ruleTypeRegistry.get(attributes.alertTypeId!);
    const ruleDomain = transformRuleAttributesToRuleDomain<Params>(
      attributes as RawRule,
      {
        id,
        logger: context.logger,
        ruleType,
        references,
      },
      (connectorId: string) => actionsClient.isSystemAction(connectorId)
    );

    try {
      ruleDomainSchema.validate(ruleDomain);
    } catch (e) {
      context.logger.warn(`Error validating bulk deleted rule domain object for id: ${id}, ${e}`);
    }
    return ruleDomain;
  });

  // // TODO (http-versioning): This should be of type Rule, change this when all rule types are fixed
  const deletedPublicRules = deletedRules.map((rule: RuleDomain<Params>) => {
    return transformRuleDomainToRule<Params>(rule);
  }) as Array<SanitizedRule<Params>>;

  if (result.status === 'fulfilled') {
    return { errors, total, rules: deletedPublicRules, taskIdsFailedToBeDeleted: result.value };
  } else {
    return { errors, total, rules: deletedPublicRules, taskIdsFailedToBeDeleted: [] };
  }
};

const bulkDeleteWithOCC = async (
  context: RulesClientContext,
  {
    filter,
    changeTracking,
  }: { filter: KueryNode | null; changeTracking: RuleChangeTracking<never> }
) => {
  const rulesFinder = await withSpan(
    {
      name: 'encryptedSavedObjectsClient.createPointInTimeFinderDecryptedAsInternalUser',
      type: 'rules',
    },
    () =>
      context.encryptedSavedObjectsClient.createPointInTimeFinderDecryptedAsInternalUser<RawRule>({
        filter,
        type: RULE_SAVED_OBJECT_TYPE,
        perPage: 100,
        ...(context.namespace ? { namespaces: [context.namespace] } : undefined),
      })
  );

  const rulesToDelete: Array<SavedObject<RawRule>> = [];
  const apiKeyToRuleIdMapping: Record<string, string> = {};
  const uiamApiKeyToRuleIdMapping: Record<string, string> = {};
  const taskIdToRuleIdMapping: Record<string, string> = {};
  const ruleNameToRuleIdMapping: Record<string, string> = {};

  await withSpan(
    { name: 'Get rules, collect them and their attributes', type: 'rules' },
    async () => {
      for await (const response of rulesFinder.find()) {
        await bulkMigrateLegacyActions({
          context,
          rules: response.saved_objects,
          skipActionsValidation: true,
        });
        for (const rule of response.saved_objects) {
          const { apiKey, apiKeyCreatedByUser, uiamApiKey } = rule.attributes;

          if (apiKey && !apiKeyCreatedByUser) {
            apiKeyToRuleIdMapping[rule.id] = apiKey;
          }
          if (uiamApiKey && !apiKeyCreatedByUser) {
            uiamApiKeyToRuleIdMapping[rule.id] = uiamApiKey;
          }
          const ruleName = rule.attributes.name;
          if (ruleName) {
            ruleNameToRuleIdMapping[rule.id] = ruleName;
          }
          if (rule.attributes.scheduledTaskId) {
            taskIdToRuleIdMapping[rule.id] = rule.attributes.scheduledTaskId;
          }
          rulesToDelete.push(rule);

          context.auditLogger?.log(
            ruleAuditEvent({
              action: RuleAuditAction.DELETE,
              outcome: 'unknown',
              savedObject: {
                type: RULE_SAVED_OBJECT_TYPE,
                id: rule.id,
                name: ruleName,
              },
            })
          );
        }
      }
      await rulesFinder.close();
    }
  );

  for (const { id, attributes } of rulesToDelete) {
    await untrackRuleAlerts(context, id, attributes as RawRule);
  }

  const ruleIds = rulesToDelete.map((rule) => rule.id);
  try {
    const eventLogClient = await context.getEventLogClient();
    await softDeleteGaps({
      ruleIds,
      logger: context.logger,
      eventLogClient,
      eventLogger: context.eventLogger,
    });
  } catch (error) {
    // Failing to soft delete gaps should not block the rule deletion
    context.logger.error(
      `delete(): Failed to soft delete gaps for rules: ${ruleIds.join(',')}: ${error.message}`
    );
  }

  const result = await withSpan(
    { name: 'unsecuredSavedObjectsClient.bulkDelete', type: 'rules' },
    () =>
      bulkDeleteRulesSo({
        savedObjectsClient: context.unsecuredSavedObjectsClient,
        ids: rulesToDelete.map(({ id }) => id),
      })
  );
  const deletionTimestamp = Date.now();

  const deletedRuleIds: string[] = [];
  const apiKeysToInvalidate = new Set<string>();
  const taskIdsToDelete: string[] = [];
  const errors: BulkOperationError[] = [];

  result.statuses.forEach((status) => {
    if (status.error === undefined) {
      if (apiKeyToRuleIdMapping[status.id]) {
        apiKeysToInvalidate.add(apiKeyToRuleIdMapping[status.id]);
      }
      if (uiamApiKeyToRuleIdMapping[status.id]) {
        apiKeysToInvalidate.add(uiamApiKeyToRuleIdMapping[status.id]);
      }
      if (taskIdToRuleIdMapping[status.id]) {
        taskIdsToDelete.push(taskIdToRuleIdMapping[status.id]);
      }
      deletedRuleIds.push(status.id);
    } else {
      errors.push({
        message: status.error.message ?? 'n/a',
        status: status.error.statusCode,
        rule: {
          id: status.id,
          name: ruleNameToRuleIdMapping[status.id] ?? 'n/a',
        },
      });
    }
  });
  const rules = rulesToDelete.filter((rule) => deletedRuleIds.includes(rule.id));

  await logRuleChanges({
    ruleSOs: rules,
    rulesClientContext: context,
    changesContext: {
      action: RuleChangeTrackingAction.ruleDelete,
      timestamp: deletionTimestamp,
      metadata: changeTracking?.metadata,
    },
  });

  return {
    errors,
    rules,
    accListSpecificForBulkOperation: [Array.from(apiKeysToInvalidate), taskIdsToDelete],
  };
};
