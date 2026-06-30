/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createTaskRunError, TaskErrorSource } from '@kbn/task-manager-plugin/server';
import { type FakeRawRequest, type Headers, type KibanaRequest } from '@kbn/core-http-server';
import { asSpaceId } from '@kbn/core-spaces-common';
import { kibanaRequestFactory } from '@kbn/core-http-server-utils';
import type { SavedObject, SavedObjectReference } from '@kbn/core-saved-objects-api-server';
import type { Logger } from '@kbn/logging';
import { SavedObjectsErrorHelpers } from '@kbn/core-saved-objects-server';
import { ApiKeyType, type RunRuleParams, type TaskRunnerContext } from './types';
import { ErrorWithReason, validateRuleTypeParams } from '../lib';
import type { RawRule, RuleTypeRegistry, RuleTypeParamsValidator } from '../types';
import { RuleExecutionStatusErrorReasons } from '../types';
import type { RuleTypeParams } from '../../common';
import { MONITORING_HISTORY_LIMIT } from '../../common';
import { RULE_SAVED_OBJECT_TYPE } from '../saved_objects';
import { getAlertFromRaw } from '../rules_client/lib';
import { UIAM_LOGS_USAGE_TAGS } from '../constants';

interface RuleData {
  rawRule: RawRule;
  version: string | undefined;
  references: SavedObjectReference[];
}

interface ValidateRuleAndCreateFakeRequestParams<Params extends RuleTypeParams> {
  context: TaskRunnerContext;
  logger: Logger;
  paramValidator?: RuleTypeParamsValidator<Params>;
  ruleData: RuleData;
  ruleId: string;
  ruleTypeRegistry: RuleTypeRegistry;
  spaceId: string;
}

/**
 * With the decrypted rule saved object
 * - transform from domain model to application model (rule)
 * - create a fakeRequest object using the rule API key
 * - get an instance of the RulesClient using the fakeRequest
 */
export function validateRuleAndCreateFakeRequest<Params extends RuleTypeParams>(
  params: ValidateRuleAndCreateFakeRequestParams<Params>
): RunRuleParams<Params> {
  const {
    context,
    logger,
    paramValidator,
    ruleData: { rawRule, references, version },
    ruleId,
    ruleTypeRegistry,
    spaceId,
  } = params;

  const {
    enabled,
    apiKey,
    uiamApiKey,
    apiKeyCreatedByUser,
    apiKeyOwner,
    alertTypeId: ruleTypeId,
  } = rawRule;

  if (!enabled) {
    throw createTaskRunError(
      new ErrorWithReason(
        RuleExecutionStatusErrorReasons.Disabled,
        new Error(`Rule failed to execute because rule ran after it was disabled.`)
      ),
      TaskErrorSource.FRAMEWORK
    );
  }

  const { fakeRequest, effectiveApiKey } = getFakeKibanaRequest(context, spaceId, apiKey, {
    uiamApiKey,
    apiKeyCreatedByUser,
    apiKeyOwner,
    ruleId,
  });
  const rule = getAlertFromRaw({
    id: ruleId,
    isSystemAction: (actionId: string) => context.actionsPlugin.isSystemActionConnector(actionId),
    logger,
    rawRule,
    references,
    ruleTypeId,
    ruleTypeRegistry,
  });

  try {
    ruleTypeRegistry.ensureRuleTypeEnabled(rule.alertTypeId);
  } catch (err) {
    throw createTaskRunError(
      new ErrorWithReason(RuleExecutionStatusErrorReasons.License, err),
      TaskErrorSource.USER
    );
  }

  let validatedParams: Params;
  try {
    validatedParams = validateRuleTypeParams<Params>(rule.params, paramValidator);
  } catch (err) {
    throw createTaskRunError(
      new ErrorWithReason(RuleExecutionStatusErrorReasons.Validate, err),
      TaskErrorSource.USER
    );
  }

  if (rule.monitoring) {
    if (rule.monitoring.run.history.length >= MONITORING_HISTORY_LIMIT) {
      // Remove the first (oldest) record
      rule.monitoring.run.history.shift();
    }
  }

  return {
    effectiveApiKey,
    fakeRequest,
    rule: { ...rule, snoozedInstances: rawRule.snoozedInstances ?? [] },
    validatedParams,
    version,
  };
}

/**
 * Loads the decrypted rule saved object
 */
