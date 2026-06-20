/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { cloneDeep } from 'lodash';
import { RuleChangeTrackingAction } from '@kbn/alerting-types';
import { updateRuleInMemory } from '../../../../rules_client/common/bulk_edit';
import type {
  BulkEditResult,
  ParamsModifier,
  ShouldIncrementRevision,
  UpdateOperationOpts,
} from '../../../../rules_client/common/bulk_edit/types';
import { RULE_SAVED_OBJECT_TYPE } from '../../../../saved_objects';
import { ReadOperations } from '../../../../authorization';
import { ruleAuditEvent, RuleAuditAction } from '../../../../rules_client/common/audit_events';
import { applyBulkEditOperation } from '../../../../rules_client/common';
import { bulkEditRules } from '../../../../rules_client/common/bulk_edit';
import type { RulesClientContext } from '../../../../rules_client/types';
import type { BulkEditRuleParamsOptions } from './types';
import type { RuleParams, RuleDomain } from '../../types';
import type {
  BulkEditParamsOperation,
  BulkEditRuleParamsOperation,
} from './types/bulk_edit_rule_params_options';
import { bulkEditRuleParamsOptionsSchema } from './schemas';

export async function bulkEditRuleParamsWithReadAuth<Params extends RuleParams>(
  context: RulesClientContext,
  options: BulkEditRuleParamsOptions<Params>
): Promise<BulkEditResult<Params>> {
  try {
    bulkEditRuleParamsOptionsSchema.validate({
      ids: options.ids,
      filter: options.filter,
      operations: options.operations,
    });
  } catch (error) {
    throw new Error(`Error validating bulkEditRuleParamsWithReadAuth options - ${error.message}`);
  }

  const shouldInvalidateApiKeys = false;
  // only require read access to the rules in order to bulk edit the params
  const auditAction = RuleAuditAction.BULK_EDIT_PARAMS;
  const requiredAuthOperation = ReadOperations.BulkEditParams;

  const result = await bulkEditRules<Params>(context, {
    ...options,
    name: `rulesClient.bulkEditRuleParams('operations=${JSON.stringify(
      options.operations
    )}, paramsModifier=${
      options.paramsModifier ? '[Function]' : undefined
    }', shouldIncrementRevision=${options.shouldIncrementRevision ? '[Function]' : undefined}')`,
    auditAction,
    requiredAuthOperation,
    shouldInvalidateApiKeys,
    changeTracking: {
      action: RuleChangeTrackingAction.ruleUpdate,
      ...options.changeTracking,
    },
    updateFn: (opts: UpdateOperationOpts) =>
      updateRuleParamsInMemory<Params>({
        ...opts,
        context,
        shouldInvalidateApiKeys,
        operations: options.operations,
        paramsModifier: options.paramsModifier,
        shouldIncrementRevision: options.shouldIncrementRevision,
      }),
  });

  return result;
}

async function updateRuleParamsInMemory<Params extends RuleParams>({
  context,
  rule,
  operations,
  apiKeysMap,
  rules,
  skipped,
  errors,
  username,
  shouldInvalidateApiKeys,
  paramsModifier,
  shouldIncrementRevision = () => true,
  legacyActionsMigratedRuleIds,
}: UpdateOperationOpts & {
  context: RulesClientContext;
  shouldInvalidateApiKeys: boolean;
  operations: BulkEditParamsOperation[];
  paramsModifier?: ParamsModifier<Params>;
  shouldIncrementRevision?: ShouldIncrementRevision<Params>;
}): Promise<void> {
  try {
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
      updateAttributesFn: async ({ domainRule, ruleActions }) => {
        const result = await getUpdatedParamAttributesFromOperations({
          operations,
          rule: domainRule,
        });

        return { ...result, ruleActions, hasUpdateApiKeyOperation: false };
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
        action: RuleAuditAction.BULK_EDIT_PARAMS,
        savedObject: { type: RULE_SAVED_OBJECT_TYPE, id: rule.id, name: rule.attributes?.name },
        error,
      })
    );
  }
}

async function getUpdatedParamAttributesFromOperations<Params extends RuleParams>({
  operations,
  rule,
}: {
  operations: BulkEditParamsOperation[];
  rule: RuleDomain<Params>;
}) {
  let updatedRule = cloneDeep(rule);
  let isAttributesUpdateSkipped = true;

  for (const operation of operations) {
    const updatedOperation: BulkEditRuleParamsOperation = {
      ...operation,
      field: `params.${operation.field}`,
    };

    const { modifiedAttributes, isAttributeModified } = applyBulkEditOperation(
      updatedOperation,
      updatedRule
    );

    if (isAttributeModified) {
      updatedRule = { ...updatedRule, ...modifiedAttributes };
      isAttributesUpdateSkipped = false;
    }

    // Only increment revision if update wasn't skipped and `operation.field` should result in a revision increment
    if (!isAttributesUpdateSkipped && rule.revision - updatedRule.revision === 0) {
      updatedRule.revision += 1;
    }
  }
  return {
    rule: updatedRule,
    isAttributesUpdateSkipped,
  };
}
