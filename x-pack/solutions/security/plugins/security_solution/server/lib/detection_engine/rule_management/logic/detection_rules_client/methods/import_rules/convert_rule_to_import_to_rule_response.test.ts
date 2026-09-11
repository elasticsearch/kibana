/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  getImportRulesSchemaMock,
  getValidatedRuleToImportMock,
} from '../../../../../../../../common/api/detection_engine/rule_management/mocks';
import { convertRuleToImportToRuleResponse } from './convert_rule_to_import_to_rule_response';

describe('convertRuleToImportToRuleResponse', () => {
  it('converts a valid RuleToImport (without a language field) to valid RuleResponse (with a language field)', () => {
    const ruleToImportWithoutLanguage = getImportRulesSchemaMock({ language: undefined });

    expect(convertRuleToImportToRuleResponse(ruleToImportWithoutLanguage)).toMatchObject({
      language: 'kuery',
      rule_id: ruleToImportWithoutLanguage.rule_id,
    });
  });

  it('converts a ValidatedRuleToImport and preserves its version', () => {
    const ruleToImport = getValidatedRuleToImportMock({ version: 99 });

    expect(convertRuleToImportToRuleResponse(ruleToImport)).toMatchObject({
      version: 99,
      language: 'kuery',
      rule_id: ruleToImport.rule_id,
    });
  });
});
