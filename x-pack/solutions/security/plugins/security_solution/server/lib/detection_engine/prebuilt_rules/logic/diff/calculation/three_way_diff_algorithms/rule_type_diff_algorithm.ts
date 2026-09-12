/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { assertUnreachable } from '../../../../../../../../common/utility_types';
import type {
  DiffableRuleTypes,
  ThreeVersionsOf,
  ThreeWayDiff,
} from '../../../../../../../../common/api/detection_engine/prebuilt_rules';
import {
  determineDiffOutcome,
  determineIfValueCanUpdate,
  MissingVersion,
  ThreeWayDiffConflict,
  ThreeWayDiffOutcome,
  ThreeWayMergeOutcome,
} from '../../../../../../../../common/api/detection_engine/prebuilt_rules';

export const ruleTypeDiffAlgorithm = <TValue extends DiffableRuleTypes>(
  versions: ThreeVersionsOf<TValue>,
  isRuleCustomized: boolean
): ThreeWayDiff<TValue> => {
  const {
    base_version: baseVersion,
    current_version: currentVersion,
    target_version: targetVersion,
  } = versions;

  const diffOutcome = determineDiffOutcome(baseVersion, currentVersion, targetVersion);
  const valueCanUpdate = determineIfValueCanUpdate(diffOutcome);

  const hasBaseVersion = baseVersion !== MissingVersion;

  const { mergeOutcome, conflict, mergedVersion } = mergeVersions({
    targetVersion,
    diffOutcome,
    isRuleCustomized,
  });

  return {
    has_base_version: hasBaseVersion,
    base_version: hasBaseVersion ? baseVersion : undefined,
    current_version: currentVersion,
    target_version: targetVersion,
    merged_version: mergedVersion,
    merge_outcome: mergeOutcome,

    diff_outcome: diffOutcome,
    has_update: valueCanUpdate,
    conflict,
  };
};

interface MergeResult<TValue> {
  mergeOutcome: ThreeWayMergeOutcome;
  mergedVersion: TValue;
  conflict: ThreeWayDiffConflict;
}

interface MergeArgs<TValue> {
  targetVersion: TValue;
  diffOutcome: ThreeWayDiffOutcome;
  isRuleCustomized: boolean;
}

const mergeVersions = <TValue>({
  targetVersion,
  diffOutcome,
  isRuleCustomized,
}: MergeArgs<TValue>): MergeResult<TValue> => {
  switch (diffOutcome) {
    // Missing base versions always return target version
    // Scenario -AA is treated as AAA
    // https://github.com/elastic/kibana/issues/210358#issuecomment-2654492854
    case ThreeWayDiffOutcome.MissingBaseNoUpdate:
    case ThreeWayDiffOutcome.StockValueNoUpdate:
      return {
        conflict: ThreeWayDiffConflict.NONE,
        mergedVersion: targetVersion,
        mergeOutcome: ThreeWayMergeOutcome.Target,
      };
    // The installed rule's own type differs from its base version despite the target
    // version not introducing a (different) change. This scenario is currently
    // inaccessible via normal UI or API workflows, but the logic is covered just in
    // case - keep it a hard NON_SOLVABLE regardless of customization.
    case ThreeWayDiffOutcome.CustomizedValueNoUpdate:
    case ThreeWayDiffOutcome.CustomizedValueSameUpdate:
      return {
        mergedVersion: targetVersion,
        mergeOutcome: ThreeWayMergeOutcome.Target,
        conflict: ThreeWayDiffConflict.NON_SOLVABLE,
      };
    // The rule type actually changed in the target version. `type` can never be
    // customized directly by a user, so the rule-level `is_customized` flag is the
    // only real signal of whether the rule was modified at all - trust it here,
    // including when the base version is missing (scenario -AB). Unlike other diff
    // algorithms' -AB handling, a non-customized rule's type change is SOLVABLE, never
    // NONE: `type` must always surface as a conflict so downstream consumers (bulk
    // upgrade telemetry, the Phase 2 confirmation-modal count) have a durable signal
    // that a type change occurred. A customized rule's type change stays NON_SOLVABLE.
    // https://github.com/elastic/kibana/issues/210358#issuecomment-2654492854
    case ThreeWayDiffOutcome.StockValueCanUpdate:
    // NOTE: This scenario is currently inaccessible via normal UI or API workflows, but the logic is covered just in case
    case ThreeWayDiffOutcome.CustomizedValueCanUpdate:
    case ThreeWayDiffOutcome.MissingBaseCanUpdate: {
      return {
        mergedVersion: targetVersion,
        mergeOutcome: ThreeWayMergeOutcome.Target,
        conflict: isRuleCustomized
          ? ThreeWayDiffConflict.NON_SOLVABLE
          : ThreeWayDiffConflict.SOLVABLE,
      };
    }
    default:
      return assertUnreachable(diffOutcome);
  }
};
