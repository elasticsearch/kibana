/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import {
  DEFAULT_ARTIFACT_VALUE_LIMIT,
  ARTIFACT_VALUE_LIMITS,
  MAX_ARTIFACT_VALUE_LIMIT,
} from '@kbn/alerting-v2-constants';
import { validateEsqlQuery, validateMinDuration, composeEsqlQuery } from './validation';
import { durationSchema, tagsSchema } from './common';
import {
  MAX_CONSECUTIVE_BREACHES,
  MAX_DESCRIPTION_LENGTH,
  MAX_ESQL_QUERY_LENGTH,
  MAX_FIELD_NAME_LENGTH,
  MAX_GROUPING_FIELDS,
  MAX_NAME_LENGTH,
  MIN_SCHEDULE_INTERVAL,
  MAX_BULK_ITEMS,
  ID_MAX_LENGTH,
  VERSION_MAX_LENGTH,
} from './constants';

/** Primitives */

export const esqlQuerySchema = z
  .string()
  .min(1)
  .max(MAX_ESQL_QUERY_LENGTH)
  .superRefine((value, ctx) => {
    const error = validateEsqlQuery(value);
    if (error) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
    }
  });

/** Kind */

export const ruleKindSchema = z
  .enum(['alert', 'signal'])
  .describe(
    'Rule kind: "alert" for stateful alerting with transitions, "signal" for stateless detection.'
  );

export type RuleKind = z.infer<typeof ruleKindSchema>;

/** Metadata (required) */

export const metadataSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(MAX_NAME_LENGTH)
      .describe('Rule name (must be unique within the space).'),
    description: z
      .string()
      .max(MAX_DESCRIPTION_LENGTH)
      .optional()
      .describe('Human-readable description of the rule.'),
    owner: z.string().max(256).optional().describe('Owner of the rule.'),
    tags: tagsSchema
      .min(1)
      .optional()
      .describe('Tags for categorization, e.g. ["production", "infra"].'),
    builder_type: z
      .string()
      .max(64)
      .optional()
      .describe(
        'Identifies the rule builder that authored this rule (e.g. "threshold"). Absent for rules authored directly in ES|QL.'
      ),
  })
  .strict()
  .describe('Rule metadata.');

/** Schedule (required) */

/** Duration with an additional minimum-interval guard for schedule frequency. */
export const scheduleEverySchema = durationSchema.superRefine((value, ctx) => {
  const error = validateMinDuration(value, MIN_SCHEDULE_INTERVAL);
  if (error) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
  }
});

export const scheduleSchema = z
  .object({
    every: scheduleEverySchema.describe('Execution interval, e.g. 1m, 5m, 1h.'),
    lookback: durationSchema
      .optional()
      .describe('Lookback window for the query, e.g. 5m, 1h. Can also be expressed in ES|QL.'),
  })
  .strict()
  .describe('Execution schedule configuration.');

/** Query (required) */

export const queryFormatSchema = z.enum(['composed', 'standalone']);
export const queryFormat = queryFormatSchema.enum;
export type QueryFormat = z.infer<typeof queryFormatSchema>;

/** Recovery strategy. */
export const recoveryStrategySchema = z.enum(['no_breach', 'query', 'none']);
export const recoveryStrategy = recoveryStrategySchema.enum;
export type RecoveryStrategy = z.infer<typeof recoveryStrategySchema>;

/** No-data strategy. */
export const noDataStrategySchema = z.enum(['last_known_status', 'emit', 'recover', 'none']);
export const noDataStrategy = noDataStrategySchema.enum;
export type NoDataStrategy = z.infer<typeof noDataStrategySchema>;

/**
 * Appendable ES|QL segment (e.g. `WHERE …`). Conceptually a bare command,
 * but a leading `|` is also tolerated — `composeEsqlQuery` strips it before
 * splicing the segment onto `base`. We only enforce structural bounds here
 * (length, non-empty). Full parser validation only runs when the segment is
 * composed with its `base` via `composeEsqlQuery`.
 */
