/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IValidatedEvent } from '@kbn/event-log-plugin/server';
import type { UnifiedExecutionResult } from '../../../../../../../common/api/detection_engine/rule_monitoring';
import { invariant } from '../../../../../../../common/utils/invariant';
import { nsToMs, toOptionalInt } from './utils';

/**
 * Maps an RnA v2 rule execution event (provider: alerting_v2, action: execute)
 * to the same UnifiedExecutionResult shape used by the DE v1 execution history UI.
 *
 * V2 event field namespace: kibana.alerting_v2.rule_executor.*
 * V1 event field namespace: kibana.alert.rule.execution.*
 *
 * This mapper allows the Security execution results table to render both v1 and v2
 * execution events using the same component and data shape.
 */
export const mapV2EventToUnifiedResult = (event: IValidatedEvent): UnifiedExecutionResult => {
  return {
    execution_uuid: extractExecutionUuid(event),
    execution_start: extractExecutionStart(event),
    execution_duration_ms: extractDurationMs(event),
    schedule_delay_ms: extractScheduleDelayMs(event),
    backfill: null, // Backfill not supported in v2 yet (parity item #5)
    outcome: extractOutcome(event),
    metrics: extractMetrics(event),
  };
};

const getRuleExecutor = (event: IValidatedEvent): Record<string, unknown> | undefined => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (event?.kibana as any)?.alerting_v2?.rule_executor;
};

const getExecution = (event: IValidatedEvent): Record<string, unknown> | undefined => {
  const ruleExecutor = getRuleExecutor(event);
  return ruleExecutor?.execution as Record<string, unknown> | undefined;
};

const getMetrics = (event: IValidatedEvent): Record<string, unknown> | undefined => {
  const execution = getExecution(event);
  return execution?.metrics as Record<string, unknown> | undefined;
};

const extractExecutionUuid = (event: IValidatedEvent): string | null => {
  const execution = getExecution(event);
  return (execution?.uuid as string) ?? null;
};

const extractExecutionStart = (event: IValidatedEvent): string => {
  const executionStart = event?.event?.start ?? event?.['@timestamp'];
  invariant(executionStart, 'Neither "event.start" nor "@timestamp" field is found in v2 event');
  return executionStart;
};

const extractDurationMs = (event: IValidatedEvent): number | null => nsToMs(event?.event?.duration);

const extractScheduleDelayMs = (event: IValidatedEvent): number | null =>
  nsToMs(event?.kibana?.task?.schedule_delay);

/**
 * Maps the v2 5-way status to the v1 3-way UnifiedExecutionStatus.
 *
 * V2 statuses: success | warning | failed | timeout | skipped
 * V1 statuses: success | warning | failure
 *
 * Mapping:
 *   success  → success
 *   warning  → warning
 *   failed   → failure
 *   timeout  → failure (with message noting timeout)
 *   skipped  → warning (rule was skipped, not a hard failure)
 */
const extractOutcome = (event: IValidatedEvent): UnifiedExecutionResult['outcome'] => {
  const execution = getExecution(event);
  const v2Status = (execution?.status as string) ?? 'success';

  let status: 'success' | 'warning' | 'failure';
  let message: string | null;

  switch (v2Status) {
    case 'success':
      status = 'success';
      message = 'Rule executed successfully';
      break;
    case 'warning':
      status = 'warning';
      message = event?.message ?? null;
      break;
    case 'failed':
      status = 'failure';
      message = event?.error?.message ?? event?.message ?? null;
      break;
    case 'timeout':
      status = 'failure';
      message = `Rule execution timed out${
        event?.error?.message ? `: ${event.error.message}` : ''
      }`;
      break;
    case 'skipped':
      status = 'warning';
      message = `Rule execution skipped${event?.event?.reason ? `: ${event.event.reason}` : ''}`;
      break;
    default:
      status = 'success';
      message = null;
  }

  return { status, message };
};

const extractMetrics = (event: IValidatedEvent): UnifiedExecutionResult['metrics'] => {
  const metrics = getMetrics(event);
  const query = metrics?.query as Record<string, unknown> | undefined;
  const eventsWritten = metrics?.events_written as Record<string, unknown> | undefined;

  return {
    total_search_duration_ms: toOptionalInt(query?.total_search_duration_ms),
    total_indexing_duration_ms: null, // Not available in v2 schema
    execution_gap_duration_s: null, // Gap detection not in v2 (parity item #5)
    alerts_candidate_count: toOptionalInt(query?.number_of_rows_returned),
    alert_counts: eventsWritten ? { new: toOptionalInt(eventsWritten.breached) } : null,
    matched_indices_count: null, // DE-specific, not in v2
    frozen_indices_queried_count: null, // DE-specific, not in v2
  };
};
