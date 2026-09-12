/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PerformRuleUpgradeRequestBody } from '../../../../../../common/api/detection_engine';
import { convertPrebuiltRuleAssetToRuleResponse } from '../../../rule_management/logic/detection_rules_client/converters/convert_prebuilt_rule_asset_to_rule_response';
import { getPrebuiltRuleMockOfType } from '../../mocks';
import type { RuleTriad } from '../../model/rule_groups/get_rule_groups';
import { createModifiedPrebuiltRuleAssets } from './create_upgradeable_rules_payload';

const RULE_ID = 'rule-1';

const buildRuleTriad = ({
  currentType,
  targetType,
  isCustomized = false,
}: {
  currentType: 'query' | 'saved_query';
  targetType: 'query' | 'saved_query';
  isCustomized?: boolean;
}): RuleTriad => {
  const base = {
    ...getPrebuiltRuleMockOfType(currentType),
    rule_id: RULE_ID,
    version: 1,
  };

  const currentAsset = {
    ...getPrebuiltRuleMockOfType(currentType),
    rule_id: RULE_ID,
    version: 1,
  };

  const target = {
    ...getPrebuiltRuleMockOfType(targetType),
    rule_id: RULE_ID,
    version: 2,
  };

  const current = convertPrebuiltRuleAssetToRuleResponse(currentAsset);

  if (isCustomized) {
    current.rule_source = {
      type: 'external',
      is_customized: true,
      customized_fields: [],
      has_base_version: true,
    };
  }

  return { base, current, target };
};

