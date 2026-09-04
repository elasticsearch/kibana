/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import { isEqual } from 'lodash';
import type { CreateRuleData, UpdateRuleData, Query, RuleResponse } from '@kbn/alerting-v2-schemas';
import {
  IMMUTABLE_RULE_FIELDS,
  isNoDataQueryConsistentWithStrategy,
  isNoDataQueryProvidedForStrategy,
  isRecoveryQueryConsistentWithStrategy,
  isRecoveryQueryProvidedForStrategy,
  isSignalQueryBreachOnly,
  isSignalUsingStandaloneFormat,
  type ImmutableRuleField,
} from '@kbn/alerting-v2-schemas';
import { TaskStatus } from '@kbn/task-manager-plugin/server';

import { type RuleSavedObjectAttributes } from '../../saved_objects';
import { ALERTING_ERROR_CODES } from '../errors/error_codes';
import { RULE_VERSION_FALLBACK } from '../rule_changes_history';
import type { BulkOperationError, ResolvedCreateRuleData, RotationCandidate } from './types';

/**
 * Maps a saved-object status code to the stable, machine-readable bulk-error
 * `code` returned in the response body. Keeps the by-ID and by-query endpoints
 * aligned with the single-rule error codes so a client can dispatch on
 * `error.code` uniformly.
 */
export const bulkErrorCodeForStatus = (statusCode: number): string => {
  if (statusCode === 404) {
    return ALERTING_ERROR_CODES.RULE_NOT_FOUND;
  }
  if (statusCode === 409) {
    return ALERTING_ERROR_CODES.RULE_VERSION_CONFLICT;
  }
  return ALERTING_ERROR_CODES.INTERNAL_SERVER_ERROR;
};

/**
 * Optional `details` payload carrying the rule's display name so the client can
 * identify the affected rule without a follow-up fetch (the id alone is opaque
 * in the UI). Omitted when the name is unknown — e.g. a rule that failed to
 * fetch (`RULE_NOT_FOUND`) — so the client falls back to the id.
 */
const nameDetails = (name?: string) => (name ? { details: { name } } : {});

export const toBulkError = (
  id: string,
  err: { statusCode: number; message: string },
  name?: string
): BulkOperationError => ({
  id,
  error: {
    code: bulkErrorCodeForStatus(err.statusCode),
    message: err.message,
    ...nameDetails(name),
  },
});

/**
 * Groups rotation candidates by their schedule interval. `bulkUpdateSchedules`
 * takes a single schedule per call, so each interval becomes one call (and
 * passing each group its own interval leaves the schedule unchanged).
 */
export const groupCandidatesByInterval = (
  candidates: RotationCandidate[]
): Map<string, RotationCandidate[]> => {
  const byInterval = new Map<string, RotationCandidate[]>();
  for (const candidate of candidates) {
    const interval = candidate.attrs.schedule.every;
    const group = byInterval.get(interval) ?? [];
    group.push(candidate);
    byInterval.set(interval, group);
  }
  return byInterval;
};

/** Per-rule error for a disabled rule — it has no executor task/key to rotate. */
export const ruleDisabledError = (ruleId: string, name?: string): BulkOperationError => ({
  id: ruleId,
  error: {
    code: ALERTING_ERROR_CODES.RULE_DISABLED,
    message: `Rule with id "${ruleId}" is disabled and has no API key to update`,
    ...nameDetails(name),
  },
});

/**
 * Whether a skipped executor task is worth a retry. `bulkUpdateSchedules` only
 * touches `idle` tasks, so a skipped task is in some non-idle state — but only a
 * mid-run task (`running`/`claiming`) frees up on its own and rotates on the
 * next attempt. A `failed`/`unrecognized`/`dead_letter`/`should_delete` task
 * will not, so it must not be reported as `RULE_ALREADY_RUNNING` ("try again
 * once it finishes"), which would be misleading.
 */
export const isTaskMidRun = (status?: TaskStatus): boolean =>
  status === TaskStatus.Running || status === TaskStatus.Claiming;

/** Per-rule error for a rule whose executor task is mid-run and was skipped. */
export const ruleRunningError = (ruleId: string, name?: string): BulkOperationError => ({
  id: ruleId,
  error: {
    code: ALERTING_ERROR_CODES.RULE_ALREADY_RUNNING,
    message: `Rule with id "${ruleId}" is currently running; its API key cannot be updated until the run finishes`,
    ...nameDetails(name),
  },
});

