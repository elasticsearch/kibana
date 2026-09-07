/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RulesClient } from '@kbn/alerting-plugin/server';
import type { ActionsClient } from '@kbn/actions-plugin/server';

import { isEmpty, isEqual } from 'lodash';
import type { BulkEditResult } from '@kbn/alerting-plugin/server/rules_client/common/bulk_edit/types';
import type { SecurityRuleChangeTracking } from '../../../../../../../common/detection_engine/rule_management/rule_change_tracking';
import type { DetectionRulesAuthz } from '../../../../../../../common/detection_engine/rule_management/authz';
import type {
  RulePatchProps,
  RuleResponse,
} from '../../../../../../../common/api/detection_engine/model/rule_schema';
import type { MlAuthz } from '../../../../../machine_learning/authz';
import type { IPrebuiltRuleAssetsClient } from '../../../../prebuilt_rules/logic/rule_assets/prebuilt_rule_assets_client';
import { getIdError } from '../../../utils/utils';
import { validateNonCustomizablePatchFields } from '../../../utils/validate';
import { convertAlertingRuleToRuleResponse } from '../converters/convert_alerting_rule_to_rule_response';
import {
  ClientError,
  validateMlAuth,
  toggleRuleEnabledOnUpdate,
  formatBulkEditResultErrors,
  isReadAuthEditField,
  validateEditedFieldWritePermissions,
} from '../utils';
import { getRuleByIdOrRuleId } from './get_rule_by_id_or_rule_id';
import type { RuleParams } from '../../../../rule_schema';
import { applyRulePatch } from '../mergers/apply_rule_patch';
import { convertRuleResponseToAlertingRule } from '../converters/convert_rule_response_to_alerting_rule';
import { updateReadAuthEditRuleFields } from './rbac_methods/update_rule_with_read_privileges';

interface PatchRuleOptions {
  actionsClient: ActionsClient;
  rulesClient: RulesClient;
  prebuiltRuleAssetClient: IPrebuiltRuleAssetsClient;
  rulePatch: RulePatchProps;
  mlAuthz: MlAuthz;
  rulesAuthz: DetectionRulesAuthz;
  changeTracking?: SecurityRuleChangeTracking;
}

export const patchRule = async ({
  actionsClient,
  rulesClient,
  prebuiltRuleAssetClient,
  rulePatch,
  mlAuthz,
  rulesAuthz,
  changeTracking,
}: PatchRuleOptions): Promise<RuleResponse> => {
  const { rule_id: ruleId, id, ...rulePatchObjWithoutIds } = rulePatch;

  const existingRule = await getRuleByIdOrRuleId({
    rulesClient,
    ruleId,
    id,
  });

  if (existingRule == null) {
    const error = getIdError({ id, ruleId });
    throw new ClientError(error.message, error.statusCode);
  }

  await validateMlAuth(mlAuthz, rulePatch.type ?? existingRule.type);
  validateNonCustomizablePatchFields(rulePatch, existingRule);
  // A PATCH payload only carries the fields the client sent, so presence of a
  // restricted field key (even set to null) means the user is editing it.
  validateEditedFieldWritePermissions(rulePatch, rulesAuthz);

  const patchedRule = await applyRulePatch({
    prebuiltRuleAssetClient,
    existingRule,
    rulePatch,
  });

  // Zod v4 materializes some defaulted optional fields on PATCH payloads (e.g. max_signals),
  // even when the client did not send them. Filter to fields that are both defined and
  // actually changed so RBAC decisions are based on effective user changes.
  const rulePatchDefinedFields: Record<string, unknown> = {};
  let allKeysUpdatable = true;

  for (const [key, value] of Object.entries(rulePatchObjWithoutIds)) {
    if (
      value !== undefined &&
      (!isEqual(value, (existingRule as Record<string, unknown>)[key]) || isReadAuthEditField(key))
    ) {
      rulePatchDefinedFields[key] = value;
      allKeysUpdatable = allKeysUpdatable && isReadAuthEditField(key);
    }
  }

  /**
   * RBAC logic branch
   *
   * Certain fields on the rule object are still able to be modified even if the user only has read permissions,
   * given they have crud permissions for the specific fields they're modifying.
   *
   * If all fields in the PATCH request (besides id/rule_id) are included in the `ReadAuthRuleUpdateProps` type,
   * we check if the user has read authz privileges for the fields and use the `bulkEditRuleParamsWithReadAuth`
   * method provided by the alerting rules client to update the rule fields individually. Otherwise the user
   * will need `all` privileges for rules.
   */
  if (!isEmpty(rulePatchDefinedFields) && allKeysUpdatable) {
    // We remove the `enabled` field from the `updateReadAuthEditRuleFields` as it only modifies `RuleParams` type fields
    // `enabled` is modified later if it exists in the PATCH object
    const { enabled: _, ...fieldsToPatch } = rulePatchDefinedFields;

    const appliedPatchWithReadPrivs: BulkEditResult<RuleParams> =
      await updateReadAuthEditRuleFields({
        rulesClient,
        ruleUpdate: { ...fieldsToPatch, rule_source: patchedRule.rule_source },
        existingRule,
        changeTracking,
      });

    const patchErrors = formatBulkEditResultErrors(appliedPatchWithReadPrivs);
    if (patchErrors) {
      throw new Error(patchErrors);
    }

    const { enabled } = await toggleRuleEnabledOnUpdate(rulesClient, existingRule, patchedRule);

    if (appliedPatchWithReadPrivs.skipped.length) {
      return {
        ...existingRule,
        enabled,
      };
    }

    return convertAlertingRuleToRuleResponse({ ...appliedPatchWithReadPrivs.rules[0], enabled });
  } else {
    const patchedInternalRule = await rulesClient.update({
      id: existingRule.id,
      data: convertRuleResponseToAlertingRule(patchedRule, actionsClient),
      changeTracking,
    });

    const { enabled } = await toggleRuleEnabledOnUpdate(rulesClient, existingRule, patchedRule);

    return convertAlertingRuleToRuleResponse({ ...patchedInternalRule, enabled });
  }
};
