/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { arrayOrSingleSchema } from './common';

export const RULE_EXECUTIONS_MAX_PER_PAGE = 100;
export const RULE_EXECUTIONS_DEFAULT_PER_PAGE = 20;
/**
 * Maximum number of events that can be paged through. Mirrors the default
 * Elasticsearch `index.max_result_window` so deep pagination via `from +
 * size` cannot blow up at the cluster boundary. Future work can switch to
 * `search_after` to remove the cap.
 */
export const RULE_EXECUTIONS_MAX_RESULT_WINDOW = 10_000;
/**
 * Maximum number of rule ids accepted by the `ruleId` filter. Caps the
 * `terms` clause size on the server and keeps the query string within a
 * reasonable URL length budget (256 chars per id * 10 ids ≈ 2,5KB).
 */
export const RULE_EXECUTIONS_MAX_RULE_ID_FILTER = 10;

/**
 * Coarse ECS-aligned outcome (`event.outcome`) for a single rule execution.
 *
 * Pinned to Task Manager's actual contract for `task-run` events: the
 * `EventLogOutcomes` enum in `task_manager/server/constants.ts` only
 * emits `success` and `failure`, and no other producer writes
 * `event.action: 'task-run'`.
 *
 * The fine-grained product taxonomy
 * (`success | warning | failed | timeout | skipped`) sourced from
 * `kibana.alerting_v2.rule_executor.execution.status` will land later
 * as a separate field so cross-platform ECS consumers stay unaffected.
 */
export const ruleExecutionOutcomeSchema = z.enum(['success', 'failure']);
export type RuleExecutionOutcome = z.infer<typeof ruleExecutionOutcomeSchema>;

/**
 * Outcome filter. The array cap tracks the enum size — each value can appear
 * at most once. It auto-extends when new outcome values are added.
 */
const outcomeArraySchema = arrayOrSingleSchema(
  ruleExecutionOutcomeSchema,
  ruleExecutionOutcomeSchema.options.length
);

/**
 * Rule id filter. Each id must be a non-empty string up to 256 chars; the
 * array is capped at {@link RULE_EXECUTIONS_MAX_RULE_ID_FILTER}.
 */
const ruleIdArraySchema = arrayOrSingleSchema(
  z.string().min(1).max(256),
  RULE_EXECUTIONS_MAX_RULE_ID_FILTER
);

export const getRuleExecutionsQuerySchema = z
  .object({
    ruleId: ruleIdArraySchema.optional().describe(`Rule id filter. `),
    outcome: outcomeArraySchema.optional().describe('Outcome filter. '),
    from: z.iso
      .datetime()
      .optional()
      .describe('Inclusive ISO datetime lower bound on event.start.'),
    to: z.iso.datetime().optional().describe('Inclusive ISO datetime upper bound on event.start.'),
    sort: z
      .enum(['startedAt', 'duration'])
      .default('startedAt')
      .describe('Sort field. Defaults to startedAt.'),
    sortOrder: z.enum(['asc', 'desc']).default('desc').describe('Sort direction.'),
    page: z.coerce
      .number()
      .int()
      .min(1)
      .max(RULE_EXECUTIONS_MAX_RESULT_WINDOW)
      .default(1)
      .describe(`Page number.`),
    perPage: z.coerce
      .number()
      .int()
      .min(1)
      .max(RULE_EXECUTIONS_MAX_PER_PAGE)
      .default(RULE_EXECUTIONS_DEFAULT_PER_PAGE)
      .describe(`Number of results per page.`),
  })
  .refine(({ page, perPage }) => page * perPage <= RULE_EXECUTIONS_MAX_RESULT_WINDOW, {
    message: `page * perPage cannot exceed ${RULE_EXECUTIONS_MAX_RESULT_WINDOW}.`,
    path: ['page'],
  });
export type GetRuleExecutionsQuery = z.infer<typeof getRuleExecutionsQuerySchema>;

export const ruleExecutionViewSchema = z.object({
  id: z.string(),
  rule: z.object({
    id: z.string(),
    version: z.number().int().nullable(),
  }),
  spaceId: z.string(),
  startedAt: z.string(),
  endedAt: z.string(),
  timings: z.object({
    duration: z.number().int().nonnegative(),
    scheduledDelay: z.number().int(),
  }),
  outcome: ruleExecutionOutcomeSchema,
  reason: z.string().nullable(),
  error: z
    .object({
      message: z.string(),
      stackTrace: z.string().nullable(),
    })
    .nullable(),
});

export type RuleExecutionView = z.infer<typeof ruleExecutionViewSchema>;

export const getRuleExecutionsResponseSchema = z.object({
  items: z.array(ruleExecutionViewSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  perPage: z.number().int().min(1),
});

export type GetRuleExecutionsResponse = z.infer<typeof getRuleExecutionsResponseSchema>;
