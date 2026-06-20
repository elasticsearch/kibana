/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { omit } from 'lodash';
import type { SavedObjectsBulkUpdateObject, SavedObjectsFindResult } from '@kbn/core/server';
import {
  getRuleNotifyWhenType,
  validateMutatedRuleTypeParams,
  validateRuleTypeParams,
} from '../../../lib';
import type { RuleDomain, RuleParams } from '../../../application/rule/types';
import {
  injectReferencesIntoActions,
  injectReferencesIntoArtifacts,
  addMissingUiamKeyTagIfNeeded,
  API_KEY_ATTRIBUTES_TO_STRIP,
} from '..';
import { createNewAPIKeySet, extractReferences, updateMeta } from '../../lib';
import type {
  BulkOperationError,
  NormalizedAlertActionWithGeneratedValues,
  RulesClientContext,
} from '../../types';
import type { BulkEditActionSkipResult, RawRuleAction, RuleTypeRegistry } from '../../../types';
import { type RawRule } from '../../../types';
import type {
  ApiKeysMap,
  ParamsModifier,
  ShouldIncrementRevision,
  UpdateAttributesFnOpts,
  UpdateAttributesFnResult,
} from './types';
import type { Rule } from '../../../../common';
import {
  transformRuleAttributesToRuleDomain,
  transformRuleDomainToRuleAttributes,
} from '../../../application/rule/transforms';
import { getMappedParams } from '../mapped_params_utils';

type ApiKeyAttributes = Pick<
  RawRule,
  'apiKey' | 'apiKeyOwner' | 'apiKeyCreatedByUser' | 'uiamApiKey'
>;
type RuleType = ReturnType<RuleTypeRegistry['get']>;

export interface UpdateRuleInMemoryOpts<Params extends RuleParams> {
  rule: SavedObjectsFindResult<RawRule>;
  apiKeysMap: ApiKeysMap;
  rules: Array<SavedObjectsBulkUpdateObject<RawRule>>;
  skipped: BulkEditActionSkipResult[];
  errors: BulkOperationError[];
  username: string | null;
  updateAttributesFn: (
    opts: UpdateAttributesFnOpts<Params>
  ) => Promise<UpdateAttributesFnResult<Params>>;
  shouldInvalidateApiKeys: boolean;
  paramsModifier?: ParamsModifier<Params>;
  shouldIncrementRevision?: ShouldIncrementRevision<Params>;
  legacyActionsMigratedRuleIds: string[];
}

export async function updateRuleInMemory<Params extends RuleParams>(
  context: RulesClientContext,
  {
    rule,
    updateAttributesFn,
    paramsModifier,
    apiKeysMap,
    rules,
    skipped,
    errors,
    username,
    shouldInvalidateApiKeys,
    shouldIncrementRevision = () => true,
    legacyActionsMigratedRuleIds,
  }: UpdateRuleInMemoryOpts<Params>
): Promise<void> {
  context.logger.info(`Updating rule in memory for rule: ${rule.id}`);
  if (rule.attributes.apiKey) {
    apiKeysMap.set(rule.id, {
      oldApiKey: rule.attributes.apiKey,
      oldApiKeyCreatedByUser: rule.attributes.apiKeyCreatedByUser,
      oldUiamApiKey: rule.attributes.uiamApiKey,
    });
  }

  const ruleType = context.ruleTypeRegistry.get(rule.attributes.alertTypeId);

  const ruleActions = injectReferencesIntoActions(
    rule.id,
    rule.attributes.actions || [],
    rule.references || []
  );

  const ruleArtifacts = injectReferencesIntoArtifacts(
    rule.id,
    rule.attributes.artifacts,
    rule.references
  );

  const ruleDomain: RuleDomain<Params> = transformRuleAttributesToRuleDomain<Params>(
    rule.attributes,
    {
      id: rule.id,
      logger: context.logger,
      ruleType,
      references: rule.references,
    },
    context.isSystemAction
  );

  const {
    rule: updatedRule,
    ruleActions: updatedRuleActions,
    hasUpdateApiKeyOperation,
    isAttributesUpdateSkipped,
  } = await updateAttributesFn({ domainRule: ruleDomain, ruleActions, ruleType });

  const { modifiedParams: ruleParams, isParamsUpdateSkipped } = paramsModifier
    ? // TODO (http-versioning): Remove the cast when all rule types are fixed
      await paramsModifier(updatedRule as Rule<Params>)
    : {
        modifiedParams: updatedRule.params,
        isParamsUpdateSkipped: true,
      };

  // Increment revision if params ended up being modified AND it wasn't already incremented as part of attribute update
  if (
    shouldIncrementRevision(ruleParams as Params) &&
    !isParamsUpdateSkipped &&
    rule.attributes.revision === updatedRule.revision
  ) {
    updatedRule.revision += 1;
  }

  // If neither attributes nor parameters were updated and the rule did not have
  // legacy actions migrated in-memory, mark the rule as skipped. Rules with
  // migrated legacy actions must always be saved because the legacy sidecar SO
  // has already been deleted by bulkMigrateLegacyActions.
  const hasLegacyActionsMigrated = legacyActionsMigratedRuleIds.includes(rule.id);
  if (isAttributesUpdateSkipped && isParamsUpdateSkipped && !hasLegacyActionsMigrated) {
    skipped.push({
      id: rule.id,
      name: rule.attributes.name,
      skip_reason: 'RULE_NOT_MODIFIED',
    });
    return;
  }

  // validate rule params
  const validatedAlertTypeParams = validateRuleTypeParams(ruleParams, ruleType.validate.params);
  const validatedMutatedAlertTypeParams = validateMutatedRuleTypeParams(
    validatedAlertTypeParams,
    rule.attributes.params,
    ruleType.validate.params
  );

  const {
    references,
    params: updatedParams,
    actions: actionsWithRefs,
    artifacts: artifactsWithRefs,
  } = await extractReferences(
    context,
    ruleType,
    updatedRuleActions as NormalizedAlertActionWithGeneratedValues[],
    validatedMutatedAlertTypeParams,
    ruleArtifacts ?? {}
  );

  const ruleAttributes = transformRuleDomainToRuleAttributes({
    actionsWithRefs,
    rule: updatedRule,
    params: {
      legacyId: rule.attributes.legacyId,
      paramsWithRefs: updatedParams,
    },
    artifactsWithRefs,
  });

  let apiKeyAttributes: ApiKeyAttributes | undefined;
  if (shouldInvalidateApiKeys) {
    const { apiKeyAttributes: preparedApiKeyAttributes } = await prepareApiKeys(
      context,
      rule,
      ruleType,
      apiKeysMap,
      ruleAttributes,
      hasUpdateApiKeyOperation,
      username
    );
    apiKeyAttributes = preparedApiKeyAttributes;
  }

  const { updatedAttributes } = await updateAttributes({
    context,
    attributes: ruleAttributes,
    apiKeyAttributes,
    updatedParams,
    rawAlertActions: ruleAttributes.actions,
    username,
  });

  rules.push({ ...rule, references, attributes: updatedAttributes });
}

