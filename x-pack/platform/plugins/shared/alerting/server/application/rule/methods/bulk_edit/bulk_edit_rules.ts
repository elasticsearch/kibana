/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import { cloneDeep } from 'lodash';
import type { SavedObjectsFindResult } from '@kbn/core/server';
import { RuleChangeTrackingAction } from '@kbn/alerting-types';
import type { UntypedNormalizedRuleType } from '../../../../rule_type_registry';
import { updateRuleInMemory } from '../../../../rules_client/common/bulk_edit';
import type {
  BulkEditResult,
  ParamsModifier,
  ShouldIncrementRevision,
  UpdateOperationOpts,
} from '../../../../rules_client/common/bulk_edit/types';
import { validateAndAuthorizeSystemActions } from '../../../../lib/validate_authorize_system_actions';
import type { RuleAction, RuleSystemAction } from '../../../../../common';
import { RULE_SAVED_OBJECT_TYPE } from '../../../../saved_objects';
import { WriteOperations } from '../../../../authorization';
import { parseDuration } from '../../../../../common';
import { ruleAuditEvent, RuleAuditAction } from '../../../../rules_client/common/audit_events';
import { bulkEditRules as bulkEditRulesHelper } from '../../../../rules_client/common/bulk_edit';
import {
  applyBulkEditOperation,
  getBulkSnooze,
  getBulkUnsnooze,
  verifySnoozeScheduleLimit,
} from '../../../../rules_client/common';
import { validateActions, addGeneratedActionValues } from '../../../../rules_client/lib';
import type { RulesClientContext, NormalizedAlertAction } from '../../../../rules_client/types';
import type {
  BulkEditFields,
  BulkEditOperation,
  BulkEditOptionsFilter,
  BulkEditOptionsIds,
} from './types';
import type { RawRule, SanitizedRule } from '../../../../types';
import { ruleNotifyWhen } from '../../constants';
import { actionRequestSchema, systemActionRequestSchema } from '../../schemas';
import type { RuleParams, RuleDomain, RuleSnoozeSchedule } from '../../types';

export const bulkEditFieldsToExcludeFromRevisionUpdates = new Set(['snoozeSchedule', 'apiKey']);

export type BulkEditOptions<Params extends RuleParams> =
  | BulkEditOptionsFilter<Params>
  | BulkEditOptionsIds<Params>;

export async function bulkEditRules<Params extends RuleParams>(
  context: RulesClientContext,
  options: BulkEditOptions<Params>
): Promise<BulkEditResult<Params>> {
  const shouldInvalidateApiKeys = true;
  const auditAction = RuleAuditAction.BULK_EDIT;
  const requiredAuthOperation = WriteOperations.BulkEdit;

  const result = await bulkEditRulesHelper<Params>(context, {
    ...options,
    name: `rulesClient.bulkEditRules('operations=${JSON.stringify(
      options.operations
    )}, paramsModifier=${
      options.paramsModifier ? '[Function]' : undefined
    }', shouldIncrementRevision=${options.shouldIncrementRevision ? '[Function]' : undefined}')`,
    auditAction,
    requiredAuthOperation,
    shouldInvalidateApiKeys,
    changeTracking: {
      action: deriveChangeTrackingAction(options.operations),
      ...options.changeTracking,
    },
    shouldValidateSchedule: options.operations.some((operation) => operation.field === 'schedule'),
    updateFn: (opts: UpdateOperationOpts) =>
      updateRuleAttributesAndParamsInMemory<Params>({
        ...opts,
        context,
        shouldInvalidateApiKeys,
        operations: options.operations,
        paramsModifier: options.paramsModifier,
        shouldIncrementRevision: options.shouldIncrementRevision,
      }),
  });

  await bulkUpdateTaskSchedules(context, options.operations, result.rules);

  return result;
}

