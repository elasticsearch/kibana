/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { KueryNode } from '@kbn/es-query';
import { nodeBuilder } from '@kbn/es-query';
import type { SavedObjectsBulkUpdateObject, SavedObjectsBulkCreateObject } from '@kbn/core/server';
import Boom from '@hapi/boom';
import { withSpan } from '@kbn/apm-utils';
import pMap from 'p-map';
import type { Logger } from '@kbn/core/server';
import type { TaskManagerStartContract } from '@kbn/task-manager-plugin/server';
import { RuleChangeTrackingAction } from '@kbn/alerting-types';
import { RULE_SAVED_OBJECT_TYPE } from '../../../../saved_objects';
import type { RawRule, SanitizedRule } from '../../../../types';
import { convertRuleIdsToKueryNode } from '../../../../lib';
import { ruleAuditEvent, RuleAuditAction } from '../../../../rules_client/common/audit_events';
import {
  retryIfBulkOperationConflicts,
  buildKueryNodeFilter,
  tryToRemoveTasks,
} from '../../../../rules_client/common';
import {
  getAuthorizationFilter,
  checkAuthorizationAndGetTotal,
  untrackRuleAlerts,
  updateMeta,
  bulkMigrateLegacyActions,
  migrateLegacyLastRunOutcomeMsg,
} from '../../../../rules_client/lib';
import { transformRuleAttributesToRuleDomain, transformRuleDomainToRule } from '../../transforms';
import type {
  BulkOperationError,
  BulkDisableRulesResult,
  BulkDisableRulesRequestBody,
} from './types';
import { validateBulkDisableRulesBody } from './validation';
import { ruleDomainSchema } from '../../schemas';
import type { RulesClientContext } from '../../../../rules_client/types';
import type { RuleParams, RuleDomain } from '../../types';
import { bulkDisableRulesSo } from '../../../../data/rule';
import { logRuleChanges } from '../common_utils/log_rule_changes';

export const bulkDisableRules = async <Params extends RuleParams>(
  context: RulesClientContext,
  options: BulkDisableRulesRequestBody
): Promise<BulkDisableRulesResult<Params>> => {
  try {
    validateBulkDisableRulesBody(options);
  } catch (error) {
    throw Boom.badRequest(`Error validating bulk disable data - ${error.message}`);
  }

  const { ids, filter, untrack = false } = options;
  const actionsClient = await context.getActionsClient();

  const kueryNodeFilter = ids ? convertRuleIdsToKueryNode(ids) : buildKueryNodeFilter(filter);
  const authorizationFilter = await getAuthorizationFilter(context, { action: 'DISABLE' });

  const kueryNodeFilterWithAuth =
    authorizationFilter && kueryNodeFilter
      ? nodeBuilder.and([kueryNodeFilter, authorizationFilter as KueryNode])
      : kueryNodeFilter;

  const { total } = await checkAuthorizationAndGetTotal(context, {
    filter: kueryNodeFilterWithAuth,
    action: 'DISABLE',
  });

  const { errors, rules, accListSpecificForBulkOperation } = await withSpan(
    { name: 'retryIfBulkOperationConflicts', type: 'rules' },
    () =>
      retryIfBulkOperationConflicts({
        action: 'DISABLE',
        logger: context.logger,
        bulkOperation: (filterKueryNode: KueryNode | null) =>
          bulkDisableRulesWithOCC(context, {
            filter: filterKueryNode,
            untrack,
            totalNumOfRules: total,
          }),
        filter: kueryNodeFilterWithAuth,
      })
  );

  const [taskIdsToDisable, taskIdsToDelete, taskIdsToClearState] = accListSpecificForBulkOperation;

  await Promise.allSettled([
    tryToDisableTasks({
      taskIdsToDisable,
      taskIdsToClearState,
      logger: context.logger,
      taskManager: context.taskManager,
    }),
    tryToRemoveTasks({ taskIdsToDelete, logger: context.logger, taskManager: context.taskManager }),
  ]);

  const disabledRules = rules.map(({ id, attributes, references }) => {
    // TODO (http-versioning): alertTypeId should never be null, but we need to
    // fix the type cast from SavedObjectsBulkUpdateObject to SavedObjectsBulkUpdateObject
    // when we are doing the bulk disable and this should fix itself
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
      context.logger.warn(`Error validating bulk disabled rule domain object for id: ${id}, ${e}`);
    }
    return ruleDomain;
  });

  // TODO (http-versioning): This should be of type Rule, change this when all rule types are fixed
  const disabledPublicRules = disabledRules.map((rule: RuleDomain<Params>) => {
    return transformRuleDomainToRule<Params>(rule);
  }) as Array<SanitizedRule<Params>>;

  return { errors, rules: disabledPublicRules, total };
};

