/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * This file hosts two distinct catalogs:
 *
 * - {@link ALERTING_ERROR_CODES} — codes that travel out over HTTP. Part
 *   of the public API contract; see the README at
 *   `x-pack/platform/plugins/shared/alerting_v2/server/lib/errors/README.md`
 *   for status / details shape per code.
 * - {@link ALERTING_LOG_CODES} — codes attached to `logger.error(...)` /
 *   `logger.warn(...)` calls for fire-and-forget failure paths (degraded but
 *   recoverable). Stable identifiers for log-based monitoring; never
 *   serialized into HTTP responses.
 *
 * Both catalogs treat renaming or removing a code as a breaking change to
 * downstream consumers (API clients in one case, observability tooling in
 * the other). Adding new codes is backwards compatible.
 */
export const ALERTING_ERROR_CODES = {
  // ────────────────────────── Rules ──────────────────────────
  /** A rule with the given identifier does not exist. */
  RULE_NOT_FOUND: 'RULE_NOT_FOUND',
  /** A rule with the given identifier already exists. */
  RULE_ALREADY_EXISTS: 'RULE_ALREADY_EXISTS',
  /** A rule was modified by another writer since it was loaded. */
  RULE_VERSION_CONFLICT: 'RULE_VERSION_CONFLICT',
  /** The submitted rule body failed schema validation. */
  INVALID_RULE_DATA: 'INVALID_RULE_DATA',
  /** A registered artifact's `data` failed its type-specific schema validation. */
  INVALID_ARTIFACT_DATA: 'INVALID_ARTIFACT_DATA',
  /** `metadata.builder_type` does not match any registered rule builder. */
  UNKNOWN_BUILDER_TYPE: 'UNKNOWN_BUILDER_TYPE',
  /** `metadata.builder_fields` failed the schema registered for its `builder_type`. */
  INVALID_BUILDER_FIELDS: 'INVALID_BUILDER_FIELDS',
  /**
   * A builder accepted its fields but could not turn them into a valid query —
   * e.g. an ES|QL fragment the bounded schema accepts as a string but the
   * parser rejects.
   */
  BUILDER_QUERY_GENERATION_FAILED: 'BUILDER_QUERY_GENERATION_FAILED',
  /** `state_transition` cannot be applied to the rule's `kind`. */
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  /** A signal rule's merged shape violates signal constraints. */
  INVALID_SIGNAL_RULE: 'INVALID_SIGNAL_RULE',
  /**
   * A rule's merged shape has a recovery/no-data query block that is
   * inconsistent with its `recovery_strategy`/`no_data_strategy`.
   */
  INVALID_RULE_QUERY_CONFIG: 'INVALID_RULE_QUERY_CONFIG',
  /**
   * A by-query bulk operation was submitted with `force: true` and the filter
   * matched more resources than a single request may process. Rejected before
   * any resource is mutated so the caller sees an all-or-nothing outcome (no
   * partial execution) — the caller must narrow the filter or split the
   * operation into multiple requests.
   */
  BULK_QUERY_MATCH_LIMIT_EXCEEDED: 'BULK_QUERY_MATCH_LIMIT_EXCEEDED',
  /**
   * A builder rule's query was changed without explicitly clearing
   * `metadata.builder_type`. The transition to ES|QL mode must be explicit.
   */
  BUILDER_TYPE_NOT_CLEARED: 'BUILDER_TYPE_NOT_CLEARED',
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
  /**
   * A bulk operation persisted the rule saved object, but the paired Task
   * Manager call failed, leaving the rule's task state diverged from its saved object.
   * The saved-object change already committed; this entry flags the drift so the client
   * can detect and (optionally) retry.
   */
  TASK_MANAGER_DRIFT: 'TASK_MANAGER_DRIFT',
  /** A manual "run now" was requested for a disabled rule (it has no executor task to run). */
  RULE_DISABLED: 'RULE_DISABLED',
  /** A manual "run now" was requested for a rule whose executor task is already running. */
  RULE_ALREADY_RUNNING: 'RULE_ALREADY_RUNNING',
  /** A manual "run now" raced with another writer updating the executor task; retry. */
  RULE_RUN_CONFLICT: 'RULE_RUN_CONFLICT',
  /**
   * A manual "run now" failed for an unexpected reason (e.g. the executor task
   * is missing despite the rule being enabled). Catch-all for `runSoon` errors
   * that are not already-running or conflict.
   */
  RULE_RUN_ERROR: 'RULE_RUN_ERROR',
  /** A rule change-history event with the given identifier does not exist. */
  RULE_CHANGE_NOT_FOUND: 'RULE_CHANGE_NOT_FOUND',
  /**
   * The rule change-history data stream is not initialized (or change history
   * is disabled), so history cannot be read.
   */
  RULE_CHANGE_HISTORY_UNAVAILABLE: 'RULE_CHANGE_HISTORY_UNAVAILABLE',

  // ────────────────────── Rule templates ─────────────────────
  /** A rule template with the given identifier does not exist. */
  RULE_TEMPLATE_NOT_FOUND: 'RULE_TEMPLATE_NOT_FOUND',

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
  /**
   * A delete could not queue the action policy's API key for invalidation, so
   * the policy was left in place rather than deleted. The single delete throws
   * it; bulk delete reports it per item.
   */
  API_KEY_INVALIDATION_FAILED: 'API_KEY_INVALIDATION_FAILED',

  // ──────────────────────── Alert actions ────────────────────
  /** No alert event matched the supplied `group_hash` (and `episode_id`). */
  ALERT_EVENT_NOT_FOUND: 'ALERT_EVENT_NOT_FOUND',
  /**
   * No alert event matched the supplied `group_hash`. Bulk-only refinement of
   * `ALERT_EVENT_NOT_FOUND` that pins the miss to the group (rather than a
   * superseded episode) so a client can tell the two apart per item.
   */
  ALERT_GROUP_NOT_FOUND: 'ALERT_GROUP_NOT_FOUND',
  /**
   * No alert event matched the supplied `episode_id`. On the legacy bulk
   * route it also covers a targeted `episode_id` superseded by a newer
   * episode of the group.
   */
  ALERT_EPISODE_NOT_FOUND: 'ALERT_EPISODE_NOT_FOUND',
  /**
   * The episode exists but is not the latest episode of its series. Lifecycle
   * actions (`activate` / `deactivate`) only accept the latest episode.
   */
  ALERT_EPISODE_NOT_LATEST: 'ALERT_EPISODE_NOT_LATEST',
  /** The requested action is incompatible with the episode's current `episode.status`. */
  INVALID_EPISODE_STATE_TRANSITION: 'INVALID_EPISODE_STATE_TRANSITION',

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

export type AlertingV2ErrorCode = (typeof ALERTING_ERROR_CODES)[keyof typeof ALERTING_ERROR_CODES];

/**
 * Catalog of stable, machine-readable codes attached to `logger.error(...)` /
 * `logger.warn(...)` calls for fire-and-forget failure paths. These never
 * become part of an HTTP response — they exist so log-based monitoring can
 * group and alert on specific degraded code paths without parsing free-form
 * `message` strings.
 *
 * Naming convention: `<DOMAIN>_<WHAT_HAPPENED>`.
 *
 * The domain matches the subsystem that owns the failure, so an operator can
 * filter a whole area with a prefix: `RULE_*` (rule executor / rules client),
 * `DIRECTOR_*`, `DISPATCH_*`, `POLICY_*`, `EXECUTION_HISTORY_*`, `EVENTS_*`,
 * `STORAGE_*`, `QUERY_*`, `RESOURCES_*`, `MAINTENANCE_WINDOW_*`,
 * `SAVED_OBJECTS_*`, `AGENT_BUILDER_*`, `TASKS_*`.
 *
 * The suffix encodes the outcome, from a closed vocabulary:
 * - `warn` (degraded but continued): `_FAILED`, `_SKIPPED`, `_TIMED_OUT`,
 *   `_NOT_FOUND`, `_LOOKUP_FAILED`, `_DEGRADED`, `_INVALID`, `_UNMAPPED`.
 * - `error` (operation could not complete): `_FAILED`, `_UNAVAILABLE`,
 *   `_INVALID`, `_UNRECOVERABLE`.
 */
export const ALERTING_LOG_CODES = {
  // ─────────────────────────────── Dispatcher steps ──────────────────────
  /**
   * Hydrate episode data step: some episodes had no matching .rule-events row;
   * data will be absent for those episodes
   */
  HYDRATE_EPISODE_DATA_STEP_MISSING_RULE_EVENTS_ROW:
    'HYDRATE_EPISODE_DATA_STEP_MISSING_RULE_EVENTS_ROW',
  // ──────────────── Action policy API key invalidation ───────────────
  /**
   * A delete refused to remove one or more action policies because their API
   * keys could not be queued for invalidation. Nothing was destroyed, so the
   * keys are still referenced and a retry can invalidate them — but the
   * pending-invalidation saved object store is failing writes and needs
   * attention.
   */
  ACTION_POLICY_DELETE_BLOCKED_BY_API_KEY_INVALIDATION:
    'ACTION_POLICY_DELETE_BLOCKED_BY_API_KEY_INVALIDATION',
  /**
   * A delete queued action policy API keys for invalidation and then failed
   * to remove the matching policies. The policies survive with keys that are
   * about to be invalidated, so they will stop being able to dispatch until
   * their keys are rotated.
   */
  ACTION_POLICY_API_KEY_INVALIDATION_DIVERGED: 'ACTION_POLICY_API_KEY_INVALIDATION_DIVERGED',

  // ─────────────── Execution history (graceful degradation) ──────────────
  /**
   * One or more `task-run` hits returned by Elasticsearch on the rule
   * executions read path failed structural normalization (missing hit id,
   * malformed `kibana.task.id`, missing `event.start`, unrecognized
   * `event.outcome`). The upstream filter on `kibana.task.type` is meant
   * to prevent this. Emission of this code signals that the invariant
   * has been violated and the read path silently shrank a page.
   */
  EXECUTION_HISTORY_NORMALIZER_DEGRADED: 'EXECUTION_HISTORY_NORMALIZER_DEGRADED',
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

  // ────────── Domain event bus, subscribers & publishers (fan-out) ─────────
  /**
   * The underlying event-bus emitter surfaced an `'error'` event (e.g. an
   * unhandled rejection captured by `captureRejections`). Caught by the bus's
   * permanent defensive listener so it can never crash the process.
   */
  EVENTS_BUS_EMITTER_FAILED: 'EVENTS_BUS_EMITTER_FAILED',
  /**
   * A subscribed handler threw (sync throw or rejected promise) while
   * processing a published domain event. The failure is isolated: sibling
   * handlers for the same event still run and the publisher is unaffected.
   */
  EVENTS_BUS_HANDLER_FAILED: 'EVENTS_BUS_HANDLER_FAILED',
  /**
   * The rule-lifecycle → workflow subscriber failed to emit a workflow event
   * for a rule domain event. The originating rule operation already
   * succeeded; only the workflow fan-out for this event was lost.
   */
  EVENTS_RULE_WORKFLOW_SUBSCRIBER_FAILED: 'EVENTS_RULE_WORKFLOW_SUBSCRIBER_FAILED',
  /**
   * The alert-action → workflow subscriber failed to emit a workflow event
   * for an alert-action domain event. The originating action already
   * succeeded; only the workflow fan-out for this event was lost.
   */
  EVENTS_ALERT_ACTION_WORKFLOW_SUBSCRIBER_FAILED: 'EVENTS_ALERT_ACTION_WORKFLOW_SUBSCRIBER_FAILED',
  /**
   * The rule-executor → workflow subscriber failed to emit a workflow event
   * for a rule-execution domain event. The rule run already completed; only
   * the workflow fan-out for this event was lost.
   */
  EVENTS_RULE_EXECUTOR_WORKFLOW_SUBSCRIBER_FAILED:
    'EVENTS_RULE_EXECUTOR_WORKFLOW_SUBSCRIBER_FAILED',
  /**
   * The rule-changes-history subscriber failed to record a change entry for a
   * rule domain event. The rule operation itself already succeeded; only the
   * audit entry for this change was lost.
   */
  EVENTS_RULE_CHANGES_HISTORY_SUBSCRIBER_FAILED: 'EVENTS_RULE_CHANGES_HISTORY_SUBSCRIBER_FAILED',
  /**
   * A domain event was refused by the bus because its `type` collides with a
   * reserved emitter event name. The publisher continued; no subscriber ran.
   */
  EVENTS_BUS_PUBLISH_SKIPPED: 'EVENTS_BUS_PUBLISH_SKIPPED',
  /**
   * An alert action carried an `action_type` with no domain-event mapping, so
   * no event was published for it. The action itself already applied; only
   * the workflow fan-out for that action type is missing, which happens when
   * the action-type vocabulary grows ahead of the publisher's mapping.
   */
  EVENTS_ALERT_ACTION_TYPE_UNMAPPED: 'EVENTS_ALERT_ACTION_TYPE_UNMAPPED',

  // ──────────────────────────── Dispatcher ───────────────────────────
  /**
   * The action policy backing a dispatch group has no API key, so the group
   * cannot be dispatched under the policy owner's credentials. The group is
   * skipped; the rest of the dispatch tick continues.
   */
  DISPATCH_POLICY_MISSING_API_KEY: 'DISPATCH_POLICY_MISSING_API_KEY',
  /**
   * The workflow referenced by an action policy destination no longer exists.
   * The group is skipped; the rest of the dispatch tick continues.
   */
  DISPATCH_WORKFLOW_NOT_FOUND: 'DISPATCH_WORKFLOW_NOT_FOUND',
  /**
   * The workflow referenced by an action policy destination exists but is
   * disabled. The group is skipped until an operator enables the workflow.
   */
  DISPATCH_WORKFLOW_DISABLED: 'DISPATCH_WORKFLOW_DISABLED',
  /** Scheduling a workflow execution for a dispatch group failed. */
  DISPATCH_WORKFLOW_SCHEDULE_FAILED: 'DISPATCH_WORKFLOW_SCHEDULE_FAILED',
  /**
   * A dispatch group failed for a reason not covered by a more specific code
   * (outer catch of the per-group dispatch loop). Sibling groups still run.
   */
  DISPATCH_GROUP_UNHANDLED_ERROR: 'DISPATCH_GROUP_UNHANDLED_ERROR',
  /**
   * A dispatch pipeline step threw. The failing step's name is carried in
   * `labels.step` — this code stays stable across steps so a single filter
   * returns every step failure.
   */
  DISPATCH_STEP_FAILED: 'DISPATCH_STEP_FAILED',
  /**
   * An action policy's `throttle.interval` could not be parsed, so the group
   * was treated as if the interval had elapsed. Throttling is effectively
   * bypassed for that policy until the interval is corrected.
   */
  DISPATCH_THROTTLE_INTERVAL_INVALID: 'DISPATCH_THROTTLE_INTERVAL_INVALID',
  /**
   * An action policy could not be read while assembling the policies for a
   * dispatch tick. The policy is excluded from dispatch consideration; the
   * remaining policies still dispatch.
   */
  DISPATCH_POLICY_LOOKUP_FAILED: 'DISPATCH_POLICY_LOOKUP_FAILED',
  /**
   * The dispatcher has no persisted event watermark (cold start or wiped task
   * state). The first scan starts from `startedAt − OVERLAP_WINDOW_MINUTES`.
   * Rule events older than that will not be dispatched.
   */
  DISPATCHER_COLD_START: 'DISPATCHER_COLD_START',
  /**
   * The self-imposed tick deadline (TICK_DEADLINE_MS) fired before the pipeline
   * completed. The pipeline was aborted cooperatively; the returned watermark is
   * safe. This is expected under sustained high load — it is not an error.
   */
  DISPATCHER_TICK_DEADLINE_EXCEEDED: 'DISPATCHER_TICK_DEADLINE_EXCEEDED',
  /**
   * The watermark has not advanced for STUCK_TICK_LIMIT consecutive ticks.
   * The dispatcher will write terminal `unmatched` records for the blocking
   * episodes (which will NOT be dispatched) and force-advance the watermark.
   */
  DISPATCHER_WATERMARK_STUCK: 'DISPATCHER_WATERMARK_STUCK',
  /**
   * The persisted eventWatermark is not a valid ISO date string. The dispatcher
   * will fall back to cold-start behaviour (scan from now − OVERLAP_WINDOW_MINUTES).
   */
  DISPATCHER_INVALID_WATERMARK: 'DISPATCHER_INVALID_WATERMARK',
  /**
   * The escape hatch fired but the pipeline stopped before FetchEpisodesStep so
   * no episodes are known for the window, and watermark lag is still within one
   * max scan window. The watermark is held; the stuck counter is reset so
   * transient infra pressure can recover without dropping the window.
   */
  DISPATCHER_ESCAPE_HATCH_PRE_FETCH_STUCK: 'DISPATCHER_ESCAPE_HATCH_PRE_FETCH_STUCK',
  /**
   * The pre-fetch escape hatch fired and watermark lag already exceeds one max
   * scan window. The window is force-advanced without knowing its episodes;
   * unread events in that window are skipped so the dispatcher cannot stall
   * indefinitely.
   */
  DISPATCHER_ESCAPE_HATCH_PRE_FETCH_FORCED_ADVANCE:
    'DISPATCHER_ESCAPE_HATCH_PRE_FETCH_FORCED_ADVANCE',
  /**
   * The escape hatch attempted to write `unmatched` records but the bulkIndexDocs
   * call failed. The watermark is held so episodes will be retried next tick.
   */
  DISPATCHER_ESCAPE_HATCH_WRITE_FAILED: 'DISPATCHER_ESCAPE_HATCH_WRITE_FAILED',

  // ────────────────────────────── Director ───────────────────────────
  /**
   * Releasing the per-run alert-state cache failed after processing. Logged
   * and swallowed so it can never mask the error that ended the run.
   */
  DIRECTOR_CLEANUP_FAILED: 'DIRECTOR_CLEANUP_FAILED',
  /**
   * A rule's `pending_timeframe` / `recovering_timeframe` could not be
   * parsed, so the timeframe threshold was ignored and the transition fell
   * back to count-only semantics.
   */
  DIRECTOR_TIMEFRAME_INVALID: 'DIRECTOR_TIMEFRAME_INVALID',

  // ────────────────────────── Action policies ────────────────────────
  /**
   * An action policy's KQL matcher failed to evaluate against an alert event.
   * The policy is treated as a no-match so one malformed matcher cannot block
   * the evaluation of the remaining policies.
   */
  POLICY_MATCHER_KQL_INVALID: 'POLICY_MATCHER_KQL_INVALID',
  /**
   * A superseded action policy API key could not be queued for invalidation.
   * The policy update itself already committed, so the old credential stays
   * valid until an operator revokes it.
   */
  POLICY_API_KEY_INVALIDATION_FAILED: 'POLICY_API_KEY_INVALIDATION_FAILED',
  /**
   * An action policy's stored auth could not be decrypted, so its API key
   * could not be identified for invalidation. The superseded credential stays
   * valid until an operator revokes it.
   */
  POLICY_API_KEY_LOOKUP_FAILED: 'POLICY_API_KEY_LOOKUP_FAILED',

  // ─────────────────────────── Rule executor ─────────────────────────
  /**
   * A rule-execution pipeline step threw. The failing step's name is carried
   * in `labels.step` — this code stays stable across steps so a single filter
   * returns every step failure.
   */
  RULE_EXECUTION_STEP_FAILED: 'RULE_EXECUTION_STEP_FAILED',
  /**
   * A metrics recorder threw while observing a pipeline step. Instrumentation
   * only: the rule execution itself is unaffected.
   */
  RULE_EXECUTION_METRICS_RECORDER_FAILED: 'RULE_EXECUTION_METRICS_RECORDER_FAILED',
  /**
   * A rule-execution lifecycle event could not be published because the
   * pipeline finished without the state the event is built from.
   */
  RULE_EXECUTION_EVENT_PUBLISH_SKIPPED: 'RULE_EXECUTION_EVENT_PUBLISH_SKIPPED',
  /**
   * Publishing a rule-execution lifecycle event to the domain event bus
   * failed. The rule run itself already completed.
   */
  RULE_EXECUTION_EVENT_PUBLISH_FAILED: 'RULE_EXECUTION_EVENT_PUBLISH_FAILED',
  /** A run hit `maxGroupsPerExecution`; groups past the cap were dropped. */
  RULE_EXECUTION_MAX_GROUPS_EXCEEDED: 'RULE_EXECUTION_MAX_GROUPS_EXCEEDED',
  /**
   * The active-group fetch hit its `alerts.max` bound, so the active set may be truncated.
   */
  RULE_EXECUTION_ACTIVE_GROUPS_TRUNCATED: 'RULE_EXECUTION_ACTIVE_GROUPS_TRUNCATED',
  /**
   * The breach, recovery or data-presence ES|QL response exceeded
   * `rules.run.query.maxResponseSize`; the run failed as a user error.
   */
  RULE_EXECUTION_QUERY_RESPONSE_SIZE_EXCEEDED: 'RULE_EXECUTION_QUERY_RESPONSE_SIZE_EXCEEDED',

  // ──────────────────────────── Rules client ─────────────────────────
  /**
   * A rule saved object was persisted but its paired Task Manager call
   * failed, leaving the rule's task state diverged from its saved object.
   */
  RULE_TASK_MANAGER_DRIFT: 'RULE_TASK_MANAGER_DRIFT',
  /**
   * A bulk executor-task API key rotation call (`bulkUpdateSchedules`) failed
   * for one or more rules — e.g. the per-task-type key grant was rejected. The
   * affected rules' keys were left unrotated (their old key still works) and
   * are reported per-rule in the bulk response; no saved object was written,
   * so rule and task state stay consistent (this is not
   * `RULE_TASK_MANAGER_DRIFT`).
   */
  RULE_API_KEY_ROTATION_FAILED: 'RULE_API_KEY_ROTATION_FAILED',

  /**
   * Scheduling a new rule's executor task failed and the compensating delete
   * of the already-persisted saved object failed too. The rule is left
   * orphaned — enabled, but with no executor task — and needs manual removal.
   */
  RULE_CREATE_ROLLBACK_FAILED: 'RULE_CREATE_ROLLBACK_FAILED',

  // ────────────────────────── Storage & queries ──────────────────────
  /** A bulk index request into an alerting datastream failed or was rejected. */
  STORAGE_BULK_INDEX_FAILED: 'STORAGE_BULK_INDEX_FAILED',
  /** An ES|QL query issued by the plugin failed to execute. */
  QUERY_ESQL_EXECUTION_FAILED: 'QUERY_ESQL_EXECUTION_FAILED',

  // ────────────────────────────── Resources ──────────────────────────
  /**
   * An Elasticsearch resource (datastream, index template, ES|QL view)
   * failed to bootstrap. Rule execution stays degraded until it succeeds.
   */
  RESOURCES_BOOTSTRAP_FAILED: 'RESOURCES_BOOTSTRAP_FAILED',

  // ─────────────────────────── Saved objects ─────────────────────────
  /**
   * A saved object (or encrypted saved object) type failed to register at
   * setup. The plugin cannot read or write that type for the lifetime of the
   * process; distinct from a runtime document migration failure.
   */
  SAVED_OBJECTS_TYPE_REGISTRATION_FAILED: 'SAVED_OBJECTS_TYPE_REGISTRATION_FAILED',

  // ──────────────────────── Maintenance windows ──────────────────────
  /** Fetching active maintenance windows failed. */
  MAINTENANCE_WINDOW_FETCH_FAILED: 'MAINTENANCE_WINDOW_FETCH_FAILED',
  /**
   * A maintenance window saved object could not be interpreted (missing or
   * malformed events array) and was excluded from the active set.
   */
  MAINTENANCE_WINDOW_DOCUMENT_INVALID: 'MAINTENANCE_WINDOW_DOCUMENT_INVALID',
  /**
   * The point-in-time finder used to page maintenance windows failed to
   * close. The windows were still read; the PIT expires on its own.
   */
  MAINTENANCE_WINDOW_PIT_CLOSE_FAILED: 'MAINTENANCE_WINDOW_PIT_CLOSE_FAILED',

  // ──────────────── Rule templates (graceful degradation) ────────────────
  /**
   * A stored rule template failed schema validation. Find omits it from the
   * page; get maps it to not-found. Operator should investigate package drift.
   */
  RULE_TEMPLATE_VALIDATION_FAILED: 'RULE_TEMPLATE_VALIDATION_FAILED',

  // ─────────────────────────── Agent Builder ─────────────────────────
  /** `refresh_episode` failed; tool returns an error result. */
  AGENT_BUILDER_EPISODE_REFRESH_FAILED: 'AGENT_BUILDER_EPISODE_REFRESH_FAILED',
  /** `get_rule` failed; tool returns an error result. */
  AGENT_BUILDER_EPISODE_GET_RULE_FAILED: 'AGENT_BUILDER_EPISODE_GET_RULE_FAILED',
  /** Episode attachment resolve failed; returns undefined. */
  AGENT_BUILDER_EPISODE_RESOLVE_FAILED: 'AGENT_BUILDER_EPISODE_RESOLVE_FAILED',
  /** Episode attachment isStale check failed; returns false. */
  AGENT_BUILDER_EPISODE_STALENESS_CHECK_FAILED: 'AGENT_BUILDER_EPISODE_STALENESS_CHECK_FAILED',
  /** Rule attachment resolve failed; returns undefined. */
  AGENT_BUILDER_RULE_RESOLVE_FAILED: 'AGENT_BUILDER_RULE_RESOLVE_FAILED',
  /** Rule attachment isStale check failed; returns false. */
  AGENT_BUILDER_RULE_STALENESS_CHECK_FAILED: 'AGENT_BUILDER_RULE_STALENESS_CHECK_FAILED',
  /** Action policy attachment resolve failed; returns undefined. */
  AGENT_BUILDER_ACTION_POLICY_RESOLVE_FAILED: 'AGENT_BUILDER_ACTION_POLICY_RESOLVE_FAILED',
  /** Action policy attachment isStale check failed; returns false. */
  AGENT_BUILDER_ACTION_POLICY_STALENESS_CHECK_FAILED:
    'AGENT_BUILDER_ACTION_POLICY_STALENESS_CHECK_FAILED',
  /** `manage_rule` tool failed; returns an error result. */
  AGENT_BUILDER_MANAGE_RULE_FAILED: 'AGENT_BUILDER_MANAGE_RULE_FAILED',
  /** `manage_action_policy` tool failed; returns an error result. */
  AGENT_BUILDER_MANAGE_ACTION_POLICY_FAILED: 'AGENT_BUILDER_MANAGE_ACTION_POLICY_FAILED',
  /** Agent Builder skill registration failed; the skill is skipped and Kibana start continues. */
  AGENT_BUILDER_SKILL_REGISTER_FAILED: 'AGENT_BUILDER_SKILL_REGISTER_FAILED',

  // ─────────────────────────────── Tasks ─────────────────────────────
  /**
   * A telemetry task run failed. Usage data for the interval is lost; the
   * task retries on its next scheduled run.
   */
  TASKS_TELEMETRY_RUN_FAILED: 'TASKS_TELEMETRY_RUN_FAILED',
  /**
   * A background task could not be scheduled at boot, so it will not run
   * until the next restart. The task type is carried in `labels.task_id`.
   */
  TASKS_SCHEDULE_FAILED: 'TASKS_SCHEDULE_FAILED',
  /**
   * The pending API-key invalidation background task run failed. Keys queued
   * for invalidation remain until the next scheduled run.
   */
  TASKS_API_KEY_INVALIDATION_RUN_FAILED: 'TASKS_API_KEY_INVALIDATION_RUN_FAILED',

  // ─────────────────────────────── Routes ──────────────────────────────
  /** An alerting v2 HTTP route handler failed with an unexpected 5xx error. */
  ROUTES_HANDLER_FAILED: 'ROUTES_HANDLER_FAILED',
} as const;

export type AlertingV2LogCode = (typeof ALERTING_LOG_CODES)[keyof typeof ALERTING_LOG_CODES];