async function bulkUpdateTaskSchedules<Params extends RuleParams>(
  context: RulesClientContext,
  operations: BulkEditOperation[],
  updatedRules: Array<SanitizedRule<Params>>
): Promise<void> {
  const scheduleOperation = operations.find(
    (
      operation
    ): operation is Extract<BulkEditOperation, { field: Extract<BulkEditFields, 'schedule'> }> =>
      operation.field === 'schedule'
  );

  if (!scheduleOperation?.value) {
    return;
  }
  const taskIds = updatedRules.reduce<string[]>((acc, rule) => {
    if (rule.scheduledTaskId) {
      acc.push(rule.scheduledTaskId);
    }
    return acc;
  }, []);

  try {
    await context.taskManager.bulkUpdateSchedules(taskIds, scheduleOperation.value);
    context.logger.debug(
      `Successfully updated schedules for underlying tasks: ${taskIds.join(', ')}`
    );
  } catch (error) {
    context.logger.error(
      `Failure to update schedules for underlying tasks: ${taskIds.join(
        ', '
      )}. TaskManager bulkUpdateSchedules failed with Error: ${error.message}`
    );
  }
}

async function updateRuleAttributesAndParamsInMemory<Params extends RuleParams>({
  context,
  operations,
  paramsModifier,
  rule,
  apiKeysMap,
  rules,
  skipped,
  errors,
  username,
  shouldInvalidateApiKeys,
  shouldIncrementRevision = () => true,
  legacyActionsMigratedRuleIds,
}: UpdateOperationOpts & {
  context: RulesClientContext;
  shouldInvalidateApiKeys: boolean;
  operations: BulkEditOperation[];
  paramsModifier?: ParamsModifier<Params>;
  shouldIncrementRevision?: ShouldIncrementRevision<Params>;
}): Promise<void> {
  try {
    await ensureAuthorizationForBulkUpdate(context, operations, rule);

    await updateRuleInMemory(context, {
      rule,
      apiKeysMap,
      rules,
      skipped,
      errors,
      username,
      paramsModifier,
      shouldInvalidateApiKeys,
      shouldIncrementRevision,
      legacyActionsMigratedRuleIds,
      updateAttributesFn: async ({ domainRule, ruleActions, ruleType }) => {
        const result = await getUpdatedAttributesFromOperations({
          context,
          operations,
          rule: domainRule,
          ruleActions,
          ruleType,
        });

        // validate the updated schedule interval
        validateScheduleInterval(
          context,
          result.rule.schedule.interval,
          ruleType.id,
          domainRule.id
        );

        return result;
      },
    });
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
        action: RuleAuditAction.BULK_EDIT,
        savedObject: { type: RULE_SAVED_OBJECT_TYPE, id: rule.id, name: rule.attributes?.name },
        error,
      })
    );
  }
}

async function ensureAuthorizationForBulkUpdate(
  context: RulesClientContext,
  operations: BulkEditOperation[],
  rule: SavedObjectsFindResult<RawRule>
): Promise<void> {
  if (rule.attributes.actions.length === 0) {
    return;
  }

  const needsAuth = new Set<BulkEditFields>();
  for (const operation of operations) {
    if (operation.field === 'snoozeSchedule' || operation.field === 'apiKey') {
      needsAuth.add(operation.field);
    }
  }

  if (needsAuth.size > 0) {
    try {
      await context.actionsAuthorization.ensureAuthorized({ operation: 'execute' });
    } catch (error) {
      throw Error(
        `Rule not authorized for bulk ${[...needsAuth].join(', ')} update - ${error.message}`
      );
    }
  }
}

