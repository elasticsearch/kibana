/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ALERTING_V2_PROVIDER } from '../../event_log/v2_event_log_constants';
import * as f from '../../event_log/event_log_fields';
import { kqlAnd, kqlOr } from '../../utils/kql';

/**
 * Builds a KQL filter string for querying RnA v2 rule execution events.
 *
 * V2 events use:
 *   provider: alerting_v2
 *   action: execute (summary event after pipeline completes)
 *
 * Unlike v1, there is no "execute-backfill" action in v2 — backfill is not yet supported.
 * The execute-start beacon is excluded because it has no metrics (it's a pre-pipeline marker).
 */
export const constructV2ExecutionEventKqlFilter = (filter: { outcome?: string[] }): string => {
  const filters: string[] = [
    `${f.EVENT_PROVIDER}:${ALERTING_V2_PROVIDER}`,
    `${f.EVENT_ACTION}:execute`,
  ];

  if (filter.outcome && filter.outcome.length > 0) {
    const v2Statuses = mapOutcomesToV2Statuses(filter.outcome);
    filters.push(`kibana.alerting_v2.rule_executor.execution.status:(${kqlOr(v2Statuses)})`);
  }

  return kqlAnd(filters);
};

/**
 * Maps v1 outcome filter values to v2 status filter values.
 *
 * UI sends: success | warning | failure
 * V2 uses:  success | warning | failed | timeout | skipped
 */
const mapOutcomesToV2Statuses = (outcomes: string[]): string[] => {
  const statuses: string[] = [];

  for (const outcome of outcomes) {
    switch (outcome) {
      case 'success':
        statuses.push('success');
        break;
      case 'warning':
        statuses.push('warning', 'skipped');
        break;
      case 'failure':
        statuses.push('failed', 'timeout');
        break;
    }
  }

  return statuses;
};
