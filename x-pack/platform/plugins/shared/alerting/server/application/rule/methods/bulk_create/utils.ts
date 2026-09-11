/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Semver from 'semver';

import { validateAndAuthorizeSystemActions } from '../../../../lib/validate_authorize_system_actions';
import {
  validateRuleTypeParams,
  authorizeRuleTypeParams,
  getRuleNotifyWhenType,
  getDefaultMonitoringRuleDomainProperties,
} from '../../../../lib';
import { getRuleExecutionStatusPending } from '../../../../lib/rule_execution_status';
import {
  addGeneratedActionValues,
  createNewAPIKeySet,
  extractReferences,
  validateActions,
} from '../../../../rules_client/lib';
import {
  addMissingUiamKeyTagIfNeeded,
  apiKeyAsRuleDomainProperties,
} from '../../../../rules_client/common';
import type { BulkOperationError } from '../../../../rules_client/types';
import type { RuleParams } from '../../types';
import { transformRuleDomainToRuleAttributes } from '../../transforms';
import type { PreparedRule, PrepareRuleArgs } from './types';

export const prepareRule = async <Params extends RuleParams>({
  context,
  actionsClient,
  username,
  id,
  rule,
  apiKeys,
  invalidKeys,
}: PrepareRuleArgs<Params>): Promise<{ prepared?: PreparedRule; error?: BulkOperationError }> => {
  const { allowMissingConnectorSecrets } = rule;

  try {
    const { actions: genActions, systemActions: genSystemActions } = await addGeneratedActionValues(
      rule.data.actions,
      rule.data.systemActions,
      context
    );
    const data = { ...rule.data, actions: genActions, systemActions: genSystemActions };

    const ruleType = context.ruleTypeRegistry.get(data.alertTypeId);
    const validatedRuleTypeParams = validateRuleTypeParams(data.params, ruleType.validate.params);
    await authorizeRuleTypeParams(validatedRuleTypeParams, ruleType.authorize?.params, {
      request: context.request,
    });

    await validateActions(context, ruleType, data, allowMissingConnectorSecrets);
    await validateAndAuthorizeSystemActions({
      actionsClient,
      actionsAuthorization: context.actionsAuthorization,
      connectorAdapterRegistry: context.connectorAdapterRegistry,
      systemActions: data.systemActions ?? [],
      rule: { consumer: data.consumer, producer: ruleType.producer },
    });

    let apiKeyProps:
      | ReturnType<typeof apiKeyAsRuleDomainProperties>
      | Awaited<ReturnType<typeof createNewAPIKeySet>> = apiKeyAsRuleDomainProperties(
      null,
      username,
      false
    );
    if (data.enabled) {
      apiKeyProps = await createNewAPIKeySet(context, {
        id: ruleType.id,
        ruleName: data.name,
        username,
        shouldUpdateApiKey: true,
        errorMessage: 'Error creating rule: could not create API key',
        refresh: false,
      });
      apiKeys.set(id, {
        apiKey: apiKeyProps.apiKey ?? null,
        uiamApiKey: apiKeyProps.uiamApiKey ?? null,
        apiKeyCreatedByUser: apiKeyProps.apiKeyCreatedByUser ?? null,
      });
    }

    const allActions = [...data.actions, ...(data.systemActions ?? [])];
    const artifacts = data.artifacts ?? {};
    const {
      references,
      params: updatedParams,
      actions: actionsWithRefs,
      artifacts: artifactsWithRefs,
    } = await extractReferences(context, ruleType, allActions, validatedRuleTypeParams, artifacts);

    const createTime = Date.now();
    const lastRunTimestamp = new Date();
    const legacyId = Semver.lt(context.kibanaVersion, '8.0.0') ? id : null;
    const notifyWhen = getRuleNotifyWhenType(data.notifyWhen ?? null, data.throttle ?? null);
    const throttle = data.throttle ?? null;
    const { systemActions: _sa, actions: _a, ...restData } = data;

    const tagsWithUiamCheck = addMissingUiamKeyTagIfNeeded(
      data.tags,
      apiKeyProps.uiamApiKey,
      context.isServerless,
      context.shouldGrantUiam,
      context.apiKeyType
    );

    const ruleAttributes = transformRuleDomainToRuleAttributes({
      actionsWithRefs,
      artifactsWithRefs,
      rule: {
        ...restData,
        tags: tagsWithUiamCheck,
        ...apiKeyProps,
        enabled: data.enabled,
        id,
        createdBy: username,
        updatedBy: username,
        createdAt: new Date(createTime),
        updatedAt: new Date(createTime),
        snoozeSchedule: [],
        muteAll: false,
        mutedInstanceIds: [],
        notifyWhen,
        throttle,
        executionStatus: getRuleExecutionStatusPending(lastRunTimestamp.toISOString()),
        monitoring: getDefaultMonitoringRuleDomainProperties(lastRunTimestamp.toISOString()),
        revision: 0,
        running: false,
      },
      params: { legacyId, paramsWithRefs: updatedParams },
    });

    if (data.enabled) {
      ruleAttributes.lastEnabledAt = new Date(createTime).toISOString();
      ruleAttributes.scheduledTaskId = id;
    }

    const prepared = {
      id,
      name: data.name,
      enabled: data.enabled,
      rawRule: ruleAttributes,
      references,
      schedule: data.schedule,
      consumer: data.consumer,
      ruleTypeId: data.alertTypeId,
      producer: ruleType.producer,
      createdAt: createTime,
      templateId: rule.templateId,
    };
    return { prepared };
  } catch (err) {
    const orphaned = apiKeys.get(id);
    if (orphaned) {
      invalidKeys.push(orphaned);
      apiKeys.delete(id);
    }
    const error = {
      message: err.message,
      status: err.output?.statusCode,
      rule: { id, name: rule.data?.name ?? 'n/a' },
    };
    return { error };
  }
};
