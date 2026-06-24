/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ComposerQuery } from '@elastic/esql';
import { esql } from '@elastic/esql';
import { escapeStringValue } from '@kbn/esql-utils/src/utils/append_to_query/utils';
import type { AlertEpisodeStatus } from '@kbn/alerting-v2-schemas';
import {
  ALERT_EVENTS_DATA_STREAM,
  ALERT_ACTIONS_DATA_STREAM,
  PAGE_SIZE_ESQL_VARIABLE,
  HISTOGRAM_EPISODE_LIMIT,
} from '../constants';

export interface AlertEpisode {
  '@timestamp': string;
  'episode.id': string;
  'episode.status': AlertEpisodeStatus;
  'rule.id': string;
  group_hash: string;
  first_timestamp: string;
  last_timestamp: string;
  duration: number;
  /** ISO timestamp of the first event where episode.status === 'active'. */
  triggered_at?: string;
  last_ack_action?: 'ack' | 'unack';
  last_assignee_uid?: string | null;
  last_snooze_action?: 'snooze' | 'unsnooze';
  snooze_expiry?: string;
  last_deactivate_action?: 'activate' | 'deactivate';
  last_tags?: string[];
  /** JSON string from the latest **non-empty** alert `data` (see `addEpisodeAggregation`) */
  episode_data?: string | null;
  /** Latest top-level `severity` from a breached rule event, when present. */
  severity?: string | null;
}

/**
 * Raw ES|QL response shape before client-side normalization.
 */
export interface AlertEpisodeEsqlRow extends Omit<AlertEpisode, 'last_tags'> {
  last_tags?: string | string[] | null;
}

export const ALERT_EPISODE_FIELDS = [
  '@timestamp',
  'episode.id',
  'episode.status',
  'rule.id',
  'group_hash',
  'first_timestamp',
  'last_timestamp',
  'duration',
  'triggered_at',
  'last_ack_action',
  'last_assignee_uid',
  'last_snooze_action',
  'snooze_expiry',
  'last_deactivate_action',
  'last_tags',
  'episode_data',
  'severity',
] as const;

export interface EpisodesFilterState {
  /** Single episode status (inactive | pending | active | recovering) or null for All */
  status?: string | null;
  /** Rule ID or null */
  ruleId?: string | null;
  /** Group hash — narrows to a single per-rule series (used for deep-links from rule details). */
  groupHash?: string | null;
  /**
   * Display-only companion to `groupHash`. When a deep-link carries the
   * resolved grouping field values (e.g. `{ "host.name": "web-01" }`), the
   * destination chip can render `host=web-01` without re-running the DSL
   * lookup. Does NOT affect the query — `buildEpisodesQuery` ignores it.
   */
  groupingValues?: Record<string, string | null> | null;
  /** Query string for full-text search */
  queryString?: string | null;
  /** Tag values — episodes matching any selected tag (OR) */
  tags?: string[] | null;
  /** Assignee UID — episodes whose last assignee matches this user profile UID */
  assigneeUid?: string;
}

export interface EpisodesSortState {
  sortField: string;
  sortDirection: 'asc' | 'desc';
}

const ALLOWLISTED_SORT_FIELDS = new Set([
  '@timestamp',
  'episode.id',
  'episode.status',
  'rule.id',
  'duration',
]);

const sanitizeSortField = (field: string) => {
  return ALLOWLISTED_SORT_FIELDS.has(field) ? field : '@timestamp';
};

export const addEpisodeAggregation = (query: ComposerQuery) => {
  /* This will be simplified when the `$.alerting-episodes` ES|QL view works.
   * Matches `buildEpisodeEventDataQuery` and `buildRelatedEpisodesQuery`.
   */

  // prettier-ignore
  query
    .pipe`EVAL extracted_data = JSON_EXTRACT(_source, "data")`
    .pipe`INLINE STATS first_timestamp = MIN(@timestamp), last_timestamp = MAX(@timestamp), triggered_at = MIN(@timestamp) WHERE \`episode.status\` == "active", episode_data = LAST(extracted_data, @timestamp) WHERE extracted_data != "{}", severity = LAST(severity, @timestamp) WHERE status == "breached" AND severity IS NOT NULL BY episode.id`
    .pipe`EVAL duration = DATE_DIFF("ms", first_timestamp, last_timestamp)`
    .pipe`WHERE @timestamp == last_timestamp`;
};

