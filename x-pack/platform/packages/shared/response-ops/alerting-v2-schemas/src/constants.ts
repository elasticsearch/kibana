/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/** Maximum number of consecutive breaches before transition */
export const MAX_CONSECUTIVE_BREACHES = 1000;

export const MAX_ESQL_QUERY_LENGTH = 10000;

/** Maximum allowed duration for schedule and timeframe fields */
export const MAX_DURATION = '365d';

/** Minimum allowed interval for schedule.every */
export const MIN_SCHEDULE_INTERVAL = '5s';

/**
 * Default value of `xpack.alerting_v2.rules.minimumScheduleInterval`. Shared
 * between the server config (as its `defaultValue`) and the rule form UI so the
 * client validates `schedule.every` against the same minimum the server enforces
 * on a default deployment.
 */
export const DEFAULT_MINIMUM_SCHEDULE_INTERVAL = '1m';

/** Maximum resources processed in one filter-based bulk operation (select-all). */
export const BULK_FILTER_MAX_RESOURCES = 10_000;

/**
 * Maximum length for entity identifiers (rule, action policy, episode, insight,
 * workflow connector). Aligned with other Kibana saved-object identifier limits.
 */
export const ID_MAX_LENGTH = 150;

/** Maximum length for KQL/filter query strings (e.g. action policy matcher, bulk operation filter). */
export const MAX_KQL_LENGTH = 4096;

/** Maximum length for free-text search strings. */
export const MAX_SEARCH_LENGTH = 256;

/**
 * Maximum number of rule ids returned in the `sample` array of a by-query
 * bulk operation dry-run response. Large enough for meaningful spot-checks,
 * small enough to keep response payloads bounded.
 */
export const BULK_QUERY_SAMPLE_SIZE = 100;

/** Maximum length for an Elasticsearch field name (e.g. `host.name`, `service.environment`). */
export const MAX_FIELD_NAME_LENGTH = 256;

/** Maximum number of fields used to group alerts (rule grouping, action policy group_by). */
export const MAX_GROUPING_FIELDS = 16;

/** Maximum number of items processed in a single bulk-action request body. */
export const MAX_BULK_ITEMS = 100;

/** Maximum length for human-readable name fields (rule name, action policy name). */
export const MAX_NAME_LENGTH = 256;

/**
 * Maximum length for episode attachment display labels (`episode.label`).
 * Sized for `{ruleName} alert for {groupName}` where each name is at most
 * {@link MAX_NAME_LENGTH}, plus room for the connecting phrase.
 */
export const MAX_EPISODE_LABEL_LENGTH = MAX_NAME_LENGTH * 2 + 32;

/** Maximum length for human-readable description fields (rule description, action policy description). */
export const MAX_DESCRIPTION_LENGTH = 1024;

/** Maximum length for an external alert `fingerprint` / series key. */
export const MAX_FINGERPRINT_LENGTH = 1024;

/** Maximum number of fields named in `fingerprint_fields` on external alert ingest. */
export const MAX_FINGERPRINT_FIELDS = 10;

/** Maximum number of keys in the open `data` bag on external alert ingest. */
export const MAX_ALERT_EVENT_DATA_KEYS = 100;

/**
 * Maximum number of fields in an artifact's `data` record. Well above what any
 * artifact type needs today, but it keeps the record bounded so the per-field
 * limits cannot be sidestepped by sending many small fields instead of one
 * large one.
 */
export const MAX_ARTIFACT_DATA_FIELDS = 32;

export const MAX_BUILDER_TYPE_LENGTH = 64;
export const MAX_BUILDER_FIELDS_KEYS = 64;

/** Maximum number of destinations per action policy. */
export const ACTION_POLICY_MAX_DESTINATIONS = 10;

/**
 * Maximum length for the `version` field. Used by the optimistic concurrency control check on `PATCH /{id}`
 * and `PUT /{id}`.
 */
export const VERSION_MAX_LENGTH = 256;

/** Maximum number of execution-history events returned per page (rule + action policy streams). */
export const EXECUTION_HISTORY_MAX_PER_PAGE = 100;

/** Default number of execution-history events returned per page when `per_page` is omitted. */
export const EXECUTION_HISTORY_DEFAULT_PER_PAGE = 20;

/**
 * Maximum number of events that can be paged through.
 */
export const EXECUTION_HISTORY_MAX_RESULT_WINDOW = 10_000;

/**
 * Maximum number of rule ids accepted by the execution-history rule-id
 * filter.
 */
export const EXECUTION_HISTORY_MAX_RULE_ID_FILTER = 50;

/** Maximum number of rule templates returned per page. */
export const RULE_TEMPLATE_MAX_PER_PAGE = 100;

/**
 * Maximum length of the `episode_data` JSON string snapshotted into an episode
 * attachment. Bounds open-ended user JSON so attachment payloads stay finite.
 */
export const MAX_EPISODE_DATA_LENGTH = 32_000;

/** Maximum number of rule change-history events returned per page. */
export const RULE_CHANGE_HISTORY_MAX_PER_PAGE = 100;

/** Default number of rule change-history events returned per page when `per_page` is omitted. */
export const RULE_CHANGE_HISTORY_DEFAULT_PER_PAGE = 20;

/**
 * Maximum number of rule change-history events that can be paged through.
 */
export const RULE_CHANGE_HISTORY_MAX_RESULT_WINDOW = 10_000;