export const esqlQuerySegmentSchema = z
  .string()
  .min(1)
  .max(MAX_ESQL_QUERY_LENGTH)
  .refine((s) => s.trim().length > 0, { message: 'Segment must not be whitespace-only' });

/** Composed wrappers (segment-based, appended to `base`). */

const composedBreachSchema = z
  .object({
    segment: esqlQuerySegmentSchema.describe(
      'Appendable ES|QL segment for breach detection (required).'
    ),
  })
  .strict();

const composedRecoverySchema = z
  .object({
    segment: esqlQuerySegmentSchema.describe('Appendable ES|QL segment for recovery detection.'),
  })
  .strict()
  .describe('Recovery query segment. Present only when recovery_strategy is "query".');

/** Standalone wrappers (full queries). */

const standaloneBreachSchema = z
  .object({
    query: esqlQuerySchema.describe('Full ES|QL query for breach detection (required).'),
  })
  .strict();

const standaloneRecoverySchema = z
  .object({
    query: esqlQuerySchema.describe('Full ES|QL query for recovery detection.'),
  })
  .strict()
  .describe('Recovery query. Present only when recovery_strategy is "query".');

const standaloneNoDataSchema = z
  .object({
    query: esqlQuerySchema.describe('Full ES|QL query that detects presence of data.'),
  })
  .strict()
  .describe('No-data detection query. Present only when no_data_strategy is not "none".');

export const composedQuerySchema = z
  .object({
    format: z.literal(queryFormat.composed),
    base: esqlQuerySchema.describe(
      'Base ES|QL query. Time filters are applied automatically via the lookback window.'
    ),
    breach: composedBreachSchema.describe('Breach detection configuration (required).'),
    recovery: composedRecoverySchema
      .optional()
      .describe('Recovery query segment. Required when recovery_strategy is "query".'),
  })
  .strict()
  .check((ctx) => {
    const breachError = validateEsqlQuery(
      composeEsqlQuery(ctx.value.base, ctx.value.breach.segment)
    );
    if (breachError) {
      ctx.issues.push({
        code: 'custom',
        path: ['breach', 'segment'],
        message: breachError,
        input: ctx.value.breach.segment,
      });
    }
    if (ctx.value.recovery) {
      const recoveryError = validateEsqlQuery(
        composeEsqlQuery(ctx.value.base, ctx.value.recovery.segment)
      );
      if (recoveryError) {
        ctx.issues.push({
          code: 'custom',
          path: ['recovery', 'segment'],
          message: recoveryError,
          input: ctx.value.recovery.segment,
        });
      }
    }
  })
  .describe('Composed query: a shared base with appendable breach and recovery segments.');

export const standaloneQuerySchema = z
  .object({
    format: z.literal(queryFormat.standalone),
    breach: standaloneBreachSchema.describe('Breach detection configuration (required).'),
    recovery: standaloneRecoverySchema
      .optional()
      .describe('Recovery query. Required when recovery_strategy is "query".'),
    no_data: standaloneNoDataSchema
      .optional()
      .describe('No-data detection query. Required when no_data_strategy is not "none".'),
  })
  .strict()
  .describe('Standalone queries: independent full queries for breach, recovery, and no_data.');

export const querySchema = z
  .discriminatedUnion('format', [composedQuerySchema, standaloneQuerySchema])
  .describe('Detection query configuration.');

export type Query = z.infer<typeof querySchema>;

/**
 * Returns the effective breach ES|QL query — what the executor actually runs
 * to detect breaches. For composed queries this is `base` concatenated with
 * `breach.segment`; for standalone it's `breach.query` verbatim.
 */
export const getBreachEsqlQuery = (query: Query): string =>
  query.format === 'composed'
    ? composeEsqlQuery(query.base, query.breach.segment)
    : query.breach.query;

/**
 * Returns the recovery ES|QL query when `recoveryStrategy` is `'query'`,
 * otherwise `undefined`. For composed queries this is `base` +
 * `recovery.segment`; for standalone it's `recovery.query` verbatim.
 */
