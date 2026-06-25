/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import pMap from 'p-map';
import Boom from '@hapi/boom';
import { omit } from 'lodash';
import type { KueryNode } from '@kbn/es-query';
import { nodeBuilder } from '@kbn/es-query';
import type {
  SavedObjectsBulkCreateObject,
  SavedObjectsBulkUpdateObject,
  SavedObjectsFindResult,
} from '@kbn/core/server';
import { withSpan } from '@kbn/apm-utils';
import type { Logger } from '@kbn/core/server';
import type { TaskManagerStartContract } from '@kbn/task-manager-plugin/server';
import { TaskStatus } from '@kbn/task-manager-plugin/server';
import type { TaskInstanceWithDeprecatedFields } from '@kbn/task-manager-plugin/server/task';
import { RuleChangeTrackingAction } from '@kbn/alerting-types';
import { bulkCreateRulesSo } from '../../../../data/rule';
import type { RawRule } from '../../../../types';
import type { RuleDomain, RuleParams } from '../../types';
import { convertRuleIdsToKueryNode } from '../../../../lib';
import { ruleAuditEvent, RuleAuditAction } from '../../../../rules_client/common/audit_events';
import {
  retryIfBulkOperationConflicts,
  buildKueryNodeFilter,
  getAndValidateCommonBulkOptions,
  API_KEY_ATTRIBUTES_TO_STRIP,
} from '../../../../rules_client/common';
import type { SanitizedRule } from '../../../../../common';
import { getRuleCircuitBreakerErrorMessage } from '../../../../../common';
import {
  getAuthorizationFilter,
  checkAuthorizationAndGetTotal,
  createNewAPIKeySet,
  updateMetaAttributes,
  bulkMigrateLegacyActions,
  migrateLegacyLastRunOutcomeMsg,
} from '../../../../rules_client/lib';
import type { RulesClientContext, BulkOperationError } from '../../../../rules_client/types';
import { validateScheduleLimit } from '../get_schedule_frequency';
import { RULE_SAVED_OBJECT_TYPE } from '../../../../saved_objects';
import type { BulkEnableRulesParams, BulkEnableRulesResult } from './types';
import { bulkEnableRulesParamsSchema } from './schemas';
import { transformRuleAttributesToRuleDomain, transformRuleDomainToRule } from '../../transforms';
import { ruleDomainSchema } from '../../schemas';
import { logRuleChanges } from '../common_utils/log_rule_changes';

/**
 * Updating too many rules in parallel can cause the denial of service of the
 * Elasticsearch cluster.
 */
const MAX_RULES_TO_UPDATE_IN_PARALLEL = 50;

const getShouldScheduleTask = async (
  context: RulesClientContext,
  scheduledTaskId: string | null | undefined
) => {
  if (!scheduledTaskId) return true;
  try {
    // make sure scheduledTaskId exist
    return await withSpan({ name: 'getShouldScheduleTask', type: 'rules' }, async () => {
      const task = await context.taskManager.get(scheduledTaskId);

      // Check whether task status is unrecognized. If so, we want to delete
      // this task and create a fresh one
      if (task.status === TaskStatus.Unrecognized) {
        await context.taskManager.removeIfExists(scheduledTaskId);
        return true;
      }

      return false;
    });
  } catch (err) {
    return true;
  }
};

