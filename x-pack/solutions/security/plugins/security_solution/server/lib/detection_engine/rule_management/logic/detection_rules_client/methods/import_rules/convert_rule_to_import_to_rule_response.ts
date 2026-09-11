/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import { applyRuleDefaults } from '../../mergers/apply_rule_defaults';
import {
  RuleResponse,
  type RuleToImport,
} from '../../../../../../../../common/api/detection_engine';

export const convertRuleToImportToRuleResponse = (ruleToImport: RuleToImport): RuleResponse => {
  const ruleResponseSpecificFields = {
    id: uuidv4(),
    updated_at: new Date().toISOString(),
    updated_by: '',
    created_at: new Date().toISOString(),
    created_by: '',
    revision: 1,
  };
  const ruleWithDefaults = applyRuleDefaults(ruleToImport);

  return RuleResponse.parse({
    ...ruleResponseSpecificFields,
    ...ruleWithDefaults,
  });
};
