/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getRootEsqlQuery, type RuleResponse } from '@kbn/alerting-v2-schemas';
import type { RuleExecutionSnapshot } from './rule_signals_written';

export const buildRuleExecutionSnapshot = (
  rule: RuleResponse,
  spaceId: string
): RuleExecutionSnapshot => ({
  ruleId: rule.id,
  spaceId,
  name: rule.metadata.name,
  kind: rule.kind,
  query: getRootEsqlQuery(rule.query),
  tags: rule.metadata.tags ?? [],
});
