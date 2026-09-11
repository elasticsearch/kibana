/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getImportRulesSchemaMock } from '../../../../../../../../common/api/detection_engine/rule_management/mocks';
import { createPrebuiltRuleAssetsClient as createPrebuiltRuleAssetsClientMock } from '../../../../../prebuilt_rules/logic/rule_assets/__mocks__/prebuilt_rule_assets_client';
import { fetchPrebuiltImportContext } from './fetch_prebuilt_import_context';

describe('fetchPrebuiltImportContext', () => {
  let ruleAssetsClient: ReturnType<typeof createPrebuiltRuleAssetsClientMock>;

  const noAssets = () => {
    ruleAssetsClient.fetchLatestVersions.mockResolvedValue([]);
    ruleAssetsClient.fetchDeprecatedRules.mockResolvedValue([]);
    ruleAssetsClient.fetchAssetsByVersion.mockResolvedValue({ assets: [], errors: [] });
  };

  const importRule = (ruleId: string, version?: number) => ({
    ...getImportRulesSchemaMock(),
    rule_id: ruleId,
    ...(version === undefined ? {} : { version }),
  });

  const runFetch = (rules: ReturnType<typeof importRule>[]) =>
    fetchPrebuiltImportContext({
      rules,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ruleAssetsClient: ruleAssetsClient as any,
    });

  beforeEach(() => {
    ruleAssetsClient = createPrebuiltRuleAssetsClientMock();
    noAssets();
  });

  it('returns empty context when no prebuilt data is available', async () => {
    const result = await runFetch([importRule('rule-a')]);

    expect(result).toEqual({
      matchingAssetsByRuleId: {},
      availableRuleAssetIds: new Set(),
    });
  });

  it('unions latest + deprecated asset ids into availableRuleAssetIds', async () => {
    ruleAssetsClient.fetchLatestVersions.mockResolvedValue([
      { rule_id: 'rule-a', version: 1 },
      { rule_id: 'rule-b', version: 1 },
    ]);
    ruleAssetsClient.fetchDeprecatedRules.mockResolvedValue([{ rule_id: 'rule-c', version: 1 }]);

    const result = await runFetch([
      importRule('rule-a'),
      importRule('rule-b'),
      importRule('rule-c'),
    ]);

    expect(result.availableRuleAssetIds).toEqual(new Set(['rule-a', 'rule-b', 'rule-c']));
  });

  it('keys matching assets by rule_id', async () => {
    const asset = { ...importRule('rule-a', 3), immutable: true } as unknown as {
      rule_id: string;
    };
    ruleAssetsClient.fetchAssetsByVersion.mockResolvedValue({ assets: [asset], errors: [] });

    const result = await runFetch([importRule('rule-a', 3)]);

    expect(result.matchingAssetsByRuleId).toEqual({ 'rule-a': asset });
  });

  it('drops rules with no version from fetchAssetsByVersion input', async () => {
    await runFetch([importRule('rule-a', 3), importRule('rule-b')]);

    expect(ruleAssetsClient.fetchAssetsByVersion).toHaveBeenCalledWith([
      { rule_id: 'rule-a', version: 3 },
    ]);
  });
});