export const bulkEnableRules = async <Params extends RuleParams>(
  context: RulesClientContext,
  params: BulkEnableRulesParams
): Promise<BulkEnableRulesResult<Params>> => {
  const { ids, filter } = getAndValidateCommonBulkOptions(params);
  const actionsClient = await context.getActionsClient();

  try {
    bulkEnableRulesParamsSchema.validate(params);
  } catch (error) {
    throw Boom.badRequest(`Error validating bulk enable rules data - ${error.message}`);
  }

  const kueryNodeFilter = ids ? convertRuleIdsToKueryNode(ids) : buildKueryNodeFilter(filter);
  const authorizationFilter = await getAuthorizationFilter(context, { action: 'ENABLE' });

  const kueryNodeFilterWithAuth =
    authorizationFilter && kueryNodeFilter
      ? nodeBuilder.and([kueryNodeFilter, authorizationFilter as KueryNode])
      : kueryNodeFilter;

  const { total } = await checkAuthorizationAndGetTotal(context, {
    filter: kueryNodeFilterWithAuth,
    action: 'ENABLE',
  });

  const { errors, rules, accListSpecificForBulkOperation } = await retryIfBulkOperationConflicts({
    action: 'ENABLE',
    logger: context.logger,
    bulkOperation: (filterKueryNode: KueryNode | null) =>
      bulkEnableRulesWithOCC(context, { filter: filterKueryNode, totalNumOfRules: total }),
    filter: kueryNodeFilterWithAuth,
  });

  const [taskIdsToEnable] = accListSpecificForBulkOperation;

  const taskIdsFailedToBeEnabled = await tryToEnableTasks({
    taskIdsToEnable,
    logger: context.logger,
    taskManager: context.taskManager,
  });

  const updatedRules = rules.map(({ id, attributes, references }) => {
    // TODO (http-versioning): alertTypeId should never be null, but we need to
    // fix the type cast from SavedObjectsBulkUpdateObject to SavedObjectsBulkUpdateObject
    // when we are doing the bulk delete and this should fix itself
    const ruleType = context.ruleTypeRegistry.get(attributes.alertTypeId!);
    const ruleDomain: RuleDomain<Params> = transformRuleAttributesToRuleDomain<Params>(
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
      context.logger.warn(`Error validating bulk enable rule domain object for id: ${id}, ${e}`);
    }
    return ruleDomain;
  });

  // // TODO (http-versioning): This should be of type Rule, change this when all rule types are fixed
  const updatePublicRules = updatedRules.map((rule: RuleDomain<Params>) => {
    return transformRuleDomainToRule<Params>(rule);
  }) as Array<SanitizedRule<Params>>;

  return { errors, rules: updatePublicRules, total, taskIdsFailedToBeEnabled };
};

