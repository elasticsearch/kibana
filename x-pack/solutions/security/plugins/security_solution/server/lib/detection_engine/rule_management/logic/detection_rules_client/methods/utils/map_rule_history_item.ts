/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RuleChangeHistoryDocument } from '@kbn/alerting-plugin/server';
import type { SanitizedRule } from '@kbn/alerting-types';
import type { RuleHistoryItem } from '../../../../../../../../common/api/detection_engine/rule_management';
import { convertAlertingRuleToRuleResponse } from '../../converters/convert_alerting_rule_to_rule_response';
import { computeOldValues } from './compute_old_values';
import type { RuleParams } from '../../../../../rule_schema';

export function mapRuleHistoryItem(
  current: RuleChangeHistoryDocument,
  previous?: RuleChangeHistoryDocument
): RuleHistoryItem {
  const rule = convertAlertingRuleToRuleResponse(current.rule as SanitizedRule<RuleParams>);
  const previousRule = previous
    ? convertAlertingRuleToRuleResponse(previous.rule as SanitizedRule<RuleParams>)
    : undefined;

  return {
    timestamp: current['@timestamp'],
    id: current.event.id,
    user: current.user ? { id: current.user.id, name: current.user.name } : null,
    action: current.event.action,
    rule,
    old_values: computeOldValues(rule, previousRule),
    metadata: normalizeMetadata(current.metadata),
  };
}

function normalizeMetadata(
  metadata: RuleChangeHistoryDocument['metadata']
): Record<string, unknown> | undefined {
  if (metadata == null) return undefined;
  const { bulkCount, ...rest } = metadata;

  return bulkCount !== undefined ? { ...rest, bulk_count: bulkCount } : rest;
}
