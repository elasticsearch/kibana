/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RulesClient } from '@kbn/alerting-plugin/server';
import type { ActionsClient } from '@kbn/actions-plugin/server';
import type { SecurityRuleChangeTracking } from '../../../../../../../common/detection_engine/rule_management/rule_change_tracking';
import { SecurityRuleChangeTrackingAction } from '../../../../../../../common/detection_engine/rule_management/rule_change_tracking';
import type { RuleResponse } from '../../../../../../../common/api/detection_engine/model/rule_schema';
import type { MlAuthz } from '../../../../../machine_learning/authz';
import type { PrebuiltRuleAsset } from '../../../../prebuilt_rules';
import type { IPrebuiltRuleAssetsClient } from '../../../../prebuilt_rules/logic/rule_assets/prebuilt_rule_assets_client';
import { convertAlertingRuleToRuleResponse } from '../converters/convert_alerting_rule_to_rule_response';
import { convertRuleResponseToAlertingRule } from '../converters/convert_rule_response_to_alerting_rule';
import { applyRuleUpdate } from '../mergers/apply_rule_update';
import { ClientError, validateMlAuth, mergeExceptionLists } from '../utils';
import { createRule } from './create_rule';
import { getRuleByRuleId } from './get_rule_by_rule_id';

export const upgradePrebuiltRule = async ({
  actionsClient,
  rulesClient,
  ruleAsset,
  mlAuthz,
  prebuiltRuleAssetClient,
  changeTracking,
}: {
  actionsClient: ActionsClient;
  rulesClient: RulesClient;
  ruleAsset: PrebuiltRuleAsset;
  mlAuthz: MlAuthz;
  prebuiltRuleAssetClient: IPrebuiltRuleAssetsClient;
  changeTracking?: SecurityRuleChangeTracking<never>;
}): Promise<RuleResponse> => {
  await validateMlAuth(mlAuthz, ruleAsset.type);

  const existingRule = await getRuleByRuleId({
    rulesClient,
    ruleId: ruleAsset.rule_id,
  });

  if (!existingRule) {
    throw new ClientError(`Failed to find rule ${ruleAsset.rule_id}`, 500);
  }

  if (ruleAsset.type !== existingRule.type) {
    // If we're trying to change the type of a prepackaged rule, we need to delete the old one
    // and replace it with the new rule, keeping the enabled setting, actions, throttle, id,
    // and exception lists from the old rule
    await rulesClient.delete({ id: existingRule.id });

    const createdRule = await createRule({
      actionsClient,
      rulesClient,
      mlAuthz,
      rule: {
        ...ruleAsset,
        immutable: true,
        enabled: existingRule.enabled,
        exceptions_list: existingRule.exceptions_list,
        actions: existingRule.actions,
        timeline_id: existingRule.timeline_id,
        timeline_title: existingRule.timeline_title,
      },
      id: existingRule.id,
      // Bump revision by +1 to make it consistent with an alternative
      // prebuilt rule upgrade branch. It bumps revision due to version change.
      initialRevision: existingRule.revision + 1,
      changeTracking: { action: SecurityRuleChangeTrackingAction.ruleUpgrade, ...changeTracking },
    });

    return createdRule;
  }

  // Else, recreate the rule from scratch with the passed payload.
  const updatedRule = await applyRuleUpdate({
    prebuiltRuleAssetClient,
    existingRule,
    ruleUpdate: ruleAsset,
  });

  // We want to preserve existing actions from existing rule on upgrade
  if (existingRule.actions.length) {
    updatedRule.actions = existingRule.actions;
  }

  const updatedRuleWithMergedExceptions = mergeExceptionLists(updatedRule, existingRule);

  const updatedInternalRule = await rulesClient.update({
    id: existingRule.id,
    data: convertRuleResponseToAlertingRule(updatedRuleWithMergedExceptions, actionsClient),
    changeTracking: {
      action: SecurityRuleChangeTrackingAction.ruleUpgrade,
      ...changeTracking,
    },
  });

  return convertAlertingRuleToRuleResponse(updatedInternalRule);
};