async function getUpdatedAttributesFromOperations<Params extends RuleParams>({
  context,
  operations,
  rule,
  ruleActions,
  ruleType,
}: {
  context: RulesClientContext;
  operations: BulkEditOperation[];
  rule: RuleDomain<Params>;
  ruleActions: RuleDomain['actions'] | RuleDomain['systemActions'];
  ruleType: UntypedNormalizedRuleType;
}) {
  const actionsClient = await context.getActionsClient();

  let updatedRule = cloneDeep(rule);
  let updatedRuleActions = ruleActions;
  let hasUpdateApiKeyOperation = false;
  let isAttributesUpdateSkipped = true;

  for (const operation of operations) {
    // Check if the update should be skipped for the current action.
    // If it should, save the skip reasons in attributesUpdateSkipReasons
    // and continue to the next operation before without
    // the `isAttributesUpdateSkipped` flag to false.
    switch (operation.field) {
      case 'actions': {
        const systemActions = operation.value.filter((action): action is RuleSystemAction =>
          actionsClient.isSystemAction(action.id)
        );
        const actions = operation.value.filter(
          (action): action is RuleAction => !actionsClient.isSystemAction(action.id)
        );

        systemActions.forEach((systemAction) => {
          try {
            systemActionRequestSchema.validate(systemAction);
          } catch (error) {
            throw Boom.badRequest(`Error validating bulk edit rules operations - ${error.message}`);
          }
        });

        actions.forEach((action) => {
          try {
            actionRequestSchema.validate(action);
          } catch (error) {
            throw Boom.badRequest(`Error validating bulk edit rules operations - ${error.message}`);
          }
        });

        const { actions: genActions, systemActions: genSystemActions } =
          await addGeneratedActionValues(actions, systemActions, context);
        const updatedOperation = {
          ...operation,
          value: [...genActions, ...genSystemActions],
        };

        await validateAndAuthorizeSystemActions({
          actionsClient,
          actionsAuthorization: context.actionsAuthorization,
          connectorAdapterRegistry: context.connectorAdapterRegistry,
          systemActions: genSystemActions,
          rule: { consumer: updatedRule.consumer, producer: ruleType.producer },
        });

        try {
          await validateActions(context, ruleType, {
            ...updatedRule,
            actions: genActions,
            systemActions: genSystemActions,
          });
        } catch (e) {
          // If validateActions fails on the first attempt, it may be because of legacy rule-level frequency params
          updatedRule = await attemptToMigrateLegacyFrequency(
            context,
            operation.field,
            genActions,
            updatedRule,
            ruleType
          );
        }

        const { modifiedAttributes, isAttributeModified } = applyBulkEditOperation(
          updatedOperation,
          {
            actions: updatedRuleActions,
          }
        );
        if (isAttributeModified) {
          updatedRuleActions = modifiedAttributes.actions;
          isAttributesUpdateSkipped = false;
        }

        break;
      }

      case 'snoozeSchedule': {
        if (operation.operation === 'set') {
          const snoozeAttributes = getBulkSnooze(
            updatedRule,
            operation.value as RuleSnoozeSchedule
          );

          try {
            verifySnoozeScheduleLimit(snoozeAttributes.snoozeSchedule);
          } catch (error) {
            throw Error(`Error updating rule: could not add snooze - ${error.message}`);
          }

          updatedRule = {
            ...updatedRule,
            muteAll: snoozeAttributes.muteAll,
            snoozeSchedule: snoozeAttributes.snoozeSchedule as RuleDomain['snoozeSchedule'],
          };
        }

        if (operation.operation === 'delete') {
          const idsToDelete = operation.value && [...operation.value];
          if (idsToDelete?.length === 0) {
            updatedRule.snoozeSchedule?.forEach((schedule) => {
              if (schedule.id) {
                idsToDelete.push(schedule.id);
              }
            });
          }
          const snoozeAttributes = getBulkUnsnooze(updatedRule, idsToDelete);
          updatedRule = {
            ...updatedRule,
            muteAll: snoozeAttributes.muteAll,
            snoozeSchedule: snoozeAttributes.snoozeSchedule as RuleDomain['snoozeSchedule'],
          };
        }

        isAttributesUpdateSkipped = false;
        break;
      }

      case 'apiKey': {
        hasUpdateApiKeyOperation = true;
        isAttributesUpdateSkipped = false;
        break;
      }

      default: {
        if (operation.field === 'schedule') {
          const defaultActions = updatedRule.actions.filter(
            (action) => !actionsClient.isSystemAction(action.id)
          );
          validateScheduleOperation(operation.value, defaultActions, rule.id);
        }

        const { modifiedAttributes, isAttributeModified } = applyBulkEditOperation(
          operation,
          updatedRule
        );

        if (isAttributeModified) {
          updatedRule = {
            ...updatedRule,
            ...modifiedAttributes,
          };
          isAttributesUpdateSkipped = false;
        }
      }
    }
    // Only increment revision if update wasn't skipped and `operation.field` should result in a revision increment
    if (
      !isAttributesUpdateSkipped &&
      !bulkEditFieldsToExcludeFromRevisionUpdates.has(operation.field) &&
      rule.revision - updatedRule.revision === 0
    ) {
      updatedRule.revision += 1;
    }
  }
  return {
    rule: updatedRule,
    ruleActions: updatedRuleActions,
    hasUpdateApiKeyOperation,
    isAttributesUpdateSkipped,
  };
}