const addGroupHashActionStats = (query: ComposerQuery) => {
  // prettier-ignore
  query
    .pipe`INLINE STATS last_deactivate_action = LAST(action_type, @timestamp) WHERE action_type IN ("deactivate", "activate"),
                       last_snooze_action     = LAST(action_type, @timestamp) WHERE action_type IN ("snooze", "unsnooze"),
                       snooze_expiry          = LAST(expiry, @timestamp)      WHERE action_type == "snooze",
                       last_tags              = LAST(tags, @timestamp)        WHERE action_type == "tag"
          BY group_hash`;
};

const addEpisodeIdActionStats = (query: ComposerQuery) => {
  // `.rule-events` documents carry the nested `episode.id`, while `.alert-actions`
  // documents carry a flat `episode_id` — unify them so INLINE STATS groups both
  // sides under the same key.
  // prettier-ignore
  query
    .pipe`EVAL episode_id = COALESCE(\`episode.id\`, episode_id)`
    .pipe`INLINE STATS last_ack_action      = LAST(action_type,  @timestamp) WHERE action_type IN ("ack", "unack"),
                       last_assignee_uid    = LAST(assignee_uid, @timestamp) WHERE action_type == "assign"
          BY episode_id`;
};

const addTagsFilter = (query: ComposerQuery, tags: string[]) => {
  const trimmed = tags.map((t) => t.trim()).filter(Boolean);
  if (trimmed.length === 0) {
    return;
  }
  if (trimmed.length === 1) {
    query.where`MV_CONTAINS(last_tags, ${trimmed[0]})`;
    return;
  }
  const clause = trimmed.map((t) => `MV_CONTAINS(last_tags, ${escapeStringValue(t)})`).join(' OR ');
  query.pipe(`WHERE (${clause})`);
};

const applyFilterState = (query: ComposerQuery, filterState: EpisodesFilterState): void => {
  if (filterState.status) {
    query.where`effective_status == ${filterState.status}`;
  }
  if (filterState.ruleId) {
    query.where`rule.id == ${filterState.ruleId}`;
  }
  if (filterState.groupHash) {
    query.where`group_hash == ${filterState.groupHash}`;
  }
  if (filterState.tags?.length) {
    addTagsFilter(query, filterState.tags);
  }
  if (filterState.assigneeUid) {
    query.where`last_assignee_uid == ${filterState.assigneeUid}`;
  }
};

/**
 * Builds an ES|QL query that aggregates episode data from `.rule-events` and
 * `.alert-actions` (last tags / deactivate state per group_hash, last assignee per episode),
 * then narrows to episode rows and derives `effective_status`.
 */
export const buildEpisodesBaseQuery = (spaceId: string, search?: string): ComposerQuery => {
  const query = esql.from([ALERT_EVENTS_DATA_STREAM, ALERT_ACTIONS_DATA_STREAM], ['_source'])
    .where`space_id == ${spaceId}`;

  const trimmedSearch = search?.trim();
  if (trimmedSearch) {
    query.pipe(
      `WHERE ((type == "alert" AND QSTR(${escapeStringValue(
        trimmedSearch
      )})) OR (action_type IN ("deactivate", "activate", "snooze", "unsnooze", "tag", "ack", "unack", "assign")))`
    );
  } else {
    query.where`type == "alert" OR action_type IN ("deactivate", "activate", "snooze", "unsnooze", "tag", "ack", "unack", "assign")`;
  }

  addGroupHashActionStats(query);
  addEpisodeIdActionStats(query);
  query.where`type == "alert"`;
  addEpisodeAggregation(query);
  // Derive effective status: overridden to "inactive" when the latest action is "deactivate"
  query.pipe`EVAL effective_status = CASE(last_deactivate_action == "deactivate", "inactive", \`episode.status\`)`;

  return query;
};

