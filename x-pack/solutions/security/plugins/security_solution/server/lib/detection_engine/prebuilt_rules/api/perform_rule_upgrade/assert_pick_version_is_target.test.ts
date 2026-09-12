/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  assertPickVersionIsTarget,
  assertPickVersionIsTargetOrMerged,
} from './assert_pick_version_is_target';
import type {
  PerformRuleUpgradeRequestBody,
  PickVersionValues,
} from '../../../../../../common/api/detection_engine';

describe('assertPickVersionIsTarget', () => {
  const ruleId = 'test-rule-id';
  const createExpectedError = (id: string) =>
    `Rule update for rule ${id} has a rule type change. All 'pick_version' values for rule must match 'TARGET'`;

  describe('valid cases - ', () => {
    it('should not throw when pick_version is TARGET for ALL_RULES mode', () => {
      const requestBody: PerformRuleUpgradeRequestBody = {
        mode: 'ALL_RULES',
        pick_version: 'TARGET',
      };

      expect(() => assertPickVersionIsTarget({ requestBody, ruleId })).not.toThrow();
    });

    it('should not throw when pick_version is TARGET for SPECIFIC_RULES mode', () => {
      const requestBody: PerformRuleUpgradeRequestBody = {
        mode: 'SPECIFIC_RULES',
        rules: [
          {
            rule_id: ruleId,
            revision: 1,
            version: 1,
            pick_version: 'TARGET',
          },
        ],
      };

      expect(() => assertPickVersionIsTarget({ requestBody, ruleId })).not.toThrow();
    });

    it('should not throw when all pick_version values are TARGET', () => {
      const requestBody: PerformRuleUpgradeRequestBody = {
        mode: 'SPECIFIC_RULES',
        pick_version: 'TARGET',
        rules: [
          {
            rule_id: ruleId,
            revision: 1,
            version: 1,
            pick_version: 'TARGET',
            fields: {
              name: { pick_version: 'TARGET' },
              description: { pick_version: 'TARGET' },
            },
          },
        ],
      };

      expect(() => assertPickVersionIsTarget({ requestBody, ruleId })).not.toThrow();
    });
  });

  describe('invalid cases - ', () => {
    it('should throw when pick_version is not TARGET for ALL_RULES mode', () => {
      const pickVersions: PickVersionValues[] = ['BASE', 'CURRENT', 'MERGED'];

      pickVersions.forEach((pickVersion) => {
        const requestBody: PerformRuleUpgradeRequestBody = {
          mode: 'ALL_RULES',
          pick_version: pickVersion,
        };

        expect(() => assertPickVersionIsTarget({ requestBody, ruleId })).toThrow(
          createExpectedError(ruleId)
        );
      });
    });

    it('should throw when pick_version is not TARGET for SPECIFIC_RULES mode', () => {
      const requestBody: PerformRuleUpgradeRequestBody = {
        mode: 'SPECIFIC_RULES',
        rules: [
          {
            rule_id: ruleId,
            revision: 1,
            version: 1,
            pick_version: 'BASE',
          },
        ],
      };

      expect(() => assertPickVersionIsTarget({ requestBody, ruleId })).toThrow(
        createExpectedError(ruleId)
      );
    });

    it('should throw when any field-specific pick_version is not TARGET', () => {
      const requestBody: PerformRuleUpgradeRequestBody = {
        mode: 'SPECIFIC_RULES',
        rules: [
          {
            rule_id: ruleId,
            revision: 1,
            version: 1,
            pick_version: 'TARGET',
            fields: {
              name: { pick_version: 'BASE' },
            },
          },
        ],
      };

      expect(() => assertPickVersionIsTarget({ requestBody, ruleId })).toThrow(
        createExpectedError(ruleId)
      );
    });

    it('should throw when pick_version is missing (defaults to MERGED)', () => {
      const requestBody: PerformRuleUpgradeRequestBody = {
        mode: 'SPECIFIC_RULES',
        rules: [{ rule_id: ruleId, revision: 1, version: 1 }],
      };

      expect(() => assertPickVersionIsTarget({ requestBody, ruleId })).toThrow();
    });
  });
});