export const getRecoverEsqlQuery = (
  query: Query,
  strategy?: RecoveryStrategy
): string | undefined => {
  if (strategy !== recoveryStrategy.query || !query.recovery) return undefined;
  if (query.format === 'composed') {
    return composeEsqlQuery(query.base, query.recovery.segment);
  }
  return query.recovery.query;
};

/**
 * Returns the has-data ES|QL query when `noDataStrategy` is not `'none'`,
 * otherwise `undefined`.
 *
 * - Standalone: returns the explicit `no_data.query` block, if configured.
 * - Composed: returns the `base` query.
 */
export const getNoDataEsqlQuery = (query: Query, strategy?: NoDataStrategy): string | undefined => {
  if (strategy == null || strategy === noDataStrategy.none) return undefined;
  if (query.format === 'composed') {
    return query.base;
  }
  if (query.no_data) {
    return query.no_data.query;
  }
  return undefined;
};

/**
 * Returns the "root" ES|QL query — the one containing the `FROM` clause and
 * therefore usable for index-pattern extraction. `base` for composed,
 * `breach.query` for standalone.
 */
export const getRootEsqlQuery = (query: Query): string =>
  query.format === 'composed' ? query.base : query.breach.query;

/** State transition (optional, alert-only) */

export const stateTransitionOperatorSchema = z.enum(['AND', 'OR']);

export const stateTransitionSchema = z
  .object({
    pending_operator: stateTransitionOperatorSchema
      .optional()
      .describe('How to combine count and timeframe for pending.'),
    pending_count: z
      .number()
      .int()
      .min(0)
      .max(MAX_CONSECUTIVE_BREACHES)
      .optional()
      .describe('Consecutive breaches before transitioning to active.'),
    pending_timeframe: durationSchema
      .optional()
      .describe('Time window for pending evaluation, e.g. 5m, 15m.'),
    recovering_operator: stateTransitionOperatorSchema
      .optional()
      .describe('How to combine count and timeframe for recovering.'),
    recovering_count: z
      .number()
      .int()
      .min(0)
      .max(MAX_CONSECUTIVE_BREACHES)
      .optional()
      .describe('Consecutive recoveries before transitioning to inactive.'),
    recovering_timeframe: durationSchema
      .optional()
      .describe('Time window for recovering evaluation, e.g. 5m, 15m.'),
  })
  .strict()
  .describe('Episode state transition thresholds (alert-only).')
  .optional()
  .nullable();

/** Grouping (optional) */

export const groupingSchema = z
  .object({
    fields: z
      .array(z.string().min(1).max(MAX_FIELD_NAME_LENGTH))
      .max(MAX_GROUPING_FIELDS)
      .describe(
        'Fields to group alerts by, e.g. ["host.name", "service.name"]. Should match ES|QL GROUP BY fields.'
      ),
  })
  .strict()
  .describe('Grouping configuration.');

/** Artifacts (optional) */

const artifactSchema = z
  .object({
    id: z.string().min(1).max(256).describe('Artifact identifier.'),
    type: z.string().min(1).max(128).describe('Artifact type.'),
    value: z.string().min(1).max(MAX_ARTIFACT_VALUE_LIMIT).describe('Artifact value.'),
  })
  .strict()
  .check((ctx) => {
    const limit = ARTIFACT_VALUE_LIMITS[ctx.value.type] ?? DEFAULT_ARTIFACT_VALUE_LIMIT;
    if (ctx.value.value.length > limit) {
      ctx.issues.push({
        code: 'custom',
        path: ['value'],
        message: `Artifact value must be at most ${limit} characters for type "${ctx.value.type}".`,
        input: ctx.value.value,
      });
    }
  });

/** Create rule API schema */

/**
 * Base schema without refinements - used for extending in response schema and
 * for introspection by the immutability classification meta-tests.
 * @internal
 */
