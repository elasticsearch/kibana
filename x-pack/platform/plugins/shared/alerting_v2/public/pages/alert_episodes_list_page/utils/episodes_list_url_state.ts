/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EpisodesFilterState } from '@kbn/alerting-v2-episodes-ui/queries/episodes_query';
import type { TimeRange } from '@kbn/es-query';
import type { IKbnUrlStateStorage } from '@kbn/kibana-utils-plugin/public';
import { isArray, isNil, isPlainObject, isString } from 'lodash';

/** Namespace for episodes list state inside the `_a` app-state blob */
export const EPISODES_LIST_APP_STATE_KEY = 'episodesList' as const;

/** Serialized in `_a` so “all statuses” survives reload (distinct from default Active) */
export const EPISODES_LIST_STATUS_URL_ALL = 'all' as const;

/** Default list filters (Active episodes, no rule/tags/search/assignee). */
export const DEFAULT_EPISODES_LIST_FILTER: EpisodesFilterState = { status: 'active' };

/** Matches {@link useEpisodesTimeRange} fallback when timefilter has no prior state */
export const DEFAULT_EPISODES_LIST_TIME_RANGE: TimeRange = {
  from: 'now-24h',
  to: 'now',
};

type AppStateRecord = Record<string, unknown> & {
  [EPISODES_LIST_APP_STATE_KEY]?: unknown;
};

const isNonEmptyString = (v: unknown): v is string => isString(v) && v.trim().length > 0;

const isStringArray = (v: unknown): v is string[] =>
  isArray(v) && v.length > 0 && v.every(isString);

const isGroupingValues = (v: unknown): v is Record<string, string | null> =>
  isPlainObject(v) &&
  Object.values(v as Record<string, unknown>).every((val) => isString(val) || val === null);

function decodeFilterFields(o: Record<string, unknown>): EpisodesFilterState {
  const result: EpisodesFilterState = {};
  if (o.status === EPISODES_LIST_STATUS_URL_ALL) {
    result.status = undefined;
  } else if (isNonEmptyString(o.status)) {
    result.status = o.status;
  }
  if (isNonEmptyString(o.ruleId)) {
    result.ruleId = o.ruleId;
  }
  if (isNonEmptyString(o.groupHash)) {
    result.groupHash = o.groupHash;
  }
  if (isGroupingValues(o.groupingValues)) {
    result.groupingValues = o.groupingValues;
  }
  if (isNonEmptyString(o.queryString)) {
    result.queryString = o.queryString.trim();
  }
  if (isStringArray(o.tags)) {
    result.tags = [...o.tags];
  }
  if (isStringArray(o.severity)) {
    result.severity = [...o.severity];
  } else if (isStringArray(o.severities)) {
    result.severity = [...o.severities];
  }
  if (isNonEmptyString(o.assigneeUid)) {
    result.assigneeUid = o.assigneeUid;
  }
  return result;
}

function splitEpisodesListRaw(raw: unknown): {
  filter: EpisodesFilterState;
  timeRange?: TimeRange;
  histogramBreakdownField?: string;
} {
  if (!isPlainObject(raw)) {
    return { filter: {} };
  }
  const o = raw as Record<string, unknown>;
  const { timeFrom, timeTo, histBreakdown, ...rest } = o;
  const filter = decodeFilterFields(rest);
  const result: ReturnType<typeof splitEpisodesListRaw> = { filter };
  if (isNonEmptyString(timeFrom) && isNonEmptyString(timeTo)) {
    result.timeRange = { from: timeFrom, to: timeTo };
  }
  if (isNonEmptyString(histBreakdown)) {
    result.histogramBreakdownField = histBreakdown;
  }
  return result;
}

function encodeFilterFields(state: EpisodesFilterState): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const st = state.status;
  if (isNil(st)) {
    result.status = EPISODES_LIST_STATUS_URL_ALL;
  } else if (isNonEmptyString(st) && st !== DEFAULT_EPISODES_LIST_FILTER.status) {
    result.status = st;
  }
  if (isNonEmptyString(state.ruleId)) {
    result.ruleId = state.ruleId;
  }
  if (isNonEmptyString(state.groupHash)) {
    result.groupHash = state.groupHash;
  }
  if (isGroupingValues(state.groupingValues)) {
    result.groupingValues = { ...state.groupingValues };
  }
  if (isNonEmptyString(state.queryString)) {
    result.queryString = state.queryString.trim();
  }
  if (isStringArray(state.tags)) {
    result.tags = [...state.tags];
  }
  if (isStringArray(state.severity)) {
    result.severity = [...state.severity];
  }
  if (isNonEmptyString(state.assigneeUid)) {
    result.assigneeUid = state.assigneeUid;
  }
  return result;
}

function encodeEpisodesListRecord(
  filter: EpisodesFilterState,
  timeRange: TimeRange,
  histogramBreakdownField?: string
): Record<string, unknown> {
  const out = encodeFilterFields(filter);
  if (
    timeRange.from !== DEFAULT_EPISODES_LIST_TIME_RANGE.from ||
    timeRange.to !== DEFAULT_EPISODES_LIST_TIME_RANGE.to
  ) {
    out.timeFrom = timeRange.from;
    out.timeTo = timeRange.to;
  }
  if (isNonEmptyString(histogramBreakdownField)) {
    out.histBreakdown = histogramBreakdownField;
  }
  return out;
}

export function readEpisodesListAppStateFromUrlStorage(storage: IKbnUrlStateStorage): {
  filterState: EpisodesFilterState;
  timeRange?: TimeRange;
  histogramBreakdownField?: string;
} {
  const raw = storage.get<AppStateRecord>('_a')?.[EPISODES_LIST_APP_STATE_KEY];
  const { filter, timeRange, histogramBreakdownField } = splitEpisodesListRaw(raw);
  return {
    filterState: { ...DEFAULT_EPISODES_LIST_FILTER, ...filter },
    ...(timeRange ? { timeRange } : {}),
    ...(histogramBreakdownField ? { histogramBreakdownField } : {}),
  };
}

export async function writeEpisodesListAppStateToUrlStorage(
  storage: IKbnUrlStateStorage,
  filter: EpisodesFilterState,
  timeRange: TimeRange,
  histogramBreakdownField?: string
): Promise<void> {
  const serialized = encodeEpisodesListRecord(filter, timeRange, histogramBreakdownField);
  const appState = storage.get<AppStateRecord>('_a') ?? {};
  const {
    [EPISODES_LIST_APP_STATE_KEY]: _ignoredEpisodesListState,
    ...appStateWithoutEpisodesList
  } = appState;

  const nextAppState: AppStateRecord =
    Object.keys(serialized).length === 0
      ? appStateWithoutEpisodesList
      : { ...appStateWithoutEpisodesList, [EPISODES_LIST_APP_STATE_KEY]: serialized };

  await storage.set('_a', nextAppState, { replace: false });
}