describe('assertPickVersionIsTargetOrMerged', () => {
  const ruleId = 'test-rule-id';
  const createExpectedError = (id: string) =>
    `Rule update for rule ${id} has a rule type change. All 'pick_version' values for rule must match 'TARGET' or 'MERGED'`;

  describe('valid cases - ', () => {
    it.each(['TARGET', 'MERGED'] as PickVersionValues[])(
      'should not throw when pick_version is %s for ALL_RULES mode',
      (pickVersion) => {
        const requestBody: PerformRuleUpgradeRequestBody = {
          mode: 'ALL_RULES',
          pick_version: pickVersion,
        };

        expect(() => assertPickVersionIsTargetOrMerged({ requestBody, ruleId })).not.toThrow();
      }
    );

    it('should not throw when pick_version is missing (defaults to MERGED)', () => {
      const requestBody: PerformRuleUpgradeRequestBody = {
        mode: 'SPECIFIC_RULES',
        rules: [{ rule_id: ruleId, revision: 1, version: 1 }],
      };

      expect(() => assertPickVersionIsTargetOrMerged({ requestBody, ruleId })).not.toThrow();
    });

    it('should not throw when rule-level and field-level pick_version values are TARGET or MERGED', () => {
      const requestBody: PerformRuleUpgradeRequestBody = {
        mode: 'SPECIFIC_RULES',
        pick_version: 'MERGED',
        rules: [
          {
            rule_id: ruleId,
            revision: 1,
            version: 1,
            pick_version: 'TARGET',
            fields: {
              name: { pick_version: 'MERGED' },
              description: { pick_version: 'TARGET' },
            },
          },
        ],
      };

      expect(() => assertPickVersionIsTargetOrMerged({ requestBody, ruleId })).not.toThrow();
    });
  });

  describe('invalid cases - ', () => {
    it.each(['BASE', 'CURRENT'] as PickVersionValues[])(
      'should throw when pick_version is %s for ALL_RULES mode',
      (pickVersion) => {
        const requestBody: PerformRuleUpgradeRequestBody = {
          mode: 'ALL_RULES',
          pick_version: pickVersion,
        };

        expect(() => assertPickVersionIsTargetOrMerged({ requestBody, ruleId })).toThrow(
          createExpectedError(ruleId)
        );
      }
    );

    it('should throw when rule-level pick_version is CURRENT', () => {
      const requestBody: PerformRuleUpgradeRequestBody = {
        mode: 'SPECIFIC_RULES',
        rules: [
          {
            rule_id: ruleId,
            revision: 1,
            version: 1,
            pick_version: 'CURRENT',
          },
        ],
      };

      expect(() => assertPickVersionIsTargetOrMerged({ requestBody, ruleId })).toThrow(
        createExpectedError(ruleId)
      );
    });

    it('should throw when any field-specific pick_version is BASE', () => {
      const requestBody: PerformRuleUpgradeRequestBody = {
        mode: 'SPECIFIC_RULES',
        rules: [
          {
            rule_id: ruleId,
            revision: 1,
            version: 1,
            pick_version: 'MERGED',
            fields: {
              name: { pick_version: 'BASE' },
            },
          },
        ],
      };

      expect(() => assertPickVersionIsTargetOrMerged({ requestBody, ruleId })).toThrow(
        createExpectedError(ruleId)
      );
    });

    it('should throw when a field-specific pick_version is RESOLVED', () => {
      const requestBody: PerformRuleUpgradeRequestBody = {
        mode: 'SPECIFIC_RULES',
        rules: [
          {
            rule_id: ruleId,
            revision: 1,
            version: 1,
            pick_version: 'MERGED',
            fields: {
              name: { pick_version: 'RESOLVED', resolved_value: 'Resolved name' },
            },
          },
        ],
      };

      expect(() => assertPickVersionIsTargetOrMerged({ requestBody, ruleId })).toThrow(
        createExpectedError(ruleId)
      );
    });
  });
});