export const createRuleDataBaseSchema = z
  .object({
    kind: ruleKindSchema,
    metadata: metadataSchema,
    time_field: z
      .string()
      .min(1)
      .max(128)
      .default('@timestamp')
      .describe('Time field used for the lookback window range filter.'),
    schedule: scheduleSchema,
    query: querySchema,
    recovery_strategy: recoveryStrategySchema
      .optional()
      .describe(
        'How recovery is detected. "no_breach" recovers groups that stop breaching; "query" uses a custom recovery query; "none" disables recovery.'
      ),
    no_data_strategy: noDataStrategySchema
      .optional()
      .describe(
        'How to handle no-data situations. "emit" emits a no-data event; "last_known_status" holds the last known status; "recover" forces recovery; "none" disables no-data detection. Standalone-format rules must provide a `no_data` query block when this is not "none"; composed-format rules use `base` as the data-presence query.'
      ),
    state_transition: stateTransitionSchema,
    grouping: groupingSchema.optional(),
    artifacts: z.array(artifactSchema).max(100).optional(),
  })
  .strip();

/** Cross-field validation predicates — shared between the CRUD API and the manage_rule tool. */

export const isStateTransitionAllowed = (data: {
  kind?: string;
  state_transition?: unknown;
}): boolean => data.kind === 'alert' || data.state_transition == null;

export const isSignalUsingStandaloneFormat = (data: {
  kind?: string;
  query?: { format?: string };
}): boolean => data.kind !== 'signal' || data.query?.format === queryFormat.standalone;

/** Signal rules only run a breach query — no recovery or no-data behaviour. */
export const isSignalQueryBreachOnly = (data: {
  kind?: string;
  recovery_strategy?: RecoveryStrategy | null;
  no_data_strategy?: NoDataStrategy | null;
}): boolean => {
  if (data.kind !== 'signal') return true;
  const recoveryOk = data.recovery_strategy == null || data.recovery_strategy === 'none';
  const noDataOk = data.no_data_strategy == null || data.no_data_strategy === 'none';
  return recoveryOk && noDataOk;
};

/** query.recovery is only meaningful when recovery_strategy is "query". */
export const isRecoveryQueryConsistentWithStrategy = (data: {
  recovery_strategy?: RecoveryStrategy | null;
  query?: { recovery?: unknown };
}): boolean => {
  if (data.query?.recovery == null) return true;
  return data.recovery_strategy === recoveryStrategy.query;
};

/** recovery_strategy "query" requires a recovery query block. */
export const isRecoveryQueryProvidedForStrategy = (data: {
  recovery_strategy?: RecoveryStrategy | null;
  query?: { recovery?: unknown };
}): boolean => data.recovery_strategy !== recoveryStrategy.query || data.query?.recovery != null;

/** query.no_data is only meaningful when no_data_strategy is not "none". */
type QueryWithOptionalNoData = Record<string, unknown>;

export const isNoDataQueryConsistentWithStrategy = (data: {
  no_data_strategy?: NoDataStrategy | null;
  query?: QueryWithOptionalNoData;
}): boolean => {
  if (data.query?.no_data == null) return true;
  return data.no_data_strategy != null && data.no_data_strategy !== noDataStrategy.none;
};

/**
 * Standalone rules with `no_data_strategy != 'none'` must provide a
 * `query.no_data` block. Composed rules use their `base` query as the
 * data-presence query, so they don't need a separate block.
 */
export const isNoDataQueryProvidedForStrategy = (data: {
  no_data_strategy?: NoDataStrategy | null;
  query?: QueryWithOptionalNoData;
}): boolean => {
  if (data.no_data_strategy == null || data.no_data_strategy === noDataStrategy.none) {
    return true;
  }
  if (data.query?.format !== queryFormat.standalone) return true;
  return data.query?.no_data != null;
};

