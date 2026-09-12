/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { pickBy } from 'lodash';
import { isRuleCustomized } from '../../../../../../common/detection_engine/rule_management/utils';
import { withSecuritySpanSync } from '../../../../../utils/with_security_span';
import type { PromisePoolError } from '../../../../../utils/promise_pool';
import {
  type PerformRuleUpgradeRequestBody,
  type PickVersionValues,
  type AllThreeWayFieldsDiff,
  MissingVersion,
} from '../../../../../../common/api/detection_engine';
import type { UpgradeConflictResolution } from '../../../../../../common/api/detection_engine/prebuilt_rules';
import { UpgradeConflictResolutionEnum } from '../../../../../../common/api/detection_engine/prebuilt_rules';
import { convertRuleToDiffable } from '../../../../../../common/detection_engine/prebuilt_rules/diff/convert_rule_to_diffable';
import type { PrebuiltRuleAsset } from '../../model/rule_assets/prebuilt_rule_asset';
import {
  assertPickVersionIsTarget,
  assertPickVersionIsTargetOrMerged,
} from './assert_pick_version_is_target';
import { FIELD_NAMES_BY_RULE_TYPE_MAP } from './create_props_to_rule_type_map';
import { calculateThreeWayRuleFieldsDiff } from '../../logic/diff/calculation/calculate_three_way_rule_fields_diff';
import { convertPrebuiltRuleAssetToRuleResponse } from '../../../rule_management/logic/detection_rules_client/converters/convert_prebuilt_rule_asset_to_rule_response';
import type { RuleTriad } from '../../model/rule_groups/get_rule_groups';
import { getValueForField } from './get_value_for_field';
import type { RuleUpgradeContext } from './update_rule_telemetry';

interface CreateModifiedPrebuiltRuleAssetsProps {
  upgradeableRules: RuleTriad[];
  requestBody: PerformRuleUpgradeRequestBody;
  defaultPickVersion: PickVersionValues;
}

interface ProcessedRules {
  modifiedPrebuiltRuleAssets: PrebuiltRuleAsset[];
  processingErrors: Array<PromisePoolError<{ rule_id: string }>>;
  ruleUpgradeContexts: RuleUpgradeContext[];
}

