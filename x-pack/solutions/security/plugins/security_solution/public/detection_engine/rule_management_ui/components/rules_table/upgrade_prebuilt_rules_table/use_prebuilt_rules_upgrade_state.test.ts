/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { FieldUpgradeStateEnum } from '../../../../rule_management/model/prebuilt_rule_upgrade';
import { useAppToasts } from '../../../../../common/hooks/use_app_toasts';
import {
  type RuleResponse,
  type RuleUpgradeInfoForReview,
  type ThreeWayDiff,
  ThreeWayDiffConflict,
  ThreeWayDiffOutcome,
  ThreeWayMergeOutcome,
} from '../../../../../../common/api/detection_engine';
import { act, renderHook } from '@testing-library/react';
import { usePrebuiltRulesUpgradeState } from './use_prebuilt_rules_upgrade_state';
import { TestProviders } from '../../../../../common/mock';

jest.mock('../../../../../common/hooks/use_app_toasts', () => ({
  useAppToasts: jest.fn().mockReturnValue({
    addWarning: jest.fn(),
  }),
}));

describe('usePrebuiltRulesUpgradeState', () => {
  it('returns rule upgrade state', () => {
    const ruleUpgradeInfosMock: RuleUpgradeInfoForReview[] = [createRuleUpgradeInfoMock()];

    const {
      result: {
        current: { rulesUpgradeState },
      },
    } = renderHook(usePrebuiltRulesUpgradeState, {
      initialProps: ruleUpgradeInfosMock,
      wrapper: TestProviders,
    });

    expect(rulesUpgradeState).toEqual({
      'test-rule-id-1': expect.any(Object),
    });
  });

  describe('fields upgrade state', () => {
    it('returns empty state when there are no fields to upgrade', () => {
      const ruleUpgradeInfosMock: RuleUpgradeInfoForReview[] = [createRuleUpgradeInfoMock()];

      const { result } = renderHook(usePrebuiltRulesUpgradeState, {
        initialProps: ruleUpgradeInfosMock,
        wrapper: TestProviders,
      });

      expect(result.current.rulesUpgradeState).toEqual({
        'test-rule-id-1': expect.objectContaining({
          fieldsUpgradeState: {},
        }),
      });
    });

    it('returns NO CONFLICT fields', () => {
      const ruleUpgradeInfosMock: RuleUpgradeInfoForReview[] = [
        createRuleUpgradeInfoMock({
          diff: {
            num_fields_with_updates: 1,
            num_fields_with_conflicts: 0,
            num_fields_with_non_solvable_conflicts: 0,
            fields: {
              name: {
                base_version: 'base',
                current_version: 'base',
                target_version: 'target',
                merged_version: 'target',
                diff_outcome: ThreeWayDiffOutcome.StockValueCanUpdate,
                merge_outcome: ThreeWayMergeOutcome.Target,
                has_base_version: true,
                has_update: true,
                conflict: ThreeWayDiffConflict.NONE,
              },
            },
          },
        }),
      ];

      const { result } = renderHook(usePrebuiltRulesUpgradeState, {
        initialProps: ruleUpgradeInfosMock,
        wrapper: TestProviders,
      });

      expect(result.current.rulesUpgradeState).toEqual({
        'test-rule-id-1': expect.objectContaining({
          fieldsUpgradeState: {
            name: { state: FieldUpgradeStateEnum.NoConflict },
          },
        }),
      });
    });

    it('returns SOLVABLE CONFLICT fields', () => {
      const ruleUpgradeInfosMock: RuleUpgradeInfoForReview[] = [
        createRuleUpgradeInfoMock({
          diff: {
            num_fields_with_updates: 1,
            num_fields_with_conflicts: 1,
            num_fields_with_non_solvable_conflicts: 0,
            fields: {
              name: {
                base_version: 'base',
                current_version: 'current',
                target_version: 'target',
                merged_version: 'target',
                diff_outcome: ThreeWayDiffOutcome.StockValueCanUpdate,
                merge_outcome: ThreeWayMergeOutcome.Merged,
                has_base_version: true,
                has_update: true,
                conflict: ThreeWayDiffConflict.SOLVABLE,
              },
            },
          },
        }),
      ];

      const { result } = renderHook(usePrebuiltRulesUpgradeState, {
        initialProps: ruleUpgradeInfosMock,
        wrapper: TestProviders,
      });

      expect(result.current.rulesUpgradeState).toEqual({
        'test-rule-id-1': expect.objectContaining({
          fieldsUpgradeState: {
            name: { state: FieldUpgradeStateEnum.SolvableConflict },
          },
        }),
      });
    });

    it('returns NON SOLVABLE CONFLICT fields', () => {
      const ruleUpgradeInfosMock: RuleUpgradeInfoForReview[] = [
        createRuleUpgradeInfoMock({
          diff: {
            num_fields_with_updates: 1,
            num_fields_with_conflicts: 1,
            num_fields_with_non_solvable_conflicts: 1,
            fields: {
              name: {
                base_version: 'base',
                current_version: 'current',
                target_version: 'target',
                merged_version: 'target',
                diff_outcome: ThreeWayDiffOutcome.StockValueCanUpdate,
                merge_outcome: ThreeWayMergeOutcome.Merged,
                has_base_version: true,
                has_update: true,
                conflict: ThreeWayDiffConflict.NON_SOLVABLE,
              },
            },
          },
        }),
      ];

      const { result } = renderHook(usePrebuiltRulesUpgradeState, {
        initialProps: ruleUpgradeInfosMock,
        wrapper: TestProviders,
      });

      expect(result.current.rulesUpgradeState).toEqual({
        'test-rule-id-1': expect.objectContaining({
          fieldsUpgradeState: {
            name: { state: FieldUpgradeStateEnum.NonSolvableConflict },
          },
        }),
      });
    });

    it('returns ACCEPTED fields after resolving a conflict', () => {
      const ruleUpgradeInfosMock: RuleUpgradeInfoForReview[] = [
        createRuleUpgradeInfoMock({
          rule_id: 'test-rule-id-1',
          diff: {
            num_fields_with_updates: 1,
            num_fields_with_conflicts: 1,
            num_fields_with_non_solvable_conflicts: 1,
            fields: {
              name: {
                base_version: 'base',
                current_version: 'current',
                target_version: 'target',
                merged_version: 'target',
                diff_outcome: ThreeWayDiffOutcome.StockValueCanUpdate,
                merge_outcome: ThreeWayMergeOutcome.Merged,
                has_base_version: true,
                has_update: true,
                conflict: ThreeWayDiffConflict.NON_SOLVABLE,
              },
            },
          },
        }),
      ];

      const { result } = renderHook(usePrebuiltRulesUpgradeState, {
        initialProps: ruleUpgradeInfosMock,
        wrapper: TestProviders,
      });

      act(() => {
        result.current.setRuleFieldResolvedValue({
          ruleId: 'test-rule-id-1',
          fieldName: 'name',
          resolvedValue: 'resolved',
        });
      });

      expect(result.current.rulesUpgradeState).toEqual({
        'test-rule-id-1': expect.objectContaining({
          fieldsUpgradeState: {
            name: { state: FieldUpgradeStateEnum.Accepted, resolvedValue: 'resolved' },
          },
        }),
      });
    });
  });

  describe('rule type change conflict gating', () => {
    const typeFieldDiff = (conflict: ThreeWayDiffConflict): ThreeWayDiff<'saved_query'> => ({
      base_version: 'saved_query',
      current_version: 'saved_query',
      target_version: 'saved_query',
      merged_version: 'saved_query',
      diff_outcome: ThreeWayDiffOutcome.StockValueCanUpdate,
      merge_outcome: ThreeWayMergeOutcome.Target,
      has_base_version: true,
      has_update: true,
      conflict,
    });

    it('reports hasUnresolvedConflicts: true and hasNonSolvableUnresolvedConflicts: false when type has a SOLVABLE conflict and no other field conflicts', () => {
      const ruleUpgradeInfosMock: RuleUpgradeInfoForReview[] = [
        createRuleUpgradeInfoMock({
          diff: {
            num_fields_with_updates: 1,
            num_fields_with_conflicts: 0,
            num_fields_with_non_solvable_conflicts: 0,
            fields: {
              type: typeFieldDiff(ThreeWayDiffConflict.SOLVABLE),
            },
          },
        }),
      ];

      const { result } = renderHook(usePrebuiltRulesUpgradeState, {
        initialProps: ruleUpgradeInfosMock,
        wrapper: TestProviders,
      });

      expect(result.current.rulesUpgradeState).toEqual({
        'test-rule-id-1': expect.objectContaining({
          hasUnresolvedConflicts: true,
          hasNonSolvableUnresolvedConflicts: false,
          fieldsUpgradeState: {},
        }),
      });
    });

    it('reports hasUnresolvedConflicts: true and hasNonSolvableUnresolvedConflicts: true when type has a NON_SOLVABLE conflict and no other field conflicts', () => {
      const ruleUpgradeInfosMock: RuleUpgradeInfoForReview[] = [
        createRuleUpgradeInfoMock({
          diff: {
            num_fields_with_updates: 1,
            num_fields_with_conflicts: 1,
            num_fields_with_non_solvable_conflicts: 1,
            fields: {
              type: typeFieldDiff(ThreeWayDiffConflict.NON_SOLVABLE),
            },
          },
        }),
      ];

      const { result } = renderHook(usePrebuiltRulesUpgradeState, {
        initialProps: ruleUpgradeInfosMock,
        wrapper: TestProviders,
      });

      expect(result.current.rulesUpgradeState).toEqual({
        'test-rule-id-1': expect.objectContaining({
          hasUnresolvedConflicts: true,
          hasNonSolvableUnresolvedConflicts: true,
        }),
      });
    });

    it('reports both flags false when type has a NONE conflict and no other field conflicts', () => {
      const ruleUpgradeInfosMock: RuleUpgradeInfoForReview[] = [
        createRuleUpgradeInfoMock({
          diff: {
            num_fields_with_updates: 0,
            num_fields_with_conflicts: 0,
            num_fields_with_non_solvable_conflicts: 0,
            fields: {
              type: typeFieldDiff(ThreeWayDiffConflict.NONE),
            },
          },
        }),
      ];

      const { result } = renderHook(usePrebuiltRulesUpgradeState, {
        initialProps: ruleUpgradeInfosMock,
        wrapper: TestProviders,
      });

      expect(result.current.rulesUpgradeState).toEqual({
        'test-rule-id-1': expect.objectContaining({
          hasUnresolvedConflicts: false,
          hasNonSolvableUnresolvedConflicts: false,
        }),
      });
    });

    it('reports both flags false when there is no type key in diff.fields', () => {
      const ruleUpgradeInfosMock: RuleUpgradeInfoForReview[] = [
        createRuleUpgradeInfoMock({
          diff: {
            num_fields_with_updates: 0,
            num_fields_with_conflicts: 0,
            num_fields_with_non_solvable_conflicts: 0,
            fields: {},
          },
        }),
      ];

      const { result } = renderHook(usePrebuiltRulesUpgradeState, {
        initialProps: ruleUpgradeInfosMock,
        wrapper: TestProviders,
      });

      expect(result.current.rulesUpgradeState).toEqual({
        'test-rule-id-1': expect.objectContaining({
          hasUnresolvedConflicts: false,
          hasNonSolvableUnresolvedConflicts: false,
        }),
      });
    });

    it('reports hasNonSolvableUnresolvedConflicts: true when type has a SOLVABLE conflict but another field has a NON_SOLVABLE conflict', () => {
      const ruleUpgradeInfosMock: RuleUpgradeInfoForReview[] = [
        createRuleUpgradeInfoMock({
          diff: {
            num_fields_with_updates: 2,
            num_fields_with_conflicts: 1,
            num_fields_with_non_solvable_conflicts: 1,
            fields: {
              type: typeFieldDiff(ThreeWayDiffConflict.SOLVABLE),
              name: {
                base_version: 'base',
                current_version: 'current',
                target_version: 'target',
                merged_version: 'target',
                diff_outcome: ThreeWayDiffOutcome.StockValueCanUpdate,
                merge_outcome: ThreeWayMergeOutcome.Merged,
                has_base_version: true,
                has_update: true,
                conflict: ThreeWayDiffConflict.NON_SOLVABLE,
              },
            },
          },
        }),
      ];

      const { result } = renderHook(usePrebuiltRulesUpgradeState, {
        initialProps: ruleUpgradeInfosMock,
        wrapper: TestProviders,
      });

      expect(result.current.rulesUpgradeState).toEqual({
        'test-rule-id-1': expect.objectContaining({
          hasUnresolvedConflicts: true,
          hasNonSolvableUnresolvedConflicts: true,
        }),
      });
    });
  });

  // Test handling revision and version changes
  // - user edited a rule (revision change)
  // - a new prebuilt rules package got released (version change)
  describe('concurrency control', () => {
    describe('revision change', () => {
      const createMock = ({ revision }: { revision: number }) => [
        createRuleUpgradeInfoMock({
          rule_id: 'test-rule-id-1',
          revision,
          current_rule: createRuleResponseMock({
            name: 'current',
            revision,
          }),
          diff: {
            num_fields_with_updates: 1,
            num_fields_with_conflicts: 1,
            num_fields_with_non_solvable_conflicts: 1,
            fields: {
              name: {
                base_version: 'base',
                current_version: 'current',
                target_version: 'target',
                merged_version: 'target',
                diff_outcome: ThreeWayDiffOutcome.StockValueCanUpdate,
                merge_outcome: ThreeWayMergeOutcome.Merged,
                has_base_version: true,
                has_update: true,
                conflict: ThreeWayDiffConflict.NON_SOLVABLE,
              },
            },
          },
        }),
      ];

      it('invalidates resolved conflicts', () => {
        const { result, rerender } = renderHook(usePrebuiltRulesUpgradeState, {
          initialProps: createMock({ revision: 1 }),
          wrapper: TestProviders,
        });

        act(() => {
          result.current.setRuleFieldResolvedValue({
            ruleId: 'test-rule-id-1',
            fieldName: 'name',
            resolvedValue: 'resolved',
          });
        });

        expect(result.current.rulesUpgradeState).toEqual({
          'test-rule-id-1': expect.objectContaining({
            fieldsUpgradeState: {
              name: { state: FieldUpgradeStateEnum.Accepted, resolvedValue: 'resolved' },
            },
          }),
        });

        rerender(createMock({ revision: 2 }));

        expect(result.current.rulesUpgradeState).toEqual({
          'test-rule-id-1': expect.objectContaining({
            fieldsUpgradeState: {
              name: { state: FieldUpgradeStateEnum.NonSolvableConflict },
            },
          }),
        });
      });

      it('shows a notification', () => {
        const addWarningMock = jest.fn();
        (useAppToasts as jest.Mock).mockImplementation(() => ({
          addWarning: addWarningMock,
        }));

        const { result, rerender } = renderHook(usePrebuiltRulesUpgradeState, {
          initialProps: createMock({ revision: 1 }),
          wrapper: TestProviders,
        });

        act(() => {
          result.current.setRuleFieldResolvedValue({
            ruleId: 'test-rule-id-1',
            fieldName: 'name',
            resolvedValue: 'resolved',
          });
        });

        rerender(createMock({ revision: 2 }));

        expect(addWarningMock).toHaveBeenCalled();
      });
    });

    describe('version change', () => {
      const createMock = ({ version }: { version: number }) => [
        createRuleUpgradeInfoMock({
          rule_id: 'test-rule-id-1',
          revision: 1,
          target_rule: createRuleResponseMock({
            name: 'target',
            version,
          }),
          diff: {
            num_fields_with_updates: 1,
            num_fields_with_conflicts: 1,
            num_fields_with_non_solvable_conflicts: 1,
            fields: {
              name: {
                base_version: 'base',
                current_version: 'current',
                target_version: 'target',
                merged_version: 'target',
                diff_outcome: ThreeWayDiffOutcome.StockValueCanUpdate,
                merge_outcome: ThreeWayMergeOutcome.Merged,
                has_base_version: true,
                has_update: true,
                conflict: ThreeWayDiffConflict.NON_SOLVABLE,
              },
            },
          },
        }),
      ];

      it('invalidates resolved conflicts upon version change', () => {
        const addWarningMock = jest.fn();
        (useAppToasts as jest.Mock).mockImplementation(() => ({
          addWarning: addWarningMock,
        }));

        const { result, rerender } = renderHook(usePrebuiltRulesUpgradeState, {
          initialProps: createMock({ version: 1 }),
          wrapper: TestProviders,
        });

        act(() => {
          result.current.setRuleFieldResolvedValue({
            ruleId: 'test-rule-id-1',
            fieldName: 'name',
            resolvedValue: 'resolved',
          });
        });

        expect(result.current.rulesUpgradeState).toEqual({
          'test-rule-id-1': expect.objectContaining({
            fieldsUpgradeState: {
              name: { state: FieldUpgradeStateEnum.Accepted, resolvedValue: 'resolved' },
            },
          }),
        });

        rerender(createMock({ version: 2 }));

        expect(result.current.rulesUpgradeState).toEqual({
          'test-rule-id-1': expect.objectContaining({
            fieldsUpgradeState: {
              name: { state: FieldUpgradeStateEnum.NonSolvableConflict },
            },
          }),
        });
      });

      it('shows a notification', () => {
        const addWarningMock = jest.fn();
        (useAppToasts as jest.Mock).mockImplementation(() => ({
          addWarning: addWarningMock,
        }));

        const { result, rerender } = renderHook(usePrebuiltRulesUpgradeState, {
          initialProps: createMock({ version: 1 }),
          wrapper: TestProviders,
        });

        act(() => {
          result.current.setRuleFieldResolvedValue({
            ruleId: 'test-rule-id-1',
            fieldName: 'name',
            resolvedValue: 'resolved',
          });
        });

        expect(result.current.rulesUpgradeState).toEqual({
          'test-rule-id-1': expect.objectContaining({
            fieldsUpgradeState: {
              name: { state: FieldUpgradeStateEnum.Accepted, resolvedValue: 'resolved' },
            },
          }),
        });

        rerender(createMock({ version: 2 }));

        expect(addWarningMock).toHaveBeenCalled();
      });
    });
  });
});

function createRuleUpgradeInfoMock(
  rewrites?: Partial<RuleUpgradeInfoForReview>
): RuleUpgradeInfoForReview {
  return {
    id: 'test-id-1',
    rule_id: 'test-rule-id-1',
    current_rule: createRuleResponseMock(),
    target_rule: createRuleResponseMock(),
    diff: {
      num_fields_with_updates: 0,
      num_fields_with_conflicts: 0,
      num_fields_with_non_solvable_conflicts: 0,
      fields: {},
    },
    has_base_version: true,
    version: 1,
    revision: 1,
    ...rewrites,
  };
}

function createRuleResponseMock(rewrites?: Partial<RuleResponse>): RuleResponse {
  return {
    version: 1,
    revision: 1,
    ...rewrites,
  } as RuleResponse;
}
