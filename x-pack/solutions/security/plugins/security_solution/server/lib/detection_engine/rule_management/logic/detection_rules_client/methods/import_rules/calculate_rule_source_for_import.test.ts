/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getRulesSchemaMock } from '../../../../../../../../common/api/detection_engine/model/rule_schema/rule_response_schema.mock';
import { getPrebuiltRuleMock } from '../../../../../prebuilt_rules/mocks';
import { calculateRuleSourceForImport } from './calculate_rule_source_for_import';

describe('calculateRuleSourceForImport', () => {
  it('calculates as internal if no asset is found', () => {
    const result = calculateRuleSourceForImport({
      importedRule: getRulesSchemaMock(),
      currentRule: undefined,
      prebuiltRuleAssetsByRuleId: {},
      isKnownPrebuiltRule: false,
    });

    expect(result).toEqual({
      ruleSource: {
        type: 'internal',
      },
      immutable: false,
    });
  });

  it('calculates as not modified external type if an asset is found without a matching version and no current rule present', () => {
    const rule = getRulesSchemaMock();
    rule.rule_id = 'rule_id';

    const result = calculateRuleSourceForImport({
      importedRule: rule,
      currentRule: undefined,
      prebuiltRuleAssetsByRuleId: {},
      isKnownPrebuiltRule: true,
    });

    expect(result).toEqual({
      ruleSource: {
        type: 'external',
        is_customized: false,
        customized_fields: [],
        has_base_version: false,
      },
      immutable: true,
    });
  });

  it('calculates as non modified external type if an asset is found without a matching version and current rule present without changes', () => {
    const rule = getRulesSchemaMock();
    rule.rule_id = 'rule_id';

    const result = calculateRuleSourceForImport({
      importedRule: rule,
      currentRule: rule,
      prebuiltRuleAssetsByRuleId: {},
      isKnownPrebuiltRule: true,
    });

    expect(result).toEqual({
      ruleSource: {
        type: 'external',
        is_customized: false,
        customized_fields: [],
        has_base_version: false,
      },
      immutable: true,
    });
  });

  it('calculates as modified external type if an asset is found without a matching version and current rule present with changes', () => {
    const rule = getRulesSchemaMock();
    rule.rule_id = 'rule_id';

    const result = calculateRuleSourceForImport({
      importedRule: rule,
      currentRule: {
        ...rule,
        name: 'new name',
      },
      prebuiltRuleAssetsByRuleId: {},
      isKnownPrebuiltRule: true,
    });

    expect(result).toEqual({
      ruleSource: {
        type: 'external',
        is_customized: true,
        customized_fields: [],
        has_base_version: false,
      },
      immutable: true,
    });
  });

  it('calculates as external with customizations if a matching asset/version is found', () => {
    const rule = getRulesSchemaMock();
    rule.rule_id = 'rule_id';
    const prebuiltRuleAssetsByRuleId = {
      rule_id: getPrebuiltRuleMock({
        rule_id: 'rule_id',
        tags: ['updated tag'],
        false_positives: ['new false positive'],
        references: ['https://new.reference.co'],
        index: ['new-index-pattern'],
      }),
    };

    const result = calculateRuleSourceForImport({
      importedRule: rule,
      currentRule: undefined,
      prebuiltRuleAssetsByRuleId,
      isKnownPrebuiltRule: true,
    });

    expect(result).toEqual({
      ruleSource: {
        type: 'external',
        is_customized: true,
        customized_fields: [
          {
            field_name: 'tags',
          },
          {
            field_name: 'false_positives',
          },
          {
            field_name: 'references',
          },
          {
            field_name: 'index',
          },
        ],
        has_base_version: true,
      },
      immutable: true,
    });
  });

  it('calculates as external without customizations if an exact match is found', () => {
    const rule = getRulesSchemaMock();
    rule.rule_id = 'rule_id';
    const prebuiltRuleAssetsByRuleId = { rule_id: getPrebuiltRuleMock(rule) };

    const result = calculateRuleSourceForImport({
      importedRule: rule,
      currentRule: undefined,
      prebuiltRuleAssetsByRuleId,
      isKnownPrebuiltRule: true,
    });

    expect(result).toEqual({
      ruleSource: {
        type: 'external',
        is_customized: false,
        customized_fields: [],
        has_base_version: true,
      },
      immutable: true,
    });
  });
});