describe('createModifiedPrebuiltRuleAssets', () => {
  it('builds a valid MERGED payload for a non-customized type-changed rule in SPECIFIC_RULES mode', () => {
    const upgradeableRule = buildRuleTriad({
      currentType: 'query',
      targetType: 'saved_query',
      isCustomized: false,
    });

    const requestBody: PerformRuleUpgradeRequestBody = {
      mode: 'SPECIFIC_RULES',
      pick_version: 'MERGED',
      on_conflict: 'UPGRADE_SOLVABLE',
      rules: [{ rule_id: RULE_ID, revision: 1, version: 2 }],
    };

    const result = createModifiedPrebuiltRuleAssets({
      upgradeableRules: [upgradeableRule],
      requestBody,
      defaultPickVersion: 'MERGED',
    });

    expect(result.processingErrors).toEqual([]);
    expect(result.modifiedPrebuiltRuleAssets).toHaveLength(1);
    expect(result.modifiedPrebuiltRuleAssets[0].type).toEqual('saved_query');
  });

  it('builds a valid MERGED payload for a non-customized type-changed rule in ALL_RULES mode', () => {
    const upgradeableRule = buildRuleTriad({
      currentType: 'query',
      targetType: 'saved_query',
      isCustomized: false,
    });

    const requestBody: PerformRuleUpgradeRequestBody = {
      mode: 'ALL_RULES',
      pick_version: 'MERGED',
      on_conflict: 'UPGRADE_SOLVABLE',
    };

    const result = createModifiedPrebuiltRuleAssets({
      upgradeableRules: [upgradeableRule],
      requestBody,
      defaultPickVersion: 'MERGED',
    });

    expect(result.processingErrors).toEqual([]);
    expect(result.modifiedPrebuiltRuleAssets).toHaveLength(1);
    expect(result.modifiedPrebuiltRuleAssets[0].type).toEqual('saved_query');
  });

  it('still produces a processing error for a customized type-changed rule under MERGED, SPECIFIC_RULES', () => {
    const upgradeableRule = buildRuleTriad({
      currentType: 'query',
      targetType: 'saved_query',
      isCustomized: true,
    });

    const requestBody: PerformRuleUpgradeRequestBody = {
      mode: 'SPECIFIC_RULES',
      pick_version: 'MERGED',
      rules: [{ rule_id: RULE_ID, revision: 1, version: 2 }],
    };

    const result = createModifiedPrebuiltRuleAssets({
      upgradeableRules: [upgradeableRule],
      requestBody,
      defaultPickVersion: 'MERGED',
    });

    expect(result.processingErrors).toHaveLength(1);
    expect(result.modifiedPrebuiltRuleAssets).toHaveLength(0);
    expect(String(result.processingErrors[0].error)).toMatch(/pick_version/);
  });

  it('does not alter the ordinary path for a non-customized rule with no type change', () => {
    const upgradeableRule = buildRuleTriad({
      currentType: 'query',
      targetType: 'query',
      isCustomized: false,
    });

    const requestBody: PerformRuleUpgradeRequestBody = {
      mode: 'SPECIFIC_RULES',
      pick_version: 'MERGED',
      rules: [{ rule_id: RULE_ID, revision: 1, version: 2 }],
    };

    const result = createModifiedPrebuiltRuleAssets({
      upgradeableRules: [upgradeableRule],
      requestBody,
      defaultPickVersion: 'MERGED',
    });

    expect(result.processingErrors).toEqual([]);
    expect(result.modifiedPrebuiltRuleAssets[0].type).toEqual('query');
  });

  it.each(['BASE', 'CURRENT'] as const)(
    'produces a processing error for a non-customized type-changed rule under pick_version: %s',
    (pickVersion) => {
      const upgradeableRule = buildRuleTriad({
        currentType: 'query',
        targetType: 'saved_query',
        isCustomized: false,
      });

      const requestBody: PerformRuleUpgradeRequestBody = {
        mode: 'SPECIFIC_RULES',
        pick_version: pickVersion,
        rules: [{ rule_id: RULE_ID, revision: 1, version: 2 }],
      };

      const result = createModifiedPrebuiltRuleAssets({
        upgradeableRules: [upgradeableRule],
        requestBody,
        defaultPickVersion: 'MERGED',
      });

      expect(result.processingErrors).toHaveLength(1);
      expect(result.modifiedPrebuiltRuleAssets).toHaveLength(0);
      expect(String(result.processingErrors[0].error)).toMatch(/'TARGET' or 'MERGED'/);
    }
  );

  it('produces a processing error for a non-customized type-changed rule with a field-level pick_version of CURRENT', () => {
    const upgradeableRule = buildRuleTriad({
      currentType: 'query',
      targetType: 'saved_query',
      isCustomized: false,
    });

    const requestBody: PerformRuleUpgradeRequestBody = {
      mode: 'SPECIFIC_RULES',
      pick_version: 'MERGED',
      rules: [
        {
          rule_id: RULE_ID,
          revision: 1,
          version: 2,
          fields: { name: { pick_version: 'CURRENT' } },
        },
      ],
    };

    const result = createModifiedPrebuiltRuleAssets({
      upgradeableRules: [upgradeableRule],
      requestBody,
      defaultPickVersion: 'MERGED',
    });

    expect(result.processingErrors).toHaveLength(1);
    expect(result.modifiedPrebuiltRuleAssets).toHaveLength(0);
    expect(String(result.processingErrors[0].error)).toMatch(/'TARGET' or 'MERGED'/);
  });

  it('still upgrades a non-customized type-changed rule under pick_version: TARGET (the single-rule flyout shape)', () => {
    const upgradeableRule = buildRuleTriad({
      currentType: 'query',
      targetType: 'saved_query',
      isCustomized: false,
    });

    const requestBody: PerformRuleUpgradeRequestBody = {
      mode: 'SPECIFIC_RULES',
      pick_version: 'TARGET',
      rules: [{ rule_id: RULE_ID, revision: 1, version: 2 }],
    };

    const result = createModifiedPrebuiltRuleAssets({
      upgradeableRules: [upgradeableRule],
      requestBody,
      defaultPickVersion: 'MERGED',
    });

    expect(result.processingErrors).toEqual([]);
    expect(result.modifiedPrebuiltRuleAssets[0].type).toEqual('saved_query');
  });
});
