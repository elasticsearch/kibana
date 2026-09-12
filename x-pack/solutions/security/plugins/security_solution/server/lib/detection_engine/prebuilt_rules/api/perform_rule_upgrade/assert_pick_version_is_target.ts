/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type {
  PerformRuleUpgradeRequestBody,
  PickVersionValues,
} from '../../../../../../common/api/detection_engine';

interface AssertRuleTypeMatchProps {
  requestBody: PerformRuleUpgradeRequestBody;
  ruleId: string;
}

/*
 * Assert that, in the case where a customized rule is undergoing a rule type change,
 * the pick_version value is set to 'TARGET' at all levels (global, rule-specific and field-specific)
 */
export const assertPickVersionIsTarget = ({ requestBody, ruleId }: AssertRuleTypeMatchProps) => {
  const pickVersions = collectPickVersions(requestBody, ruleId);

  const allPickVersionsAreTarget = pickVersions.every((version) => version === 'TARGET');

  // If pick_version is provided at any levels, they must all be set to 'TARGET'
  if (!allPickVersionsAreTarget) {
    throw new Error(
      `Rule update for rule ${ruleId} has a rule type change. All 'pick_version' values for rule must match 'TARGET'`
    );
  }
};

/*
 * Assert that, in the case where a non-customized rule is undergoing a rule type change,
 * the pick_version value is set to 'TARGET' or 'MERGED' at all levels (global, rule-specific
 * and field-specific). For a non-customized rule the merged value of every field equals the
 * target value, so 'MERGED' is equivalent to 'TARGET'. 'BASE' and 'CURRENT' stay forbidden:
 * they would mix the target rule type with field values from a different rule type's schema.
 */
export const assertPickVersionIsTargetOrMerged = ({
  requestBody,
  ruleId,
}: AssertRuleTypeMatchProps) => {
  const pickVersions = collectPickVersions(requestBody, ruleId);

  const allPickVersionsAreTargetOrMerged = pickVersions.every(
    (version) => version === 'TARGET' || version === 'MERGED'
  );

  if (!allPickVersionsAreTargetOrMerged) {
    throw new Error(
      `Rule update for rule ${ruleId} has a rule type change. All 'pick_version' values for rule must match 'TARGET' or 'MERGED'`
    );
  }
};

function collectPickVersions(
  requestBody: PerformRuleUpgradeRequestBody,
  ruleId: string
): Array<PickVersionValues | 'RESOLVED'> {
  const pickVersions: Array<PickVersionValues | 'RESOLVED'> = [];

  if (requestBody.mode === 'SPECIFIC_RULES') {
    const rulePayload = requestBody.rules.find((rule) => rule.rule_id === ruleId);

    // Rule-level pick_version overrides global pick_version. Pick rule-level pick_version if it
    // exists, otherwise use global pick_version. If none exist, we default to 'MERGED'.
    pickVersions.push(rulePayload?.pick_version ?? requestBody.pick_version ?? 'MERGED');

    if (rulePayload?.fields) {
      const fieldPickValues = Object.values(rulePayload?.fields).map((field) => field.pick_version);
      pickVersions.push(...fieldPickValues);
    }
  } else {
    // mode: ALL_RULES
    pickVersions.push(requestBody.pick_version ?? 'MERGED');
  }

  return pickVersions;
}
