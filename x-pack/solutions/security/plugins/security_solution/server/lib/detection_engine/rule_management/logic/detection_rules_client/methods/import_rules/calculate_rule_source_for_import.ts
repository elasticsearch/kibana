/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  RuleResponse,
  RuleSource,
  ValidatedRuleToImport,
} from '../../../../../../../../common/api/detection_engine';
import type { PrebuiltRuleAsset } from '../../../../../prebuilt_rules';
import { calculateExternalRuleSource } from '../../mergers/rule_source/calculate_external_rule_source';
import { convertRuleToImportToRuleResponse } from './convert_rule_to_import_to_rule_response';

/**
 * Calculates the rule_source field for a rule being imported
 *
 * @param rule The rule to be imported
 * @param prebuiltRuleAssets A list of prebuilt rule assets, which may include
 * the installed version of the specified prebuilt rule.
 * @param isKnownPrebuiltRule {boolean} Whether the rule's rule_id is available as a
 * prebuilt asset (independent of the specified version).
 *
 * @returns The calculated rule_source and immutable fields for the rule
 */
export const calculateRuleSourceForImport = ({
  importedRule,
  currentRule,
  prebuiltRuleAssetsByRuleId,
  isKnownPrebuiltRule,
}: {
  importedRule: ValidatedRuleToImport;
  currentRule: RuleResponse | undefined;
  prebuiltRuleAssetsByRuleId: Record<string, PrebuiltRuleAsset>;
  isKnownPrebuiltRule: boolean;
}): { ruleSource: RuleSource; immutable: boolean } => {
  if (!isKnownPrebuiltRule) {
    return {
      ruleSource: { type: 'internal' },
      immutable: false,
    };
  }

  const baseRule = prebuiltRuleAssetsByRuleId[importedRule.rule_id];
  // We convert here so that RuleSource calculation can
  // continue to deal only with RuleResponses. The fields missing from the
  // incoming rule are not actually needed for the calculation, but only to
  // satisfy the type system.
  const nextRule = convertRuleToImportToRuleResponse(importedRule);

  const ruleSource = calculateExternalRuleSource({
    baseRule,
    nextRule,
    currentRule,
  });

  return {
    ruleSource,
    immutable: true,
  };
};