/**
 * Per-rule error for a rule whose executor task key rotation failed — either a
 * per-task failure (`statusCode` from Task Manager) or a whole-group failure
 * (no `statusCode` → `INTERNAL_SERVER_ERROR`).
 */
export const rotationFailedError = (
  ruleId: string,
  statusCode?: number,
  name?: string
): BulkOperationError => ({
  id: ruleId,
  error: {
    code: bulkErrorCodeForStatus(statusCode ?? 500),
    message: `Failed to update the executor task API key for rule "${ruleId}"`,
    ...nameDetails(name),
  },
});

/**
 * Source-of-truth helpers driven by {@link IMMUTABLE_RULE_FIELDS}. They keep
 * `upsertRule` (PUT — rejects mutation) and `buildUpdateRuleAttributes`
 * (PATCH — silently preserves) honest as the rule schema evolves: adding a
 * new immutable field only requires updating the registry in
 * `@kbn/alerting-v2-schemas`.
 */

/**
 * Throws `Boom.conflict` if the parsed request body tries to change any
 * field declared immutable in {@link IMMUTABLE_RULE_FIELDS}. Intended for
 * PUT-style upsert callers that send a full resource. All changed fields
 * are reported in a single error so the client sees the full diff.
 */
export function assertImmutableUnchanged(
  parsed: Pick<CreateRuleData, ImmutableRuleField>,
  existing: Pick<RuleSavedObjectAttributes, ImmutableRuleField>
): void {
  const changed = IMMUTABLE_RULE_FIELDS.filter((field) => !isEqual(parsed[field], existing[field]));
  if (changed.length > 0) {
    throw Boom.conflict(`Some fields cannot be changed after creation: ${changed.join(', ')}.`, {
      code: ALERTING_ERROR_CODES.IMMUTABLE_FIELDS_CHANGED,
      details: { fields: changed },
    });
  }
}

/**
 * Returns just the immutable fields from `attrs`, suitable for spreading at
 * the end of an attribute builder so subsequent code cannot accidentally
 * overwrite them.
 */
export function pickImmutable(
  attrs: Pick<RuleSavedObjectAttributes, ImmutableRuleField>
): Pick<RuleSavedObjectAttributes, ImmutableRuleField> {
  return Object.fromEntries(IMMUTABLE_RULE_FIELDS.map((field) => [field, attrs[field]])) as Pick<
    RuleSavedObjectAttributes,
    ImmutableRuleField
  >;
}

/**
 * For SO fields whose schema is `maybe(nullable(...))` — null is a valid
 * stored value meaning "explicitly cleared".
 */
function applyNullableUpdate<T>(
  value: T | null | undefined,
  existing: T | undefined
): T | null | undefined {
  if (value === undefined) return existing;
  return value; // null (clear) or new value (set)
}

/**
 * For SO fields whose schema is `maybe(...)` without `nullable()` — null
 * from the API means "clear", but must be stored as `undefined` (absent).
 */
function nullToUndefined<T>(value: T | null | undefined, existing: T | undefined): T | undefined {
  if (value === null) return undefined;
  if (value === undefined) return existing;
  return value;
}

function nullToEmptyArray<T>(
  value: T[] | null | undefined,
  existing: T[] | undefined
): T[] | undefined {
  if (value === null) return [];
  if (value === undefined) return existing;
  return value;
}

/**
 * A composed query may omit `breach` over the API to mean "every row returned
 * by `base` breaches". Storage always writes the block with an empty segment
 * instead: every shipped model version requires `query.breach`, so omitting it
 * on disk would make the rule unreadable by an older Kibana during a rollback
 * or a zero-downtime upgrade — and `find` fails as a whole rather than per
 * document, so one such rule would break the entire rules list.
 */
export const toStoredQuery = (query: Query): RuleSavedObjectAttributes['query'] =>
  query.format === 'composed'
    ? { ...query, breach: { segment: query.breach?.segment ?? '' } }
    : query;

/** Inverse of {@link toStoredQuery}: an empty stored segment reads back as an omitted block. */
const toApiQuery = (query: RuleSavedObjectAttributes['query']): Query => {
  if (query.format !== 'composed' || query.breach.segment.trim()) {
    return query;
  }
  const { breach, ...withoutBreach } = query;
  return withoutBreach;
};