/**
 * Builds an ES|QL query for episodes request with sorting and filtering.
 *
 * Joins `.rule-events` and `.alert-actions` so that user-driven deactivation
 * is reflected in an `effective_status` column, and per-episode assignee info
 * is available for `assigneeUid` filtering.
 */
export const buildEpisodesQuery = (
  spaceId: string,
  sortState: EpisodesSortState = { sortField: '@timestamp', sortDirection: 'desc' },
  filterState?: EpisodesFilterState
): ComposerQuery => {
  const sortField = sanitizeSortField(sortState.sortField);
  const sortDir = sortState.sortDirection.toUpperCase() as 'ASC' | 'DESC';
  const pageSizeParam = esql.par(undefined, PAGE_SIZE_ESQL_VARIABLE);

  const query = buildEpisodesBaseQuery(spaceId, filterState?.queryString?.trim());

  if (filterState) {
    applyFilterState(query, filterState);
  }

  return query.sort([sortField, sortDir]).pipe`LIMIT ${pageSizeParam}`.keep(
    ...ALERT_EPISODE_FIELDS
  );
};

/**
 * Builds an ES|QL query that computes six KPI counts in a single STATS pass.
 * Uses indicator EVALs (CASE-based 0/1 columns) so all aggregations can share
 * one STATS command without sub-queries.
 *
 * Counts: active_alerts, firing_rules, assigned_to_me, unassigned, acknowledged, snoozed.
 */
export const buildEpisodesKpisQuery = (
  spaceId: string,
  currentUserUid?: string,
  filterState?: EpisodesFilterState
): string => {
  const query = buildEpisodesBaseQuery(spaceId, filterState?.queryString?.trim());

  if (filterState) {
    applyFilterState(query, filterState);
  }

  // Indicator columns — null for distinct count, 1/0 for sum-based counts.
  // When there's no current user (anonymous/proxy-authenticated), nothing can be
  // "assigned to me", so the indicator is always 0.
  // prettier-ignore
  query
    .pipe`EVAL _active_rule_id = CASE(effective_status == "active", \`rule.id\`, null)`
    .pipe(
      currentUserUid
        ? `EVAL _assigned_to_me = CASE(last_assignee_uid == ${escapeStringValue(currentUserUid)}, 1, 0)`
        : `EVAL _assigned_to_me = 0`
    )
    .pipe`EVAL _is_unassigned  = CASE(last_assignee_uid IS NULL, 1, 0)`
    .pipe`EVAL _is_acked       = CASE(last_ack_action == "ack", 1, 0)`
    .pipe`EVAL _is_snoozed     = CASE(last_snooze_action == "snooze" AND (snooze_expiry IS NULL OR TO_DATETIME(snooze_expiry) > NOW()), 1, 0)`
    .pipe`STATS
      alerts_count   = COUNT(*),
      firing_rules   = COUNT_DISTINCT(_active_rule_id),
      assigned_to_me = SUM(_assigned_to_me),
      unassigned     = SUM(_is_unassigned),
      acknowledged   = SUM(_is_acked),
      snoozed        = SUM(_is_snoozed)`;

  return query.print('basic');
};

/**
 * Builds a lightweight ESQL query for histogram data.
 * Returns only the fields needed for overlap counting; no SORT.
 * Time range is applied by the caller via executeEsqlQuery's input.timeRange.
 */
export const buildEpisodesHistogramQuery = (
  spaceId: string,
  filterState?: EpisodesFilterState,
  breakdownField?: string
): ComposerQuery => {
  const query = buildEpisodesBaseQuery(spaceId, filterState?.queryString?.trim());

  if (filterState) {
    applyFilterState(query, filterState);
  }

  const keepFields: string[] = [
    'first_timestamp',
    'last_timestamp',
    'episode.status',
    'effective_status',
  ];
  if (breakdownField) keepFields.push(breakdownField);

  return query.keep(...(keepFields as [string, ...string[]])).limit(HISTOGRAM_EPISODE_LIMIT);
};
