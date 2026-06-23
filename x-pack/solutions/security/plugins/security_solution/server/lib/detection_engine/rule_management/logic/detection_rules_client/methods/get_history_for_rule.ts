/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RulesClient } from '@kbn/alerting-plugin/server';
import type { RuleObjectId } from '../../../../../../../common/api/detection_engine/model/rule_schema';
import type {
  RuleChangesHistoryResponse,
  RuleHistoryItem,
} from '../../../../../../../common/api/detection_engine/rule_management';
import { mapRuleHistoryItem } from './utils/map_rule_history_item';

const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 20;

export interface GetHistoryForRuleArgs {
  rulesClient: RulesClient;
  ruleId: RuleObjectId;
  page?: number;
  perPage?: number;
}

export const getHistoryForRule = async ({
  rulesClient,
  ruleId,
  page = DEFAULT_PAGE,
  perPage = DEFAULT_PER_PAGE,
}: GetHistoryForRuleArgs): Promise<RuleChangesHistoryResponse> => {
  // Run queries concurrently:
  // - main: the requested page (newest-first, +1 extra for old_values computation)
  // - oldest: single item ascending by timestamp to get tracking_started_at
  const [result, oldestResult] = await Promise.all([
    rulesClient.getHistory({
      module: 'security',
      ruleId,
      from: (page - 1) * perPage,
      size: perPage + 1,
      sort: [{ '@timestamp': { order: 'desc' } }],
    }),
    rulesClient.getHistory({
      module: 'security',
      ruleId,
      from: 0,
      size: 1,
      sort: [{ '@timestamp': { order: 'asc' } }],
    }),
  ]);

  const fetchedItems = result.items;
  const resultItems: RuleHistoryItem[] = [];

  for (let i = 0; i < Math.min(perPage, fetchedItems.length); ++i) {
    resultItems.push(mapRuleHistoryItem(fetchedItems[i], fetchedItems[i + 1]));
  }

  return {
    page,
    per_page: perPage,
    total: result.total,
    tracking_started_at: oldestResult.items[0]?.['@timestamp'],
    items: resultItems,
  };
};
