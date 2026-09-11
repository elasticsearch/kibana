/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RuleToImport } from '../../../../../../../../common/api/detection_engine';
import type { PrebuiltRuleAsset } from '../../../../../prebuilt_rules';
import type { IPrebuiltRuleAssetsClient } from '../../../../../prebuilt_rules/logic/rule_assets/prebuilt_rule_assets_client';

/**
 * Prebuilt-rule lookups the import path needs before it can classify rules
 * and calculate `rule_source`:
 *
 * - `matchingAssetsByRuleId`  — prebuilt asset for the imported `(rule_id, version)`
 * - `availableRuleAssetIds`   — set of `rule_id`s the current prebuilt package
 *                               (or its deprecated tail) recognises
 */
export interface PrebuiltImportContext {
  matchingAssetsByRuleId: Record<string, PrebuiltRuleAsset>;
  availableRuleAssetIds: Set<string>;
}

export const fetchPrebuiltImportContext = async ({
  rules,
  ruleAssetsClient,
}: {
  rules: RuleToImport[];
  ruleAssetsClient: IPrebuiltRuleAssetsClient;
}): Promise<PrebuiltImportContext> => {
  const ruleIds = rules.map((r) => r.rule_id);
  const ruleVersions = rules.flatMap((r) =>
    r.version == null ? [] : [{ rule_id: r.rule_id, version: r.version }]
  );

  const [latestAssets, deprecatedAssets, matchingAssets] = await Promise.all([
    ruleAssetsClient.fetchLatestVersions({ ruleIds }),
    ruleAssetsClient.fetchDeprecatedRules(ruleIds),
    ruleAssetsClient.fetchAssetsByVersion(ruleVersions).then((r) => r.assets),
  ]);

  const matchingAssetsByRuleId: Record<string, PrebuiltRuleAsset> = {};
  for (const asset of matchingAssets) {
    matchingAssetsByRuleId[asset.rule_id] = asset;
  }

  const availableRuleAssetIds = new Set<string>([
    ...latestAssets.map((s) => s.rule_id),
    ...deprecatedAssets.map((s) => s.rule_id),
  ]);

  return { matchingAssetsByRuleId, availableRuleAssetIds };
};