const bulkDisableRulesWithOCC = async (
  context: RulesClientContext,
  {
    filter,
    untrack,
    totalNumOfRules,
  }: {
    filter: KueryNode | null;
    untrack: boolean;
    totalNumOfRules: number;
  }
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

  const rulesToDisable: Array<SavedObjectsBulkUpdateObject<RawRule>> = [];
  const errors: BulkOperationError[] = [];
  const ruleNameToRuleIdMapping: Record<string, string> = {};
  const username = await context.getUserName();

  await withSpan(
    { name: 'Get rules, collect them and their attributes', type: 'rules' },
    async () => {
      for await (const response of rulesFinder.find()) {
        await bulkMigrateLegacyActions({ context, rules: response.saved_objects });
        await pMap(response.saved_objects, async (rule) => {
          const ruleName = rule.attributes.name;

          try {
            if (untrack) {
              await untrackRuleAlerts(context, rule.id, rule.attributes);
            }

            if (ruleName) {
              ruleNameToRuleIdMapping[rule.id] = ruleName;
            }

            // TODO (http-versioning) Remove casts when updateMeta has been converted
            const castedAttributes = rule.attributes as RawRule;
            const updatedAttributes = updateMeta(context, {
              ...castedAttributes,
              enabled: false,
              scheduledTaskId:
                rule.attributes.scheduledTaskId === rule.id
                  ? rule.attributes.scheduledTaskId
                  : null,
              updatedBy: username,
              updatedAt: new Date().toISOString(),
              ...(castedAttributes.lastRun
                ? { lastRun: migrateLegacyLastRunOutcomeMsg(castedAttributes.lastRun) }
                : {}),
            });

            rulesToDisable.push({
              ...rule,
              // TODO (http-versioning) Remove casts when updateMeta has been converted
              attributes: {
                ...updatedAttributes,
              } as RawRule,
            });

            context.auditLogger?.log(
              ruleAuditEvent({
                action: RuleAuditAction.DISABLE,
                outcome: 'unknown',
                savedObject: { type: RULE_SAVED_OBJECT_TYPE, id: rule.id, name: ruleName },
              })
            );
          } catch (error) {
            errors.push({
              message: error.message,
              rule: {
                id: rule.id,
                name: ruleName,
              },
            });
            context.auditLogger?.log(
              ruleAuditEvent({
                action: RuleAuditAction.DISABLE,
                savedObject: {
                  type: RULE_SAVED_OBJECT_TYPE,
                  id: rule.id,
                  name: ruleName,
                },
                error,
              })
            );
          }
        });
      }
      await rulesFinder.close();
    }
  );

  // TODO (http-versioning): for whatever reasoning we are using SavedObjectsBulkUpdateObject
  // everywhere when it should be SavedObjectsBulkCreateObject. We need to fix it in
  // bulk_disable, bulk_enable, etc. to fix this cast
  const bulkDisableTimestamp = Date.now();
  const result = await withSpan(
    { name: 'unsecuredSavedObjectsClient.bulkCreate', type: 'rules' },
    () =>
      bulkDisableRulesSo({
        savedObjectsClient: context.unsecuredSavedObjectsClient,
        bulkDisableRuleAttributes: rulesToDisable as Array<SavedObjectsBulkCreateObject<RawRule>>,
        savedObjectsBulkCreateOptions: { overwrite: true },
      })
  );

  await logRuleChanges({
    ruleSOs: result.saved_objects,
    encryptedFieldsMap: new Map(
      rulesToDisable.map(({ id, attributes }) => [
        id,
        { apiKey: attributes.apiKey ?? null, uiamApiKey: attributes.uiamApiKey ?? null },
      ])
    ),
    rulesClientContext: context,
    changesContext: {
      action: RuleChangeTrackingAction.ruleDisable,
      timestamp: bulkDisableTimestamp,
      metadata: { bulkCount: totalNumOfRules },
    },
  });

  const taskIdsToDisable: string[] = [];
  const taskIdsToDelete: string[] = [];
  const taskIdsToClearState: string[] = [];
  const disabledRules: Array<SavedObjectsBulkUpdateObject<RawRule>> = [];

  result.saved_objects.forEach((rule) => {
    if (rule.error === undefined) {
      if (rule.attributes.scheduledTaskId) {
        if (rule.attributes.scheduledTaskId !== rule.id) {
          taskIdsToDelete.push(rule.attributes.scheduledTaskId);
        } else {
          taskIdsToDisable.push(rule.attributes.scheduledTaskId);
          if (rule.attributes.alertTypeId) {
            const { autoRecoverAlerts: isLifecycleAlert } = context.ruleTypeRegistry.get(
              rule.attributes.alertTypeId
            );
            if (isLifecycleAlert) taskIdsToClearState.push(rule.attributes.scheduledTaskId);
          }
        }
      }
      disabledRules.push(rule);
    } else {
      errors.push({
        message: rule.error.message ?? 'n/a',
        status: rule.error.statusCode,
        rule: {
          id: rule.id,
          name: ruleNameToRuleIdMapping[rule.id] ?? 'n/a',
        },
      });
    }
  });

  return {
    errors,
    rules: disabledRules,
    accListSpecificForBulkOperation: [taskIdsToDisable, taskIdsToDelete, taskIdsToClearState],
  };
};

const tryToDisableTasks = async ({
  taskIdsToDisable,
  taskIdsToClearState,
  logger,
  taskManager,
}: {
  taskIdsToDisable: string[];
  taskIdsToClearState: string[];
  logger: Logger;
  taskManager: TaskManagerStartContract;
}) => {
  return await withSpan({ name: 'taskManager.bulkDisable', type: 'rules' }, async () => {
    if (taskIdsToDisable.length > 0) {
      try {
        const resultFromDisablingTasks = await taskManager.bulkDisable(
          taskIdsToDisable,
          taskIdsToClearState
        );
        if (resultFromDisablingTasks.tasks.length) {
          logger.debug(
            `Successfully disabled schedules for underlying tasks: ${resultFromDisablingTasks.tasks
              .map((task) => task.id)
              .join(', ')}`
          );
        }
        if (resultFromDisablingTasks.errors.length) {
          logger.error(
            `Failure to disable schedules for underlying tasks: ${resultFromDisablingTasks.errors
              .map((error) => error.id)
              .join(', ')}`
          );
        }
      } catch (error) {
        logger.error(
          `Failure to disable schedules for underlying tasks: ${taskIdsToDisable.join(
            ', '
          )}. TaskManager bulkDisable failed with Error: ${error.message}`
        );
      }
    }
  });
};