export const createRuleDataSchema = createRuleDataBaseSchema
  .refine(isStateTransitionAllowed, {
    message: 'state_transition is only allowed when kind is "alert".',
    path: ['state_transition'],
  })
  .refine(isSignalUsingStandaloneFormat, {
    message: 'kind "signal" requires query.format "standalone".',
    path: ['query', 'format'],
  })
  .refine(isSignalQueryBreachOnly, {
    message: 'Signal rules cannot set recovery_strategy or no_data_strategy.',
    path: ['recovery_strategy'],
  })
  .refine(isRecoveryQueryConsistentWithStrategy, {
    message: 'query.recovery is only allowed when recovery_strategy is "query".',
    path: ['query', 'recovery'],
  })
  .refine(isRecoveryQueryProvidedForStrategy, {
    message: 'query.recovery is required when recovery_strategy is "query".',
    path: ['query', 'recovery'],
  })
  .refine(isNoDataQueryConsistentWithStrategy, {
    message: 'query.no_data is only allowed when no_data_strategy is set to a non-"none" value.',
    path: ['query', 'no_data'],
  })
  .refine(isNoDataQueryProvidedForStrategy, {
    message:
      'query.no_data is required when no_data_strategy is not "none" for standalone-format rules.',
    path: ['query', 'no_data'],
  });

export type CreateRuleData = z.infer<typeof createRuleDataSchema>;

/**
 * Top-level fields of the create-rule schema that cannot be changed after the
 * rule has been created. Every other field of {@link createRuleDataBaseSchema}
 * is implicitly mutable.
 *
 * Consumers that implement PUT-style upsert must reject requests that try to
 * mutate one of these. Consumers that implement PATCH-style update must
 * preserve them from storage regardless of the body.
 *
 * Whenever a top-level field is added to {@link createRuleDataBaseSchema}, the
 * snapshot test in `rule_data_schema.test.ts` will fail. Updating the
 * snapshot surfaces the new field in the PR diff so reviewers can confirm
 * whether it should be classified as immutable here instead of being silently
 * mutable.
 */
export const IMMUTABLE_RULE_FIELDS = ['kind'] as const satisfies ReadonlyArray<
  keyof CreateRuleData
>;

export type ImmutableRuleField = (typeof IMMUTABLE_RULE_FIELDS)[number];

/** Update rule API schema — all fields optional for partial updates */

export const updateRuleDataSchema = z
  .object({
    metadata: metadataSchema
      .partial()
      .extend({ builder_type: z.string().max(64).optional().nullable() })
      .optional(),
    time_field: z.string().min(1).max(128).optional(),
    schedule: scheduleSchema.partial().optional().nullable(),
    query: querySchema.optional(),
    recovery_strategy: recoveryStrategySchema.optional().nullable(),
    no_data_strategy: noDataStrategySchema.optional().nullable(),
    state_transition: stateTransitionSchema.nullable(),
    grouping: groupingSchema.optional().nullable(),
    artifacts: z.array(artifactSchema).max(100).optional().nullable(),
    enabled: z.boolean().optional().describe('Whether the rule is enabled.'),
  })
  .strip();

export type UpdateRuleData = z.infer<typeof updateRuleDataSchema>;

/** Update rule API body schema — adds OCC version on top of update data. */
export const updateRuleBodySchema = updateRuleDataSchema.extend({
  version: z
    .string()
    .min(1)
    .max(VERSION_MAX_LENGTH)
    .optional()
    .describe('The current version of the rule, used for optimistic concurrency control.'),
});

export type UpdateRuleBody = z.infer<typeof updateRuleBodySchema>;

/**
 * Schema for rule response data returned from the API.
 * Extends the base rule schema with server-generated fields.
 */
export const ruleResponseSchema = createRuleDataBaseSchema.extend({
  id: z.string().describe('Unique rule identifier.'),
  enabled: z.boolean().describe('Whether the rule is enabled.'),
  createdBy: z.string().nullable().describe('User who created the rule.'),
  createdAt: z.string().describe('ISO timestamp when the rule was created.'),
  updatedBy: z.string().nullable().describe('User who last updated the rule.'),
  updatedAt: z.string().describe('ISO timestamp when the rule was last updated.'),
  version: z
    .string()
    .optional()
    .describe('The version of the rule, used for optimistic concurrency control'),
});

