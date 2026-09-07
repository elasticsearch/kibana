/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ActionsClient } from '@kbn/actions-plugin/server';
import type { RulesClient } from '@kbn/alerting-plugin/server';

import type { BulkEditResult } from '@kbn/alerting-plugin/server/rules_client/common/bulk_edit/types';
import type { SecurityRuleChangeTracking } from '../../../../../../../common/detection_engine/rule_management/rule_change_tracking';
import type { DetectionRulesAuthz } from '../../../../../../../common/detection_engine/rule_management/authz';
import type { RuleResponse } from '../../../../../../../common/api/detection_engine/model/rule_schema';
import type { MlAuthz } from '../../../../../machine_learning/authz';
import { applyRuleUpdate } from '../mergers/apply_rule_update';
import { getIdError } from '../../../utils/utils';
import { validateNonCustomizableUpdateFields } from '../../../utils/validate';
import { convertRuleResponseToAlertingRule } from '../converters/convert_rule_response_to_alerting_rule';
import {
  ClientError,
  extractChangedUpdatableFields,
  formatBulkEditResultErrors,
  hasOnlyReadAuthEditableChanges,
  toggleRuleEnabledOnUpdate,
  validateEditedFieldWritePermissions,
  validateMlAuth,
} from '../utils';

import type { RuleUpdateProps } from '../../../../../../../common/api/detection_engine';
import type { IPrebuiltRuleAssetsClient } from '../../../../prebuilt_rules/logic/rule_assets/prebuilt_rule_assets_client';
import { getRuleByIdOrRuleId } from './get_rule_by_id_or_rule_id';
import { convertAlertingRuleToRuleResponse } from '../converters/convert_alerting_rule_to_rule_response';
import type { RuleParams } from '../../../../rule_schema';
import { updateReadAuthEditRuleFields } from './rbac_methods/update_rule_with_read_privileges';

interface UpdateRuleArguments {
  actionsClient: ActionsClient;
  rulesClient: RulesClient;
  prebuiltRuleAssetClient: IPrebuiltRuleAssetsClient;
  ruleUpdate: RuleUpdateProps;
  mlAuthz: MlAuthz;
  rulesAuthz: DetectionRulesAuthz;
  changeTracking?: SecurityRuleChangeTracking;
}

export const updateRule = async ({
  actionsClient,
  rulesClient,
  prebuiltRuleAssetClient,
  ruleUpdate,
  mlAuthz,
  rulesAuthz,
  changeTracking,
}: UpdateRuleArguments): Promise<RuleResponse> => {
  const { rule_id: ruleId, id } = ruleUpdate;

  await validateMlAuth(mlAuthz, ruleUpdate.type);

  const existingRule = await getRuleByIdOrRuleId({
    rulesClient,
    ruleId,
    id,
  });

  if (existingRule == null) {
    const error = getIdError({ id, ruleId });
    throw new ClientError(error.message, error.statusCode);
  }

  validateNonCustomizableUpdateFields(ruleUpdate, existingRule);

  const ruleWithUpdates = await applyRuleUpdate({
    prebuiltRuleAssetClient,
    existingRule,
    ruleUpdate,
  });

  /**
   * RBAC logic branch
   *
   * Certain fields on the rule object are still able to be modified even if the user only has read permissions,
   * given they have crud permissions for the specific fields they're modifying.
   *
   * If the only fields in the PUT request that have been changed from the existing rule are of `ValidReadAuthEditFields`
   * type, we check if the user has read authz privileges for the fields and use the `bulkEditRuleParamsWithReadAuth`
   * method provided by the alerting rules client to update the rule fields individually. Otherwise the user will need
   * `all` privileges for rules.
   */
  if (hasOnlyReadAuthEditableChanges(ruleWithUpdates, existingRule)) {
    // We're only modifying the fields that are editable with read permissions.
    // `modifiedFields` contains only the fields that changed (including a field
    // being unset), so presence of a restricted field means the user is editing it.
    const modifiedFields = extractChangedUpdatableFields(ruleWithUpdates, existingRule);
    validateEditedFieldWritePermissions(modifiedFields, rulesAuthz);

    const appliedUpdateWithReadPrivs: BulkEditResult<RuleParams> =
      await updateReadAuthEditRuleFields({
        rulesClient,
        ruleUpdate: modifiedFields,
        existingRule,
        changeTracking,
      });

    const updateErrors = formatBulkEditResultErrors(appliedUpdateWithReadPrivs);
    if (updateErrors) {
      throw new Error(updateErrors);
    }
    const { enabled } = await toggleRuleEnabledOnUpdate(rulesClient, existingRule, ruleWithUpdates);

    if (appliedUpdateWithReadPrivs.skipped.length) {
      return {
        ...existingRule,
        enabled,
      };
    }

    return convertAlertingRuleToRuleResponse({ ...appliedUpdateWithReadPrivs.rules[0], enabled });
  }

  const updatedRule = await rulesClient.update({
    id: existingRule.id,
    data: convertRuleResponseToAlertingRule(ruleWithUpdates, actionsClient),
    changeTracking,
  });

  const { enabled } = await toggleRuleEnabledOnUpdate(rulesClient, existingRule, ruleWithUpdates);

  return convertAlertingRuleToRuleResponse({
    ...updatedRule,
    enabled,
  });
};