export async function getDecryptedRule(
  context: TaskRunnerContext,
  ruleId: string,
  spaceId: string
): Promise<RuleData> {
  const namespace = context.spaceIdToNamespace(spaceId);

  let rawRule: SavedObject<RawRule>;

  try {
    rawRule = await context.encryptedSavedObjectsClient.getDecryptedAsInternalUser<RawRule>(
      RULE_SAVED_OBJECT_TYPE,
      ruleId,
      { namespace }
    );
  } catch (e) {
    const error = new ErrorWithReason(RuleExecutionStatusErrorReasons.Decrypt, e);
    if (SavedObjectsErrorHelpers.isNotFoundError(e)) {
      throw createTaskRunError(error, TaskErrorSource.USER);
    }
    throw createTaskRunError(error, TaskErrorSource.FRAMEWORK);
  }

  return {
    version: rawRule.version,
    rawRule: rawRule.attributes,
    references: rawRule.references,
  };
}

/**
 * Builds the fake request a rule run executes under AND returns the resolved
 * credential it authenticates with, so callers (e.g. `ActionScheduler`) can
 * enqueue scheduled connector tasks under the same key. `effectiveApiKey` is
 * the value that was placed after `ApiKey ` in the request's `Authorization`
 * header — the base64 `id:secret` for ES rules, or the decoded raw `essu_…`
 * UIAM secret for UIAM rules.
 */
export interface GetFakeKibanaRequestOptions {
  uiamApiKey?: RawRule['uiamApiKey'];
  apiKeyCreatedByUser?: RawRule['apiKeyCreatedByUser'];
  apiKeyOwner?: RawRule['apiKeyOwner'];
  ruleId?: string;
}

export function getFakeKibanaRequest(
  context: TaskRunnerContext,
  spaceId: string,
  apiKey: RawRule['apiKey'],
  options: GetFakeKibanaRequestOptions = {}
): { fakeRequest: KibanaRequest; effectiveApiKey: string | null } {
  const { uiamApiKey, apiKeyCreatedByUser, apiKeyOwner, ruleId } = options;
  const requestHeaders: Headers = {};
  let effectiveApiKey: string | null = null;

  const shouldUseUiamApiKey = context.shouldGrantUiam && context.apiKeyType === ApiKeyType.UIAM;
  const logTags = ruleId ? [...UIAM_LOGS_USAGE_TAGS, ruleId] : UIAM_LOGS_USAGE_TAGS;

  if (shouldUseUiamApiKey) {
    if (!uiamApiKey) {
      if (apiKey) {
        requestHeaders.authorization = `ApiKey ${apiKey}`;
        effectiveApiKey = apiKey;
      }
      if (apiKeyCreatedByUser && apiKey) {
        context.logger.debug(
          'UIAM API key is not provided to create a fake request, falling back to ES API key created by the user.',
          {
            tags: logTags,
          }
        );
      } else if (isLikelyNonCloudUserApiKeyOwner(apiKeyOwner)) {
        context.logger.debug(
          'UIAM API key is not provided because the Elasticsearch API key creator is likely a non-Cloud user, falling back to regular API key.',
          {
            tags: logTags,
          }
        );
      } else {
        context.logger.warn(
          'UIAM API key is not provided to create a fake request, falling back to regular API key.',
          {
            tags: logTags,
          }
        );
      }
    } else {
      const [, uiamApiKeyValue] = Buffer.from(uiamApiKey, 'base64').toString().split(':');
      requestHeaders.authorization = `ApiKey ${uiamApiKeyValue}`;
      effectiveApiKey = uiamApiKeyValue;
    }
  } else if (apiKey) {
    requestHeaders.authorization = `ApiKey ${apiKey}`;
    effectiveApiKey = apiKey;
  }

  const fakeRawRequest: FakeRawRequest = {
    headers: requestHeaders,
    spaceId: asSpaceId(spaceId),
  };

  const fakeRequest = kibanaRequestFactory(fakeRawRequest);

  return { fakeRequest, effectiveApiKey };
}

const isLikelyNonCloudUserApiKeyOwner = (apiKeyOwner?: string | null): boolean => {
  if (typeof apiKeyOwner !== 'string') {
    return false;
  }

  const trimmedApiKeyOwner = apiKeyOwner.trim();
  return trimmedApiKeyOwner.length > 0 && !/^\d+$/.test(trimmedApiKeyOwner);
};
