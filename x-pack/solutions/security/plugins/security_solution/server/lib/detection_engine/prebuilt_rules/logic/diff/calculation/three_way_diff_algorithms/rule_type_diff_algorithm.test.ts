/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  DiffableRuleTypes,
  ThreeVersionsOf,
} from '../../../../../../../../common/api/detection_engine';
import {
  ThreeWayDiffOutcome,
  ThreeWayMergeOutcome,
  MissingVersion,
  ThreeWayDiffConflict,
} from '../../../../../../../../common/api/detection_engine';
import { ruleTypeDiffAlgorithm } from './rule_type_diff_algorithm';

describe('ruleTypeDiffAlgorithm', () => {
  describe.each([false, true])('when isRuleCustomized is %s', (isRuleCustomized) => {
    it('returns current_version as merged output if there is no update - scenario AAA', () => {
      const mockVersions: ThreeVersionsOf<DiffableRuleTypes> = {
        base_version: 'query',
        current_version: 'query',
        target_version: 'query',
      };

      const result = ruleTypeDiffAlgorithm(mockVersions, isRuleCustomized);

      expect(result).toEqual(
        expect.objectContaining({
          merged_version: mockVersions.target_version,
          diff_outcome: ThreeWayDiffOutcome.StockValueNoUpdate,
          merge_outcome: ThreeWayMergeOutcome.Target,
          conflict: ThreeWayDiffConflict.NONE,
        })
      );
    });

    it('returns target_version as merged output if current_version is different and there is no update - scenario ABA', () => {
      // User can change rule type field between `query` and `saved_query` in the UI, no other rule types
      const mockVersions: ThreeVersionsOf<DiffableRuleTypes> = {
        base_version: 'query',
        current_version: 'saved_query',
        target_version: 'query',
      };

      const result = ruleTypeDiffAlgorithm(mockVersions, isRuleCustomized);

      expect(result).toEqual(
        expect.objectContaining({
          merged_version: mockVersions.target_version,
          diff_outcome: ThreeWayDiffOutcome.CustomizedValueNoUpdate,
          merge_outcome: ThreeWayMergeOutcome.Target,
          conflict: ThreeWayDiffConflict.NON_SOLVABLE,
        })
      );
    });

    it('returns target_version as merged output if current version is different but it matches the update - scenario ABB', () => {
      // User can change rule type field between `query` and `saved_query` in the UI, no other rule types
      const mockVersions: ThreeVersionsOf<DiffableRuleTypes> = {
        base_version: 'query',
        current_version: 'saved_query',
        target_version: 'saved_query',
      };

      const result = ruleTypeDiffAlgorithm(mockVersions, isRuleCustomized);

      expect(result).toEqual(
        expect.objectContaining({
          merged_version: mockVersions.target_version,
          diff_outcome: ThreeWayDiffOutcome.CustomizedValueSameUpdate,
          merge_outcome: ThreeWayMergeOutcome.Target,
          conflict: ThreeWayDiffConflict.NON_SOLVABLE,
        })
      );
    });

    describe('if base_version is missing', () => {
      describe('if current_version and target_version are the same - scenario -AA', () => {
        it('returns NONE conflict', () => {
          const mockVersions: ThreeVersionsOf<DiffableRuleTypes> = {
            base_version: MissingVersion,
            current_version: 'query',
            target_version: 'query',
          };

          const result = ruleTypeDiffAlgorithm(mockVersions, isRuleCustomized);

          expect(result).toEqual(
            expect.objectContaining({
              has_base_version: false,
              base_version: undefined,
              merged_version: mockVersions.target_version,
              diff_outcome: ThreeWayDiffOutcome.MissingBaseNoUpdate,
              merge_outcome: ThreeWayMergeOutcome.Target,
              conflict: ThreeWayDiffConflict.NONE,
            })
          );
        });
      });
    });
  });

  describe('when the rule is not customized (isRuleCustomized: false)', () => {
    const isRuleCustomized = false;

    it('returns SOLVABLE conflict if current_version is the same and there is an update - scenario AAB', () => {
      // User can change rule type field between `query` and `saved_query` in the UI, no other rule types
      const mockVersions: ThreeVersionsOf<DiffableRuleTypes> = {
        base_version: 'query',
        current_version: 'query',
        target_version: 'saved_query',
      };

      const result = ruleTypeDiffAlgorithm(mockVersions, isRuleCustomized);

      expect(result).toEqual(
        expect.objectContaining({
          merged_version: mockVersions.target_version,
          diff_outcome: ThreeWayDiffOutcome.StockValueCanUpdate,
          merge_outcome: ThreeWayMergeOutcome.Target,
          conflict: ThreeWayDiffConflict.SOLVABLE,
        })
      );
    });

    it('returns SOLVABLE conflict if all three versions are different - scenario ABC', () => {
      // User can change rule type field between `query` and `saved_query` in the UI, no other rule types
      // NOTE: This test case scenario is currently inaccessible via normal UI or API workflows, but the logic is covered just in case
      const mockVersions: ThreeVersionsOf<DiffableRuleTypes> = {
        base_version: 'query',
        current_version: 'eql',
        target_version: 'saved_query',
      };

      const result = ruleTypeDiffAlgorithm(mockVersions, isRuleCustomized);

      expect(result).toEqual(
        expect.objectContaining({
          merged_version: mockVersions.target_version,
          diff_outcome: ThreeWayDiffOutcome.CustomizedValueCanUpdate,
          merge_outcome: ThreeWayMergeOutcome.Target,
          conflict: ThreeWayDiffConflict.SOLVABLE,
        })
      );
    });

    describe('if base_version is missing', () => {
      describe('returns target_version as merged output if current_version and target_version are different - scenario -AB', () => {
        it('returns SOLVABLE conflict', () => {
          // User can change rule type field between `query` and `saved_query` in the UI, no other rule types
          const mockVersions: ThreeVersionsOf<DiffableRuleTypes> = {
            base_version: MissingVersion,
            current_version: 'query',
            target_version: 'saved_query',
          };

          const result = ruleTypeDiffAlgorithm(mockVersions, isRuleCustomized);

          expect(result).toEqual(
            expect.objectContaining({
              has_base_version: false,
              base_version: undefined,
              merged_version: mockVersions.target_version,
              diff_outcome: ThreeWayDiffOutcome.MissingBaseCanUpdate,
              merge_outcome: ThreeWayMergeOutcome.Target,
              conflict: ThreeWayDiffConflict.SOLVABLE,
            })
          );
        });
      });
    });
  });

  describe('when the rule is customized (isRuleCustomized: true)', () => {
    const isRuleCustomized = true;

    it('returns NON_SOLVABLE conflict if current_version is the same and there is an update - scenario AAB', () => {
      // User can change rule type field between `query` and `saved_query` in the UI, no other rule types
      const mockVersions: ThreeVersionsOf<DiffableRuleTypes> = {
        base_version: 'query',
        current_version: 'query',
        target_version: 'saved_query',
      };

      const result = ruleTypeDiffAlgorithm(mockVersions, isRuleCustomized);

      expect(result).toEqual(
        expect.objectContaining({
          merged_version: mockVersions.target_version,
          diff_outcome: ThreeWayDiffOutcome.StockValueCanUpdate,
          merge_outcome: ThreeWayMergeOutcome.Target,
          conflict: ThreeWayDiffConflict.NON_SOLVABLE,
        })
      );
    });

    it('returns NON_SOLVABLE conflict if all three versions are different - scenario ABC', () => {
      // User can change rule type field between `query` and `saved_query` in the UI, no other rule types
      // NOTE: This test case scenario is currently inaccessible via normal UI or API workflows, but the logic is covered just in case
      const mockVersions: ThreeVersionsOf<DiffableRuleTypes> = {
        base_version: 'query',
        current_version: 'eql',
        target_version: 'saved_query',
      };

      const result = ruleTypeDiffAlgorithm(mockVersions, isRuleCustomized);

      expect(result).toEqual(
        expect.objectContaining({
          merged_version: mockVersions.target_version,
          diff_outcome: ThreeWayDiffOutcome.CustomizedValueCanUpdate,
          merge_outcome: ThreeWayMergeOutcome.Target,
          conflict: ThreeWayDiffConflict.NON_SOLVABLE,
        })
      );
    });

    describe('if base_version is missing', () => {
      describe('returns target_version as merged output if current_version and target_version are different - scenario -AB', () => {
        it('returns NON_SOLVABLE conflict', () => {
          // User can change rule type field between `query` and `saved_query` in the UI, no other rule types
          const mockVersions: ThreeVersionsOf<DiffableRuleTypes> = {
            base_version: MissingVersion,
            current_version: 'query',
            target_version: 'saved_query',
          };

          const result = ruleTypeDiffAlgorithm(mockVersions, isRuleCustomized);

          expect(result).toEqual(
            expect.objectContaining({
              has_base_version: false,
              base_version: undefined,
              merged_version: mockVersions.target_version,
              diff_outcome: ThreeWayDiffOutcome.MissingBaseCanUpdate,
              merge_outcome: ThreeWayMergeOutcome.Target,
              conflict: ThreeWayDiffConflict.NON_SOLVABLE,
            })
          );
        });
      });
    });
  });

  describe('the type field never reports NONE when the type actually changed', () => {
    const canUpdateScenarios: Array<{
      name: string;
      mockVersions: ThreeVersionsOf<DiffableRuleTypes>;
    }> = [
      {
        name: 'AAB',
        mockVersions: {
          base_version: 'query',
          current_version: 'query',
          target_version: 'saved_query',
        },
      },
      {
        name: 'ABC',
        mockVersions: {
          base_version: 'query',
          current_version: 'eql',
          target_version: 'saved_query',
        },
      },
      {
        name: '-AB',
        mockVersions: {
          base_version: MissingVersion,
          current_version: 'query',
          target_version: 'saved_query',
        },
      },
    ];

    it.each(canUpdateScenarios)(
      'never returns NONE for scenario $name, regardless of isRuleCustomized',
      ({ mockVersions }) => {
        const nonCustomizedResult = ruleTypeDiffAlgorithm(mockVersions, false);
        const customizedResult = ruleTypeDiffAlgorithm(mockVersions, true);

        expect(nonCustomizedResult.conflict).not.toEqual(ThreeWayDiffConflict.NONE);
        expect(customizedResult.conflict).not.toEqual(ThreeWayDiffConflict.NONE);
      }
    );
  });
});
