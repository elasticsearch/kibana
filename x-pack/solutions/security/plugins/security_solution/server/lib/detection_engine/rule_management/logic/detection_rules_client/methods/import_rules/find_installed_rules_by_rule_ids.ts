/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { escapeQuotes } from '@kbn/es-query';
import type { RulesClient } from '@kbn/alerting-plugin/server';
import type { RuleResponse } from '../../../../../../../../common/api/detection_engine';
import { internalRuleToAPIResponse } from '../../converters/internal_rule_to_api_response';
import { findRules } from '../../../search/find_rules';

/**
 * Look up installed rules by `rule_id`, returned as a map keyed by `rule_id`.
 *
 * Callers must cap `ruleIds.length` at `RULE_IMPORT_BULK_CREATE_BATCH_SIZE`
 * so the KQL OR-list stays under ES's 1024 `max_clause_count` floor.
 *
 * @param rulesClient - Alerting rules client used for the underlying `findRules` call.
 * @param ruleIds - `rule_id`s to look up. `\` and `"` are escaped for KQL safety;
 *   other metacharacters (`()`, `*`, `<>`, `and`/`or`/`not`) stay inside the quoted literal.
 * @returns Installed rules keyed by `rule_id`. Empty for an empty input.
 */
export const findInstalledRulesByRuleIds = async ({
  rulesClient,
  ruleIds,
}: {
  rulesClient: RulesClient;
  ruleIds: string[];
}): Promise<Record<string, RuleResponse>> => {
  if (ruleIds.length === 0) return {};

  const filter = `alert.attributes.params.ruleId: (${ruleIds
    .map((id) => `"${escapeQuotes(id)}"`)
    .join(' OR ')})`;

  const { data } = await findRules({
    rulesClient,
    filter,
    page: 1,
    perPage: ruleIds.length,
    fields: undefined,
    sortField: undefined,
    sortOrder: undefined,
  });

  const installedRulesById: Record<string, RuleResponse> = {};
  for (const rule of data) {
    const response = internalRuleToAPIResponse(rule);
    installedRulesById[response.rule_id] = response;
  }
  return installedRulesById;
};
