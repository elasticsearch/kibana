/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Catalog of stable, machine-readable error codes returned by the routes.
 * These codes are part of the public API contract. Adding new codes is
 * backwards compatible, while renaming or removing a code is a breaking change.
 *
 * Each code's metadata (HTTP status, when it's thrown, `details` shape) is
 * documented in the README at
 * `x-pack/platform/plugins/shared/alerting_v2/server/lib/errors/README.md`.
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
