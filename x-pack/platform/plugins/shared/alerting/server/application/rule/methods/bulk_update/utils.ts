/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import { isEqual, omit } from 'lodash';
import { withSpan } from '@kbn/apm-utils';
import type { SavedObject } from '@kbn/core/server';
import { parseDuration, type IntervalSchedule } from '../../../../../common';
import {
  convertRuleIdsToKueryNode,
  validateRuleTypeParams,
  authorizeRuleTypeParams,
  getRuleNotifyWhenType,
} from '../../../../lib';
import { validateAndAuthorizeSystemActions } from '../../../../lib/validate_authorize_system_actions';
import {
  getMappedParams,
  addMissingUiamKeyTagIfNeeded,
  API_KEY_ATTRIBUTES_TO_STRIP,
} from '../../../../rules_client/common';
import type {
  BulkOperationError,
  NormalizedAlertActionWithGeneratedValues,
  RulesClientContext,
} from '../../../../rules_client/types';
import {
  addGeneratedActionValues,
  createNewAPIKeySet,
  extractReferences,
  incrementRevision,
  updateMetaAttributes,
  validateActions,
  migrateLegacyLastRunOutcomeMsg,
} from '../../../../rules_client/lib';
import { RULE_SAVED_OBJECT_TYPE } from '../../../../saved_objects';
import type { RawRule } from '../../../../types';
import type { RuleParams } from '../../types';
import { updateRuleDataSchema } from '../update/schemas';
import type { ApiKeyEntry } from '../common_utils/invalidate_keys';
import type { BulkUpdateRulesItem, Pending, PreparedUpdate } from './types';

export const loadRulesByIds = async (
  context: RulesClientContext,
  ids: string[]
): Promise<Array<SavedObject<RawRule>>> => {
  if (ids.length === 0) {
    return [];
  }

  const finder =
    await context.encryptedSavedObjectsClient.createPointInTimeFinderDecryptedAsInternalUser<RawRule>(
      {
        filter: convertRuleIdsToKueryNode(ids),
        type: RULE_SAVED_OBJECT_TYPE,
        perPage: 100,
        ...(context.namespace ? { namespaces: [context.namespace] } : undefined),
      }
    );

  const loaded: Array<SavedObject<RawRule>> = [];
  try {
    for await (const response of finder.find()) {
      loaded.push(...response.saved_objects);
    }
  } finally {
    await finder.close();
  }
  return loaded;
};

