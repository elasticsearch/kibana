/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * This file hosts two distinct catalogs:
 *
 * - {@link ALERTING_V2_ERROR_CODES} — codes that travel out over HTTP. Part
 *   of the public API contract; see the README at
 *   `x-pack/platform/plugins/shared/alerting_v2/server/lib/errors/README.md`
 *   for status / details shape per code.
 * - {@link ALERTING_V2_LOG_CODES} — codes attached to `logger.error(...)` /
 *   `logger.warn(...)` calls for fire-and-forget failure paths (degraded but
 *   recoverable). Stable identifiers for log-based monitoring; never
 *   serialized into HTTP responses.
 *
 * Both catalogs treat renaming or removing a code as a breaking change to
 * downstream consumers (API clients in one case, observability tooling in
 * the other). Adding new codes is backwards compatible.
 */
export const ALERTING_V2_ERROR_CODES = {
  // ────────────────────────── Rules ──────────────────────────
  /** A rule with the given identifier does not exist. */
  RULE_NOT_FOUND: 'RULE_NOT_FOUND',
  /** A rule with the given identifier already exists. */
  RULE_ALREADY_EXISTS: 'RULE_ALREADY_EXISTS',
  /** A rule was modified by another writer since it was loaded. */
  RULE_VERSION_CONFLICT: 'RULE_VERSION_CONFLICT',
  /** The submitted rule body failed schema validation. */
  INVALID_RULE_DATA: 'INVALID_RULE_DATA',
  /** `state_transition` cannot be applied to the rule's `kind`. */
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  /** Bulk rule operation params combine `ids` with `filter` / `search`. */
  INVALID_BULK_PARAMS: 'INVALID_BULK_PARAMS',
  /** PUT body changed a field flagged as immutable. */
  IMMUTABLE_FIELDS_CHANGED: 'IMMUTABLE_FIELDS_CHANGED',
  /** Filter expression referenced an unknown field. */
  INVALID_FILTER_FIELD: 'INVALID_FILTER_FIELD',
  /** Filter expression used an unsupported KQL function. */
  UNSUPPORTED_FILTER_FUNCTION: 'UNSUPPORTED_FILTER_FUNCTION',
  /** The rule's `schedule.every` is shorter than the configured minimum interval. */
  SCHEDULE_INTERVAL_TOO_SHORT: 'SCHEDULE_INTERVAL_TOO_SHORT',
  /** Scheduling the rule would exceed the configured maximum rule runs per minute. */
  MAX_SCHEDULES_PER_MINUTE_EXCEEDED: 'MAX_SCHEDULES_PER_MINUTE_EXCEEDED',

  // ────────────────────── Action policies ────────────────────
  /** An action policy with the given identifier does not exist. */
  ACTION_POLICY_NOT_FOUND: 'ACTION_POLICY_NOT_FOUND',
  /** An action policy with the given identifier already exists. */
  ACTION_POLICY_ALREADY_EXISTS: 'ACTION_POLICY_ALREADY_EXISTS',
  /** An action policy was modified by another writer since it was loaded. */
  ACTION_POLICY_VERSION_CONFLICT: 'ACTION_POLICY_VERSION_CONFLICT',
  /** The submitted action policy body failed schema validation. */
  INVALID_ACTION_POLICY_DATA: 'INVALID_ACTION_POLICY_DATA',
  /** A user-supplied date string failed ISO-8601 parsing. */
  INVALID_DATE_STRING: 'INVALID_DATE_STRING',

  // ──────────────────────── Alert actions ────────────────────
  /** No alert event matched the supplied `group_hash` (and `episode_id`). */
  ALERT_EVENT_NOT_FOUND: 'ALERT_EVENT_NOT_FOUND',

  // ──────────────────── Rule doctor insights ─────────────────
  /** A rule doctor insight with the given identifier does not exist. */
  INSIGHT_NOT_FOUND: 'INSIGHT_NOT_FOUND',

  // ───────────────────────── Engine state ────────────────────
  /**
   * The alerting engine is administratively disabled via the
   * `alerting:v2:enabled` advanced setting. Emitted by every HTTP route
   * with status 503 before any route-specific work runs.
   */
  ALERTING_DISABLED: 'ALERTING_DISABLED',

  // ──────────────────────────── Generic ──────────────────────
  /** Catch-all 5xx code when no domain-specific code applies. */
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
} as const;

export type AlertingV2ErrorCode =
  (typeof ALERTING_V2_ERROR_CODES)[keyof typeof ALERTING_V2_ERROR_CODES];

/**
 * Catalog of stable, machine-readable codes attached to `logger.error(...)` /
 * `logger.warn(...)` calls for fire-and-forget failure paths. These never
 * become part of an HTTP response — they exist so log-based monitoring can
 * group and alert on specific degraded code paths without parsing free-form
 * `message` strings.
 *
 * Naming convention: `<DOMAIN>_<WHAT_FAILED>`. Read-path failures that
 * degrade gracefully should encode the degradation (e.g.
 * `*_LOOKUP_FAILED` — the page was still returned, just without that piece
 * of enrichment).
 */
export const ALERTING_V2_LOG_CODES = {
  // ─────────────── Execution history (graceful degradation) ──────────────
  /**
   * One or more `task-run` hits returned by Elasticsearch on the rule
   * executions read path failed structural normalization (missing hit id,
   * malformed `kibana.task.id`, missing `event.start`, unrecognized
   * `event.outcome`). The upstream filter on `kibana.task.type` is meant
   * to prevent this. Emission of this code signals that the invariant
   * has been violated and the read path silently shrank a page.
   */
  EXECUTION_HISTORY_NORMALIZER_REJECTED_EVENTS: 'EXECUTION_HISTORY_NORMALIZER_REJECTED_EVENTS',
  /**
   * Action-policy id resolution failed while building the search filter for
   * the action-policy execution-history search. The search proceeds without
   * policy-id matches contributed by the search term.
   */
  EXECUTION_HISTORY_SEARCH_POLICY_LOOKUP_FAILED: 'EXECUTION_HISTORY_SEARCH_POLICY_LOOKUP_FAILED',
  /**
   * Rule id resolution failed while building the search filter for the
   * action-policy execution-history search. The search proceeds without
   * rule-id matches contributed by the search term.
   */
  EXECUTION_HISTORY_SEARCH_RULE_LOOKUP_FAILED: 'EXECUTION_HISTORY_SEARCH_RULE_LOOKUP_FAILED',
  /**
   * Action-policy name lookup failed while enriching a page of action-policy
   * execution events. The page is still returned; affected policy names
   * degrade to `null`.
   */
  EXECUTION_HISTORY_POLICY_LOOKUP_FAILED: 'EXECUTION_HISTORY_POLICY_LOOKUP_FAILED',
  /**
   * Rule name lookup failed while enriching a page of action-policy
   * execution events. The page is still returned; affected rule names
   * degrade to `null`.
   */
  EXECUTION_HISTORY_RULE_LOOKUP_FAILED: 'EXECUTION_HISTORY_RULE_LOOKUP_FAILED',
  /**
   * Workflow name lookup failed while enriching a page of action-policy
   * execution events. The page is still returned; affected workflow names
   * degrade to `null`.
   */
  EXECUTION_HISTORY_WORKFLOW_LOOKUP_FAILED: 'EXECUTION_HISTORY_WORKFLOW_LOOKUP_FAILED',
} as const;

export type AlertingV2LogCode = (typeof ALERTING_V2_LOG_CODES)[keyof typeof ALERTING_V2_LOG_CODES];