export const createModifiedPrebuiltRuleAssets = ({
  upgradeableRules,
  requestBody,
  defaultPickVersion,
}: CreateModifiedPrebuiltRuleAssetsProps) => {
  return withSecuritySpanSync(createModifiedPrebuiltRuleAssets.name, () => {
    const {
      pick_version: globalPickVersion = defaultPickVersion,
      mode,
      on_conflict: onConflict,
    } = requestBody;

    const { modifiedPrebuiltRuleAssets, processingErrors, ruleUpgradeContexts } =
      upgradeableRules.reduce<ProcessedRules>(
        (processedRules, upgradeableRule) => {
          const targetRuleType = upgradeableRule.target.type;
          const ruleId = upgradeableRule.target.rule_id;
          const fieldNames = FIELD_NAMES_BY_RULE_TYPE_MAP.get(targetRuleType);

          try {
            if (fieldNames === undefined) {
              throw new Error(`Unexpected rule type: ${targetRuleType}`);
            }

            const { current, target } = upgradeableRule;
            const isCustomized = isRuleCustomized(current);

            if (current.type !== target.type) {
              if (isCustomized) {
                // Merging field-by-field across two different rule schemas is ambiguous
                // for a customized rule, so it requires 'pick_version' to be 'TARGET'
                // everywhere.
                assertPickVersionIsTarget({ ruleId, requestBody });
              } else {
                // For a non-customized rule, the merged value of every diffable field
                // equals the target value, so 'MERGED' is equivalent to 'TARGET' and both
                // are allowed. 'BASE' and 'CURRENT' stay forbidden - they would mix the
                // target rule type with field values from a different rule type's schema.
                assertPickVersionIsTargetOrMerged({ ruleId, requestBody });
              }
            }

            const calculatedRuleDiff = calculateThreeWayRuleFieldsDiff(
              {
                base_version: upgradeableRule.base
                  ? convertRuleToDiffable(
                      convertPrebuiltRuleAssetToRuleResponse(upgradeableRule.base)
                    )
                  : MissingVersion,
                current_version: convertRuleToDiffable(upgradeableRule.current),
                target_version: convertRuleToDiffable(
                  convertPrebuiltRuleAssetToRuleResponse(upgradeableRule.target)
                ),
              },
              isCustomized
            ) as AllThreeWayFieldsDiff;

            if (mode === 'ALL_RULES' && globalPickVersion === 'MERGED') {
              const fieldsWithConflicts = Object.keys(
                getFieldsDiffConflicts(calculatedRuleDiff, onConflict)
              );
              if (fieldsWithConflicts.length > 0) {
                // If the mode is ALL_RULES, no fields can be overriden to any other pick_version
                // than "MERGED", so throw an error for the fields that have conflicts.
                throw new Error(
                  `Merge conflicts found in rule '${ruleId}' for fields: ${fieldsWithConflicts.join(
                    ', '
                  )}. Please resolve the conflict manually or choose another value for 'pick_version'`
                );
              }
            }

            const modifiedPrebuiltRuleAsset = createModifiedPrebuiltRuleAsset({
              upgradeableRule,
              fieldNames,
              requestBody,
              globalPickVersion,
              calculatedRuleDiff,
            });

            processedRules.modifiedPrebuiltRuleAssets.push(modifiedPrebuiltRuleAsset);

            processedRules.ruleUpgradeContexts.push({
              ruleId,
              ruleName: upgradeableRule.target.name,
              hasBaseVersion: !!upgradeableRule.base,
              isCustomized,
              fieldsDiff: calculatedRuleDiff,
            });

            return processedRules;
          } catch (err) {
            processedRules.processingErrors.push({
              error: err,
              item: { rule_id: ruleId },
            });
            return processedRules;
          }
        },
        {
          modifiedPrebuiltRuleAssets: [],
          processingErrors: [],
          ruleUpgradeContexts: [],
        }
      );

    return {
      modifiedPrebuiltRuleAssets,
      processingErrors,
      ruleUpgradeContexts,
    };
  });
};

interface CreateModifiedPrebuiltRuleAssetParams {
  upgradeableRule: RuleTriad;
  fieldNames: Array<keyof PrebuiltRuleAsset>;
  globalPickVersion: PickVersionValues;
  requestBody: PerformRuleUpgradeRequestBody;
  calculatedRuleDiff: AllThreeWayFieldsDiff;
}

function createModifiedPrebuiltRuleAsset({
  upgradeableRule,
  fieldNames,
  globalPickVersion,
  requestBody,
  calculatedRuleDiff,
}: CreateModifiedPrebuiltRuleAssetParams): PrebuiltRuleAsset {
  const modifiedPrebuiltRuleAsset = {} as Record<string, unknown>;

  for (const fieldName of fieldNames) {
    modifiedPrebuiltRuleAsset[fieldName] = getValueForField({
      fieldName,
      upgradeableRule,
      globalPickVersion,
      requestBody,
      ruleFieldsDiff: calculatedRuleDiff,
    });
  }

  return modifiedPrebuiltRuleAsset as PrebuiltRuleAsset;
}

const getFieldsDiffConflicts = (
  ruleFieldsDiff: Partial<AllThreeWayFieldsDiff>,
  onConflict?: UpgradeConflictResolution
) =>
  pickBy(ruleFieldsDiff, (diff) =>
    onConflict === UpgradeConflictResolutionEnum.UPGRADE_SOLVABLE
      ? diff.conflict !== 'NONE' && diff.conflict !== 'SOLVABLE'
      : diff.conflict !== 'NONE'
  );