/**
 * Converts a create-rule API body into saved object attributes. The body's
 * query must already be settled by `resolveCreateRuleBuilder`, since a
 * builder-authored body carries its parameters instead of a query.
 */
export function transformCreateRuleBodyToRuleSoAttributes(
  data: ResolvedCreateRuleData,
  serverFields: {
    enabled: boolean;
    createdBy: string | null;
    createdAt: string;
    updatedBy: string | null;
    updatedAt: string;
    version: number;
  }
): RuleSavedObjectAttributes {
  const { version, ...restServerFields } = serverFields;
  return {
    kind: data.kind,
    metadata: {
      name: data.metadata.name,
      description: data.metadata.description,
      owner: data.metadata.owner,
      tags: data.metadata.tags,
      builder_type: data.metadata.builder_type,
      builder_fields: data.metadata.builder_fields,
      version,
    },
    time_field: data.time_field,
    schedule: {
      every: data.schedule.every,
      lookback: data.schedule.lookback,
    },
    query: toStoredQuery(data.query),
    recovery_strategy: data.recovery_strategy,
    no_data_strategy: data.no_data_strategy,
    state_transition: data.state_transition,
    grouping: data.grouping,
    artifacts: data.artifacts,
    ...restServerFields,
  };
}

/**
 * Builds the complete next saved-object attributes for a rule update.
 *
 * The caller is expected to persist these with `mergeAttributes: false` so
 * the SO client does not deep-merge nested objects (which would silently
 * preserve stale sub-fields).
 *
 * - `undefined` in the update payload → keeps the existing value.
 * - `null` → clears the field (`undefined` for `maybe()`-only fields,
 *   `null` for fields whose SO schema includes `nullable()`).
 */
export function buildUpdateRuleAttributes(
  existingAttrs: RuleSavedObjectAttributes,
  updateData: UpdateRuleData,
  serverFields: { updatedBy: string | null; updatedAt: string; version: number }
): RuleSavedObjectAttributes {
  const { version, ...restServerFields } = serverFields;
  return {
    ...existingAttrs,
    metadata: {
      ...existingAttrs.metadata,
      ...updateData.metadata,
      // `null` → clear (undefined): the SO schema uses `maybe()` without
      // `nullable()`. Builder resolution has already rejected the combinations
      // that would leave the pair inconsistent.
      builder_type: nullToUndefined(
        updateData.metadata?.builder_type,
        existingAttrs.metadata.builder_type
      ),
      builder_fields: nullToUndefined(
        updateData.metadata?.builder_fields,
        existingAttrs.metadata.builder_fields
      ),
      // `null` clears all tags. The SO schema is `maybe(...)` without
      // `nullable()`, so the cleared value must be stored as `undefined`.
      tags: nullToUndefined(updateData.metadata?.tags, existingAttrs.metadata.tags),
      version,
    },
    time_field: updateData.time_field ?? existingAttrs.time_field,
    schedule: { ...existingAttrs.schedule, ...updateData.schedule },
    // `query` - callers must send a complete new shape (we can't merge across formats),
    // so omitted = preserved, present = full replacement.
    query: updateData.query !== undefined ? toStoredQuery(updateData.query) : existingAttrs.query,
    // `null` → clear (undefined). SO schema uses `maybe()` without `nullable()`.
    recovery_strategy: nullToUndefined(
      updateData.recovery_strategy,
      existingAttrs.recovery_strategy
    ),
    no_data_strategy: nullToUndefined(updateData.no_data_strategy, existingAttrs.no_data_strategy),
    // `null` → clear (null). SO schema uses `maybe(nullable())`.
    state_transition: applyNullableUpdate(
      updateData.state_transition,
      existingAttrs.state_transition
    ),
    // `null` → clear (undefined). SO schema uses `maybe()` without `nullable()`.
    grouping: nullToUndefined(updateData.grouping, existingAttrs.grouping),
    artifacts: nullToEmptyArray(updateData.artifacts, existingAttrs.artifacts),
    // `enabled` is never writable via update — lifecycle transitions are owned
    // exclusively by enableRule/disableRule, so the stored value is preserved.
    enabled: existingAttrs.enabled,
    // Server-managed fields — preserved as-is except timestamps and user.
    createdBy: existingAttrs.createdBy,
    createdAt: existingAttrs.createdAt,
    ...restServerFields,
    // Immutable fields are forced from storage last, so no preceding override
    // can leak through if someone adds a new immutable field to the registry.
    ...pickImmutable(existingAttrs),
  };
}

