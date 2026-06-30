/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RuleExecutionOutcome } from '@kbn/alerting-v2-schemas';

export type { RuleExecutionOutcome };

/**
 * Structured error payload attached to a failed run.
 *
 * Captured verbatim from the source `error.message` / `error.stack_trace`
 * fields. `null` when Task Manager did not record any error info — both
 * for successful runs and for failures it could not classify.
 */
export interface RuleExecutionError {
  message: string;
  stackTrace: string | null;
}

/**
 * Timing breakdown for a rule run. All values are in **milliseconds**, projected
 * from Task Manager's nanosecond fields (`event.duration`,
 * `kibana.task.schedule_delay`).
 */
export interface RuleExecutionTimings {
  /** Wall-clock duration of the run (`event.duration`). */
  duration: number;
  /**
   * Delay between the scheduled run-at and the actual start
   * (`kibana.task.schedule_delay`).
   */
  scheduledDelay: number;
}

/**
 * Domain type representing a single rule execution event projected from a
 * task-run document in the event log.
 *
 * Field-level notes:
 *   - `id` is the Elasticsearch document `_id` of the source event-log row.
 *     The event log assigns it at write time, so it is opaque, stable across
 *     reads, and unique per run without any composite construction on our
 *     side.
 *   - `rule.id` is parsed from `kibana.task.id` (which encodes
 *     `{taskType}:{spaceId}:{ruleId}`). `rule.version` is reserved and
 *     always `null` for now: the `task-run` event does not yet carry
 *     a version. It will be populated once the rule executor writes its
 *     own provider event with `rule.version` inline. The nested shape
 *     also leaves room for `rule.name` later, without breaking callers.
 *   - `timings` groups the duration / schedule-delay pair so the unit
 *     (ms) is implicit at the parent level rather than smeared across
 *     suffixes.
 *   - `outcome` and `reason` are passed through from `event.outcome` and
 *     `event.reason` respectively. Task Manager writes `event.reason` as a
 *     human-readable sentence (e.g. `Task "<id>" was cancelled.`); we do
 *     not parse it.
 *   - `error` is `null` when there is no failure info — both for happy-path
 *     runs and for failures Task Manager did not classify.
 */
export interface RuleExecution {
  id: string;
  rule: { id: string; version: number | null };
  spaceId: string;
  startedAt: string;
  endedAt: string;
  timings: RuleExecutionTimings;
  outcome: RuleExecutionOutcome;
  reason: string | null;
  error: RuleExecutionError | null;
}

/**
 * Sort keys exposed by `findRuleExecutions`. Maps internally to ES fields
 * (`startedAt → event.start`, `duration → event.duration`).
 */
export type RuleExecutionSortField = 'startedAt' | 'duration';
export type RuleExecutionSortOrder = 'asc' | 'desc';

export interface FindRuleExecutionsQuery {
  spaceId: string;
  ruleIds?: string[];
  outcomes?: RuleExecutionOutcome[];
  from?: string;
  to?: string;
  sort?: RuleExecutionSortField;
  sortOrder?: RuleExecutionSortOrder;
  page: number;
  perPage: number;
}

/**
 * Generic paginated response shape used by event-log read methods.
 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  perPage: number;
}