function validateScheduleInterval(
  context: RulesClientContext,
  scheduleInterval: string,
  ruleTypeId: string,
  ruleId: string
): void {
  if (!scheduleInterval) {
    return;
  }
  const isIntervalInvalid = parseDuration(scheduleInterval) < context.minimumScheduleIntervalInMs;
  if (isIntervalInvalid && context.minimumScheduleInterval.enforce) {
    throw Error(
      `Error updating rule: the interval is less than the allowed minimum interval of ${context.minimumScheduleInterval.value}`
    );
  } else if (isIntervalInvalid && !context.minimumScheduleInterval.enforce) {
    context.logger.warn(
      `Rule schedule interval (${scheduleInterval}) for "${ruleTypeId}" rule type with ID "${ruleId}" is less than the minimum value (${context.minimumScheduleInterval.value}). Running rules at this interval may impact alerting performance. Set "xpack.alerting.rules.minimumScheduleInterval.enforce" to true to prevent such changes.`
    );
  }
}

/**
 * Validate that updated schedule interval is not longer than any of the existing action frequencies
 * @param schedule Schedule interval that user tries to set
 * @param actions Rule actions
 */
function validateScheduleOperation(
  schedule: RuleDomain['schedule'],
  actions: RuleDomain['actions'],
  ruleId: string
): void {
  const scheduleInterval = parseDuration(schedule.interval);
  const actionsWithInvalidThrottles = [];

  for (const action of actions) {
    // check for actions throttled shorter than the rule schedule
    if (
      action.frequency?.notifyWhen === ruleNotifyWhen.THROTTLE &&
      parseDuration(action.frequency.throttle!) < scheduleInterval
    ) {
      actionsWithInvalidThrottles.push(action);
    }
  }

  if (actionsWithInvalidThrottles.length > 0) {
    throw Error(
      `Error updating rule with ID "${ruleId}": the interval ${schedule.interval} is longer than the action frequencies`
    );
  }
}

async function attemptToMigrateLegacyFrequency<Params extends RuleParams>(
  context: RulesClientContext,
  operationField: BulkEditOperation['field'],
  actions: NormalizedAlertAction[],
  rule: RuleDomain<Params>,
  ruleType: UntypedNormalizedRuleType
) {
  if (operationField !== 'actions')
    throw new Error('Can only perform frequency migration on an action operation');
  // Try to remove the rule-level frequency params, and then validate actions
  if (typeof rule.notifyWhen !== 'undefined') rule.notifyWhen = undefined;
  if (rule.throttle) rule.throttle = undefined;
  await validateActions(context, ruleType, {
    ...rule,
    actions,
  });
  return rule;
}

// Only emit a specific action when the batch is unambiguous (single operation); mixed batches fall back to ruleUpdate.
function deriveChangeTrackingAction(operations: BulkEditOperation[]): RuleChangeTrackingAction {
  if (operations.length === 1 && operations[0].field === 'apiKey') {
    return RuleChangeTrackingAction.ruleUpdateApiKey;
  }

  if (operations.length === 1 && operations[0].field === 'snoozeSchedule') {
    return operations[0].operation === 'set'
      ? RuleChangeTrackingAction.ruleSnooze
      : RuleChangeTrackingAction.ruleUnsnooze;
  }

  return RuleChangeTrackingAction.ruleUpdate;
}