/**
 * Re-checks the create schema's cross-field invariants against the merged
 * update attributes (the update body alone can't, since `kind` is immutable and
 * `query`/strategy fields update independently). Throws on the first violation.
 *
 * Excludes the `state_transition`/`kind` invariant, which `RulesClient`
 * validates against the update body directly.
 */
export function validateMergedRuleAttributes(
  ruleId: string,
  attrs: RuleSavedObjectAttributes
): void {
  const invariants: Array<{
    valid: boolean;
    message: string;
    code: string;
    details: Record<string, unknown>;
  }> = [
    {
      valid: isSignalUsingStandaloneFormat(attrs),
      message: 'kind "signal" requires query.format "standalone".',
      code: ALERTING_ERROR_CODES.INVALID_SIGNAL_RULE,
      details: { rule_id: ruleId, rule_kind: attrs.kind },
    },
    {
      valid: isSignalQueryBreachOnly(attrs),
      message: 'Signal rules cannot set recovery_strategy or no_data_strategy.',
      code: ALERTING_ERROR_CODES.INVALID_SIGNAL_RULE,
      details: { rule_id: ruleId, rule_kind: attrs.kind },
    },
    {
      valid: isRecoveryQueryConsistentWithStrategy(attrs),
      message: 'query.recovery is only allowed when recovery_strategy is "query".',
      code: ALERTING_ERROR_CODES.INVALID_RULE_QUERY_CONFIG,
      details: { rule_id: ruleId },
    },
    {
      valid: isRecoveryQueryProvidedForStrategy(attrs),
      message: 'query.recovery is required when recovery_strategy is "query".',
      code: ALERTING_ERROR_CODES.INVALID_RULE_QUERY_CONFIG,
      details: { rule_id: ruleId },
    },
    {
      valid: isNoDataQueryConsistentWithStrategy(attrs),
      message: 'query.no_data is only allowed when no_data_strategy is set to a non-"none" value.',
      code: ALERTING_ERROR_CODES.INVALID_RULE_QUERY_CONFIG,
      details: { rule_id: ruleId },
    },
    {
      valid: isNoDataQueryProvidedForStrategy(attrs),
      message:
        'query.no_data is required when no_data_strategy is not "none" for standalone-format rules.',
      code: ALERTING_ERROR_CODES.INVALID_RULE_QUERY_CONFIG,
      details: { rule_id: ruleId },
    },
  ];

  for (const invariant of invariants) {
    if (!invariant.valid) {
      throw Boom.badRequest(invariant.message, {
        code: invariant.code,
        details: invariant.details,
      });
    }
  }
}

/**
 * Converts saved object attributes into the public API response shape.
 */
export function transformRuleSoAttributesToRuleApiResponse(
  id: string,
  attrs: RuleSavedObjectAttributes,
  version?: string
): RuleResponse {
  return {
    id,
    version,
    kind: attrs.kind,
    metadata: {
      name: attrs.metadata.name,
      description: attrs.metadata.description,
      owner: attrs.metadata.owner,
      tags: attrs.metadata.tags,
      builder_type: attrs.metadata.builder_type,
      builder_fields: attrs.metadata.builder_fields,
      version: attrs.metadata.version ?? RULE_VERSION_FALLBACK,
    },
    time_field: attrs.time_field,
    schedule: {
      every: attrs.schedule.every,
      lookback: attrs.schedule.lookback,
    },
    query: toApiQuery(attrs.query),
    recovery_strategy: attrs.recovery_strategy,
    no_data_strategy: attrs.no_data_strategy,
    state_transition: attrs.state_transition,
    grouping: attrs.grouping,
    // Project to the public artifact contract. Migrated rules may still carry a
    // legacy `value` on disk for model-version rollback; echoing it in the API
    // response makes round-trip updates fail zod `.strict()` validation.
    artifacts: attrs.artifacts?.map(({ id: artifactId, type, data }) => ({
      id: artifactId,
      type,
      data,
    })),
    enabled: attrs.enabled,
    created_by: attrs.createdBy,
    created_at: attrs.createdAt,
    updated_by: attrs.updatedBy,
    updated_at: attrs.updatedAt,
  };
}