export const prepareUpdate = async <Params extends RuleParams>({
  context,
  actionsClient,
  username,
  item,
  original,
  allowMissingConnectorSecrets,
  apiKeys,
  invalidKeys,
}: {
  context: RulesClientContext;
  actionsClient: Awaited<ReturnType<RulesClientContext['getActionsClient']>>;
  username: string | null;
  item: BulkUpdateRulesItem<Params>;
  original: SavedObject<RawRule>;
  allowMissingConnectorSecrets?: boolean;
  apiKeys: Map<string, ApiKeyEntry>;
  invalidKeys: ApiKeyEntry[];
}): Promise<{ prepared?: PreparedUpdate; error?: BulkOperationError }> => {
  const { id, data: initialData } = item;
  const originalRule = original.attributes;
  const name = initialData.name ?? originalRule.name ?? 'n/a';

  try {
    try {
      updateRuleDataSchema.validate(initialData);
    } catch (err) {
      throw Boom.badRequest(`Error validating update data - ${err.message}`);
    }

    context.ruleTypeRegistry.ensureRuleTypeEnabled(originalRule.alertTypeId);
    const ruleType = context.ruleTypeRegistry.get(originalRule.alertTypeId);

    const { actions: genActions, systemActions: genSystemActions } = await addGeneratedActionValues(
      initialData.actions,
      initialData.systemActions,
      context
    );
    const data = {
      ...initialData,
      actions: genActions,
      systemActions: genSystemActions,
    };

    const validatedRuleTypeParams = validateRuleTypeParams(data.params, ruleType.validate.params);
    await authorizeRuleTypeParams(validatedRuleTypeParams, ruleType.authorize?.params, {
      request: context.request,
      previousParams: originalRule.params,
    });
    await validateActions(context, ruleType, data, allowMissingConnectorSecrets);
    await validateAndAuthorizeSystemActions({
      actionsClient,
      actionsAuthorization: context.actionsAuthorization,
      connectorAdapterRegistry: context.connectorAdapterRegistry,
      systemActions: data.systemActions,
      rule: { consumer: originalRule.consumer, producer: ruleType.producer },
    });

    const intervalInMs = parseDuration(data.schedule.interval);
    if (
      intervalInMs < context.minimumScheduleIntervalInMs &&
      context.minimumScheduleInterval.enforce
    ) {
      throw Boom.badRequest(
        `Error updating rule: the interval is less than the allowed minimum interval of ${context.minimumScheduleInterval.value}`
      );
    }
    if (
      intervalInMs < context.minimumScheduleIntervalInMs &&
      !context.minimumScheduleInterval.enforce
    ) {
      context.logger.warn(
        `Rule schedule interval (${data.schedule.interval}) for "${ruleType.id}" rule type with ID "${id}" is less than the minimum value (${context.minimumScheduleInterval.value}). Running rules at this interval may impact alerting performance. Set "xpack.alerting.rules.minimumScheduleInterval.enforce" to true to prevent such changes.`
      );
    }

    const allActions = [...data.actions, ...(data.systemActions ?? [])];
    const artifacts = data.artifacts ?? {};
    const {
      references,
      params: updatedParams,
      actions: actionsWithRefs,
      artifacts: artifactsWithRefs,
    } = await extractReferences(
      context,
      ruleType,
      allActions as NormalizedAlertActionWithGeneratedValues[],
      validatedRuleTypeParams,
      artifacts
    );

    const revision = incrementRevision<Params>({
      originalRule,
      updateRuleData: data,
      updatedParams,
    });

    const apiKeyAttributes = await createNewAPIKeySet(context, {
      id: ruleType.id,
      ruleName: data.name,
      username,
      shouldUpdateApiKey: originalRule.enabled,
      errorMessage: 'Error updating rule: could not create API key',
      apiKeyOwnership: { apiKeyCreatedByUser: originalRule.apiKeyCreatedByUser },
      refresh: false,
    });

    const newKeys: ApiKeyEntry = {
      apiKey: apiKeyAttributes.apiKey ?? null,
      uiamApiKey: apiKeyAttributes.uiamApiKey ?? null,
      apiKeyCreatedByUser: apiKeyAttributes.apiKeyCreatedByUser ?? null,
    };
    if (newKeys.apiKey || newKeys.uiamApiKey) {
      apiKeys.set(id, newKeys);
    }

    const tagsWithUiamCheck = addMissingUiamKeyTagIfNeeded(
      data.tags,
      apiKeyAttributes.uiamApiKey,
      context.isServerless,
      context.shouldGrantUiam,
      context.apiKeyType
    );

    const notifyWhen = getRuleNotifyWhenType(data.notifyWhen ?? null, data.throttle ?? null);

    const updatedRuleAttributes = updateMetaAttributes(context, {
      ...omit(originalRule, API_KEY_ATTRIBUTES_TO_STRIP),
      ...omit(data, 'actions', 'systemActions', 'artifacts'),
      ...apiKeyAttributes,
      tags: tagsWithUiamCheck,
      params: updatedParams as RawRule['params'],
      actions: actionsWithRefs,
      notifyWhen,
      revision,
      updatedBy: username,
      updatedAt: new Date().toISOString(),
      artifacts: artifactsWithRefs,
      enabled: originalRule.enabled,
      ...(originalRule.lastRun
        ? { lastRun: migrateLegacyLastRunOutcomeMsg(originalRule.lastRun) }
        : {}),
    });

    const mappedParams = getMappedParams(updatedParams);
    if (Object.keys(mappedParams).length) {
      updatedRuleAttributes.mapped_params = mappedParams;
    }

    return {
      prepared: {
        id,
        name,
        version: original.version,
        rawRule: updatedRuleAttributes,
        references,
        previousSchedule: originalRule.schedule,
        newSchedule: data.schedule,
        scheduledTaskId: originalRule.scheduledTaskId,
        oldKeys: {
          apiKey: originalRule.apiKey ?? null,
          uiamApiKey: originalRule.uiamApiKey ?? null,
          apiKeyCreatedByUser: originalRule.apiKeyCreatedByUser ?? null,
        },
      },
    };
  } catch (err) {
    const orphaned = apiKeys.get(id);
    if (orphaned) {
      invalidKeys.push(orphaned);
      apiKeys.delete(id);
    }
    return {
      error: {
        message: err.message,
        status: err.output?.statusCode,
        rule: { id, name },
      },
    };
  }
};

export const loadPending = async <Params extends RuleParams>(
  context: RulesClientContext,
  byId: Map<string, BulkUpdateRulesItem<Params>>,
  ids: string[],
  errors: BulkOperationError[]
): Promise<Array<Pending<Params>>> => {
  const loaded = await withSpan(
    {
      name: 'bulkUpdateRules.loadPending.loadRulesByIds',
      type: 'rules',
      labels: { count: String(ids.length) },
    },
    () => loadRulesByIds(context, ids)
  );
  const loadedById = new Map(loaded.map((so) => [so.id, so]));
  const pending: Array<Pending<Params>> = [];

  for (const id of ids) {
    const item = byId.get(id);
    if (!item) {
      continue;
    }
    const original = loadedById.get(id);
    if (!original) {
      errors.push({
        message: `Saved object [alert/${id}] not found`,
        status: 404,
        rule: { id, name: item.data.name ?? 'n/a' },
      });
      continue;
    }
    pending.push({ item, original });
  }

  return pending;
};

export const updateTaskSchedules = async (
  context: RulesClientContext,
  updated: PreparedUpdate[]
): Promise<void> => {
  const groups = new Map<string, { taskIds: string[]; schedule: IntervalSchedule }>();

  for (const prepared of updated) {
    if (!prepared.scheduledTaskId) {
      continue;
    }
    if (isEqual(prepared.previousSchedule, prepared.newSchedule)) {
      continue;
    }
    const key = prepared.newSchedule.interval;
    const group = groups.get(key) ?? { taskIds: [], schedule: prepared.newSchedule };
    group.taskIds.push(prepared.scheduledTaskId);
    groups.set(key, group);
  }

  for (const { taskIds, schedule } of groups.values()) {
    try {
      await context.taskManager.bulkUpdateSchedules(taskIds, schedule);
      context.logger.debug(
        `Successfully updated schedules for underlying tasks: ${taskIds.join(', ')}`
      );
    } catch (err) {
      context.logger.error(
        `Failure to update schedules for underlying tasks: ${taskIds.join(
          ', '
        )}. TaskManager bulkUpdateSchedules failed with Error: ${err.message}`
      );
    }
  }
};