async function prepareApiKeys(
  context: RulesClientContext,
  rule: SavedObjectsFindResult<RawRule>,
  ruleType: RuleType,
  apiKeysMap: ApiKeysMap,
  attributes: RawRule,
  hasUpdateApiKeyOperation: boolean,
  username: string | null
): Promise<{ apiKeyAttributes: ApiKeyAttributes }> {
  const apiKeyAttributes = await createNewAPIKeySet(context, {
    id: ruleType.id,
    ruleName: attributes.name,
    username,
    shouldUpdateApiKey: attributes.enabled || hasUpdateApiKeyOperation,
    errorMessage: 'Error updating rule: could not create API key',
    apiKeyOwnership: { apiKeyCreatedByUser: rule.attributes.apiKeyCreatedByUser },
  });

  // collect generated API keys
  if (apiKeyAttributes.apiKey) {
    const { apiKey, apiKeyCreatedByUser, uiamApiKey } = apiKeyAttributes;

    apiKeysMap.set(rule.id, {
      ...apiKeysMap.get(rule.id),
      newApiKey: apiKey,
      newApiKeyCreatedByUser: apiKeyCreatedByUser,
      ...(uiamApiKey ? { newUiamApiKey: uiamApiKey } : {}),
    });
  }

  return {
    apiKeyAttributes,
  };
}

async function updateAttributes({
  context,
  attributes,
  apiKeyAttributes,
  updatedParams,
  rawAlertActions,
  username,
}: {
  context: RulesClientContext;
  attributes: RawRule;
  apiKeyAttributes?: ApiKeyAttributes;
  updatedParams: RuleParams;
  rawAlertActions: RawRuleAction[];
  username: string | null;
}): Promise<{
  updatedAttributes: RawRule;
}> {
  // get notifyWhen
  const notifyWhen = getRuleNotifyWhenType(
    attributes.notifyWhen ?? null,
    attributes.throttle ?? null
  );

  const tagsWithUiamCheck = await addMissingUiamKeyTagIfNeeded(
    attributes.tags,
    apiKeyAttributes?.uiamApiKey,
    apiKeyAttributes?.apiKeyCreatedByUser,
    context.isServerless,
    context.featureFlags
  );

  // TODO (http-versioning) Remove casts when updateMeta has been converted
  const updatedAttributes = updateMeta(context, {
    ...(apiKeyAttributes
      ? {
          ...omit(attributes, [...API_KEY_ATTRIBUTES_TO_STRIP]),
          ...apiKeyAttributes,
        }
      : attributes),
    tags: tagsWithUiamCheck,
    params: updatedParams,
    actions: rawAlertActions,
    notifyWhen,
    updatedBy: username,
    updatedAt: new Date().toISOString(),
  });

  // add mapped_params
  const mappedParams = getMappedParams(updatedParams);

  if (Object.keys(mappedParams).length) {
    updatedAttributes.mapped_params = mappedParams;
  }

  return {
    updatedAttributes,
  };
}
