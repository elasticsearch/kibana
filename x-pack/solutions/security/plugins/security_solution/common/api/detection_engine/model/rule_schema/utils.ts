/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RuleResponse } from './rule_schemas.gen';

export function isCustomizedPrebuiltRule(rule: Pick<RuleResponse, 'rule_source'>): boolean {
  return rule.rule_source?.type === 'external' && rule.rule_source.is_customized;
}

export function isNonCustomizedPrebuiltRule(rule: RuleResponse): boolean {
  return rule.rule_source?.type === 'external' && rule.rule_source.is_customized === false;
}