const bulkEnableRulesWithOCC = async (
  context: RulesClientContext,
  { filter, totalNumOfRules }: { filter: KueryNode | null; totalNumOfRules: number }
) => {
  const rulesFinder = await withSpan(
    {
      name: 'encryptedSavedObjectsClient.createPointInTimeFinderDecryptedAsInternalUser',
      type: 'rules',
    },
    async () =>
      await context.encryptedSavedObjectsClient.createPointInTimeFinderDecryptedAsInternalUser<RawRule>(
        {
          filter,
          type: RULE_SAVED_OBJECT_TYPE,
          perPage: 100,
          ...(context.namespace ? { namespaces: [context.namespace] } : undefined),
        }
      )
  );

  const rulesFinderRules: Array<SavedObjectsFindResult<RawRule>> = [];
  const rulesToEnable: Array<SavedObjectsBulkUpdateObject<RawRule>> = [];
  const tasksToSchedule: TaskInstanceWithDeprecatedFields[] = [];
  const errors: BulkOperationError[] = [];
  const ruleNameToRuleIdMapping: Record<string, string> = {};
  const username = await context.getUserName();
  const rulesToClearFlapping: Array<{ id: string; ruleTypeId: string }> = [];
  let scheduleValidationError = '';

  await withSpan(
    { name: 'Get rules, collect them and their attributes', type: 'rules' },
    async () => {
      for await (const response of rulesFinder.find()) {
        rulesFinderRules.push(...response.saved_objects);
      }
      await rulesFinder.close();

      const updatedInterval = rulesFinderRules.map((rule) => rule.attributes.schedule?.interval);

      const validationPayload = await validateScheduleLimit({
        context,
        updatedInterval,
      });

      if (validationPayload) {
        scheduleValidationError = getRuleCircuitBreakerErrorMessage({
          interval: validationPayload.interval,
          intervalAvailable: validationPayload.intervalAvailable,
          action: 'bulkEnable',
          rules: updatedInterval.length,
        });
      }

      await bulkMigrateLegacyActions({ context, rules: rulesFinderRules });

      await pMap(
        rulesFinderRules,
        async (rule) => {
          const ruleName = rule.attributes.name;

          const ruleType = context.ruleTypeRegistry.get(rule.attributes.alertTypeId);
          const { autoRecoverAlerts: isLifecycleAlert } = ruleType;
          try {
            if (scheduleValidationError) {
              throw Error(scheduleValidationError);
            }
            if (rule.attributes.actions.length) {
              try {
                await context.actionsAuthorization.ensureAuthorized({ operation: 'execute' });
              } catch (error) {
                throw Error(`Rule not authorized for bulk enable - ${error.message}`);
              }
            }
            if (ruleName) {
              ruleNameToRuleIdMapping[rule.id] = ruleName;
            }

            if (isLifecycleAlert) {
              rulesToClearFlapping.push({
                id: rule.id,
                ruleTypeId: ruleType.id,
              });
            }

            const nowIso = new Date().toISOString();
            const newApiKeyAttributes = !rule.attributes.apiKey
              ? await createNewAPIKeySet(context, {
                  id: rule.attributes.alertTypeId,
                  ruleName,
                  username,
                  shouldUpdateApiKey: true,
                  apiKeyOwnership: { apiKeyCreatedByUser: rule.attributes.apiKeyCreatedByUser },
                })
              : undefined;

            const updatedAttributes = updateMetaAttributes(context, {
              ...(newApiKeyAttributes
                ? {
                    ...omit(rule.attributes, API_KEY_ATTRIBUTES_TO_STRIP),
                    ...newApiKeyAttributes,
                  }
                : rule.attributes),
              enabled: true,
              updatedBy: username,
              updatedAt: nowIso,
              ...(!rule.attributes.enabled ? { lastEnabledAt: nowIso } : {}),
              executionStatus: {
                status: 'pending',
                lastDuration: 0,
                lastExecutionDate: nowIso,
                error: null,
                warning: null,
              },
              scheduledTaskId: rule.id,
              ...(rule.attributes.lastRun
                ? { lastRun: migrateLegacyLastRunOutcomeMsg(rule.attributes.lastRun) }
                : {}),
            });

            const shouldScheduleTask = await getShouldScheduleTask(
              context,
              rule.attributes.scheduledTaskId
            );

            if (shouldScheduleTask) {
              tasksToSchedule.push({
                id: rule.id,
                taskType: `alerting:${rule.attributes.alertTypeId}`,
                schedule: rule.attributes.schedule,
                params: {
                  alertId: rule.id,
                  spaceId: context.spaceId,
                  consumer: rule.attributes.consumer,
                },
                state: {
                  previousStartedAt: null,
                  alertTypeState: {},
                  alertInstances: {},
                },
                scope: ['alerting'],
                enabled: false, // we create the task as disabled, taskManager.bulkEnable will enable them by randomising their schedule datetime
              });
            }

            rulesToEnable.push({
              ...rule,
              attributes: updatedAttributes,
            });

            context.auditLogger?.log(
              ruleAuditEvent({
                action: RuleAuditAction.ENABLE,
                outcome: 'unknown',
                savedObject: {
                  type: RULE_SAVED_OBJECT_TYPE,
                  id: rule.id,
                  name: ruleName,
                },
              })
            );
          } catch (error) {
            errors.push({
              message: error.message,
              rule: {
                id: rule.id,
                name: rule.attributes?.name,
              },
            });
            context.auditLogger?.log(
              ruleAuditEvent({
                action: RuleAuditAction.ENABLE,
                savedObject: {
                  type: RULE_SAVED_OBJECT_TYPE,
                  id: rule.id,
                  name: ruleName,
                },
                error,
              })
            );
          }
        },
        {
          concurrency: MAX_RULES_TO_UPDATE_IN_PARALLEL,
        }
      );
    }
  );

  if (tasksToSchedule.length > 0) {
    await withSpan({ name: 'taskManager.bulkSchedule', type: 'tasks' }, () =>
      context.taskManager.bulkSchedule(tasksToSchedule)
    );
  }

  const bulkEnableTimestamp = Date.now();
  const result = await withSpan(
    { name: 'unsecuredSavedObjectsClient.bulkCreate', type: 'rules' },
    () =>
      // TODO (http-versioning): for whatever reasoning we are using SavedObjectsBulkUpdateObject
      // everywhere when it should be SavedObjectsBulkCreateObject. We need to fix it in
      // bulk_disable, bulk_enable, etc. to fix this cast
      bulkCreateRulesSo({
        savedObjectsClient: context.unsecuredSavedObjectsClient,
        bulkCreateRuleAttributes: rulesToEnable as Array<SavedObjectsBulkCreateObject<RawRule>>,
        savedObjectsBulkCreateOptions: {
          overwrite: true,
        },
      })
  );

  await logRuleChanges({
    ruleSOs: result.saved_objects,
    encryptedFieldsMap: new Map(
      rulesToEnable.map(({ id, attributes }) => [
        id,
        { apiKey: attributes.apiKey ?? null, uiamApiKey: attributes.uiamApiKey ?? null },
      ])
    ),
    rulesClientContext: context,
    changesContext: {
      action: RuleChangeTrackingAction.ruleEnable,
      timestamp: bulkEnableTimestamp,
      metadata: { bulkCount: totalNumOfRules },
    },
  });

  // Get a map of all rules that failed to enable so we do not clear their flapping
  const ruleIdsFailedToEnable: Record<string, boolean> = {};

  result.saved_objects.forEach((rule) => {
    if (rule.error) {
      ruleIdsFailedToEnable[rule.id] = true;
    }
  });

  // Remove all failed to enable rule ids and rule type ids
  const ruleIdsToClearFlapping: string[] = [];
  const ruleTypeIdsToClearFlapping: Record<string, boolean> = {};

  rulesToClearFlapping.forEach(({ id, ruleTypeId }) => {
    if (!ruleIdsFailedToEnable[id]) {
      ruleIdsToClearFlapping.push(id);
      ruleTypeIdsToClearFlapping[ruleTypeId] = true;
    }
  });

  // Attempt to clear flapping from those rule ids
  if (context.alertsService && ruleIdsToClearFlapping.length) {
    try {
      await context.alertsService.clearAlertFlappingHistory({
        indices: context.getAlertIndicesAlias(
          Object.keys(ruleTypeIdsToClearFlapping),
          context.spaceId
        ),
        ruleIds: ruleIdsToClearFlapping,
      });
    } catch (error) {
      // Don't throw if we can't clear the flapping history for whatever reason
      context.logger.error(
        `Failure to clear flapping history from rule ${JSON.stringify(ruleIdsToClearFlapping)} - ${
          error.message
        }`
      );
    }
  }

  const rules: Array<SavedObjectsBulkUpdateObject<RawRule>> = [];
  const taskIdsToEnable: string[] = [];

  result.saved_objects.forEach((rule) => {
    if (rule.error === undefined) {
      if (rule.attributes.scheduledTaskId) {
        taskIdsToEnable.push(rule.attributes.scheduledTaskId);
      }
      rules.push(rule);
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
    // TODO: delete the casting when we do versioning of bulk disable api
    rules: rules as Array<SavedObjectsBulkUpdateObject<RawRule>>,
    accListSpecificForBulkOperation: [taskIdsToEnable],
  };
};

export const tryToEnableTasks = async ({
  taskIdsToEnable,
  logger,
  taskManager,
}: {
  taskIdsToEnable: string[];
  logger: Logger;
  taskManager: TaskManagerStartContract;
}) => {
  const taskIdsFailedToBeEnabled: string[] = [];

  if (taskIdsToEnable.length > 0) {
    try {
      const resultFromEnablingTasks = await withSpan(
        { name: 'taskManager.bulkEnable', type: 'rules' },
        async () => taskManager.bulkEnable(taskIdsToEnable)
      );
      resultFromEnablingTasks?.errors?.forEach((error) => {
        taskIdsFailedToBeEnabled.push(error.id);
      });
      if (resultFromEnablingTasks.tasks.length) {
        logger.debug(
          `Successfully enabled schedules for underlying tasks: ${resultFromEnablingTasks.tasks
            .map((task) => task.id)
            .join(', ')}`
        );
      }
      if (resultFromEnablingTasks.errors.length) {
        logger.error(
          `Failure to enable schedules for underlying tasks: ${resultFromEnablingTasks.errors
            .map((error) => error.id)
            .join(', ')}`
        );
      }
    } catch (error) {
      taskIdsFailedToBeEnabled.push(...taskIdsToEnable);
      logger.error(
        `Failure to enable schedules for underlying tasks: ${taskIdsToEnable.join(
          ', '
        )}. TaskManager bulkEnable failed with Error: ${error.message}`
      );
    }
  }
  return taskIdsFailedToBeEnabled;
};