export type RuleResponse = z.infer<typeof ruleResponseSchema>;

/** Sort field for find rules API. */
export const findRulesSortFieldSchema = z.enum(['kind', 'enabled', 'name']);
export type FindRulesSortField = z.infer<typeof findRulesSortFieldSchema>;

/** Query parameters for the find rules (list) API. */
export const findRulesParamsSchema = z.object({
  page: z.coerce.number().min(1).optional().describe('The page number to return. Defaults to 1.'),
  perPage: z.coerce
    .number()
    .min(1)
    .max(1000)
    .optional()
    .describe('The number of rules to return per page. Defaults to 20.'),
  filter: z.string().optional().describe('The filter to apply to the rules.'),
  sortField: findRulesSortFieldSchema.optional().describe('The field to sort rules by.'),
  sortOrder: z.enum(['asc', 'desc']).optional().describe('The direction to sort rules.'),
  search: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe('A text string to search across rule fields.'),
});

export type FindRulesParams = z.infer<typeof findRulesParamsSchema>;

/** Paginated list response schema. */
export const findRulesResponseSchema = z
  .object({
    items: z.array(ruleResponseSchema).describe('The list of rules.'),
    total: z.number().describe('The total number of rules matching the query.'),
    page: z.number().describe('The current page number.'),
    perPage: z.number().describe('The number of rules per page.'),
  })
  .describe('Paginated list of rules.');

export type FindRulesResponse = z.infer<typeof findRulesResponseSchema>;

/** Query parameters for the rule tags API. */
export const ruleTagsParamsSchema = z.object({
  filter: z
    .string()
    .max(1024)
    .optional()
    .describe('The filter to apply when aggregating rule tags.'),
});

export type RuleTagsParams = z.infer<typeof ruleTagsParamsSchema>;

/** Rule tags response schema. */
export const ruleTagsResponseSchema = z
  .object({
    tags: z.array(z.string()).describe('The list of unique rule tags.'),
  })
  .describe('All unique tags across rules.');

/** Bulk operation response schema. */
export const bulkOperationResponseSchema = z
  .object({
    rules: z.array(ruleResponseSchema).describe('The rules that the operation was applied to.'),
    errors: z
      .array(
        z.object({
          id: z.string().describe('The identifier of the rule that failed.'),
          error: z.object({
            message: z.string().describe('The error message.'),
            statusCode: z.number().describe('The HTTP status code.'),
          }),
        })
      )
      .describe('Errors encountered during the bulk operation.'),
    truncated: z
      .boolean()
      .optional()
      .describe(
        'True when the request used a filter that matched more rules than were included in this operation.'
      ),
    totalMatched: z
      .number()
      .optional()
      .describe('Total number of rules matching the filter when truncated is true.'),
  })
  .describe('Result of a bulk rule operation.');

export type BulkOperationResponse = z.infer<typeof bulkOperationResponseSchema>;

export const ruleIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(ID_MAX_LENGTH)
  .describe('A rule identifier.');

/**
 * Request body schema for `POST /api/alerting/v2/rules/_bulk_get`.
 */
export const bulkGetRulesParamsSchema = z
  .object({
    ids: z
      .array(ruleIdSchema)
      .min(1)
      .max(MAX_BULK_ITEMS)
      .describe('Rule identifiers to retrieve. The response preserved this order.'),
  })
  .strict();

export type BulkGetRulesParams = z.infer<typeof bulkGetRulesParamsSchema>;

/**
 * Response schema for `POST /api/alerting/v2/rules/_bulk_get`.
 */
export const bulkGetRulesResponseSchema = z.object({
  rules: z
    .array(ruleResponseSchema)
    .describe('The requested rules, in the same order as the requested ids.'),
});

export type BulkGetRulesResponse = z.infer<typeof bulkGetRulesResponseSchema>;
