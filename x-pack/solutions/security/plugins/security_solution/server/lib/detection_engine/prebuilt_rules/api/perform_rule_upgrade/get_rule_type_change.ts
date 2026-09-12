/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  DiffableRuleTypes,
  RuleTypeChange,
  ThreeWayDiff,
} from '../../../../../../common/api/detection_engine/prebuilt_rules';
import { ThreeWayDiffOutcome } from '../../../../../../common/api/detection_engine/prebuilt_rules';

interface RuleTypeDiffOutcome {
  diff_outcome?: ThreeWayDiffOutcome;
}

interface RuleFieldsDiffWithType {
  type?: ThreeWayDiff<DiffableRuleTypes>;
}

/**
 * Returns the current and target rule types when the upgrade force-sets the rule's `type`
 * to the target version's value, or `undefined` when the rule type stays the same.
 */
export function getRuleTypeChange(fieldsDiff: RuleFieldsDiffWithType): RuleTypeChange | undefined {
  const typeDiff = fieldsDiff.type;

  if (!typeDiff || !hasRuleTypeChanged(typeDiff)) {
    return undefined;
  }

  return {
    current: typeDiff.current_version,
    target: typeDiff.target_version,
  };
}

/**
 * Tells whether the rule's `type` diff outcome means the type changes on upgrade.
 * Only the three outcomes `determineIfValueCanUpdate` treats as a real update count.
 * `CustomizedValueSameUpdate` is deliberately excluded because current already equals
 * target for that outcome, so nothing changes on upgrade.
 */
export function hasRuleTypeChanged(typeDiff: RuleTypeDiffOutcome | undefined): boolean {
  const diffOutcome = typeDiff?.diff_outcome;

  return (
    diffOutcome === ThreeWayDiffOutcome.StockValueCanUpdate ||
    diffOutcome === ThreeWayDiffOutcome.CustomizedValueCanUpdate ||
    diffOutcome === ThreeWayDiffOutcome.MissingBaseCanUpdate
  );
}
