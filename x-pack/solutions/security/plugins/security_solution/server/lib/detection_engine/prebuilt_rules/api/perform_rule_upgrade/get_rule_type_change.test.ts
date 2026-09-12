/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  DiffableRuleTypes,
  ThreeWayDiff,
} from '../../../../../../common/api/detection_engine/prebuilt_rules';
import {
  ThreeWayDiffConflict,
  ThreeWayDiffOutcome,
  ThreeWayMergeOutcome,
} from '../../../../../../common/api/detection_engine/prebuilt_rules';
import { getRuleTypeChange, hasRuleTypeChanged } from './get_rule_type_change';

describe('hasRuleTypeChanged', () => {
  test.each([
    [ThreeWayDiffOutcome.StockValueCanUpdate, true],
    [ThreeWayDiffOutcome.CustomizedValueCanUpdate, true],
    [ThreeWayDiffOutcome.MissingBaseCanUpdate, true],
    [ThreeWayDiffOutcome.CustomizedValueSameUpdate, false],
    [ThreeWayDiffOutcome.StockValueNoUpdate, false],
    [ThreeWayDiffOutcome.CustomizedValueNoUpdate, false],
    [ThreeWayDiffOutcome.MissingBaseNoUpdate, false],
  ])('reports %s as %s', (diffOutcome, expected) => {
    expect(hasRuleTypeChanged({ diff_outcome: diffOutcome })).toBe(expected);
  });

  test('reports false for a missing type diff', () => {
    expect(hasRuleTypeChanged(undefined)).toBe(false);
  });
});

describe('getRuleTypeChange', () => {
  test('returns current and target rule types when the type changes', () => {
    const typeDiff: ThreeWayDiff<DiffableRuleTypes> = {
      base_version: 'query',
      current_version: 'query',
      target_version: 'esql',
      merged_version: 'esql',
      diff_outcome: ThreeWayDiffOutcome.StockValueCanUpdate,
      merge_outcome: ThreeWayMergeOutcome.Target,
      has_base_version: true,
      has_update: true,
      conflict: ThreeWayDiffConflict.SOLVABLE,
    };

    expect(getRuleTypeChange({ type: typeDiff })).toEqual({ current: 'query', target: 'esql' });
  });

  test('returns undefined when the type stays the same', () => {
    const typeDiff: ThreeWayDiff<DiffableRuleTypes> = {
      base_version: 'query',
      current_version: 'query',
      target_version: 'query',
      merged_version: 'query',
      diff_outcome: ThreeWayDiffOutcome.StockValueNoUpdate,
      merge_outcome: ThreeWayMergeOutcome.Current,
      has_base_version: true,
      has_update: false,
      conflict: ThreeWayDiffConflict.NONE,
    };

    expect(getRuleTypeChange({ type: typeDiff })).toBeUndefined();
  });

  test('returns undefined when the type diff is absent', () => {
    expect(getRuleTypeChange({})).toBeUndefined();
  });
});
