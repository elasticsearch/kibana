/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import { esql } from '@elastic/esql';
import type { EsqlQueryResponse } from '@elastic/elasticsearch/lib/api/types';
import { ALERT_EVENTS_DATA_STREAM } from '@kbn/alerting-v2-constants';
import { ALERTING_ERROR_CODES } from '../../errors/error_codes';
import {
  getAlertEpisodeNotFoundMessage,
  getAlertSeriesNotFoundMessage,
} from '../../errors/alert_error_messages';
import { queryResponseToRecords } from '../../services/query_service/query_response_to_records';
import type { QueryServiceContract } from '../../services/query_service/query_service';
import type { AlertEventRecord, RawAlertEventRow } from '../types';
import { parseDataJson } from '../utils/parse_data_json';

/**
 * Canonicalises an ES|QL response from any of the alert-event projections
 * (latest-per-group, pre-deactivate, …) into {@link AlertEventRecord}
 * instances with a parsed `data_json`. Centralising the parse means every
 * producer of `AlertEventRecord` honours the contract uniformly — handler
 * code never has to second-guess whether the field is a JS object or a
 * raw string.
 */
export const toAlertEventRecords = (response: EsqlQueryResponse): AlertEventRecord[] =>
  queryResponseToRecords<RawAlertEventRow>(response).map((row) => ({
    ...row,
    data_json: parseDataJson(row.data_json),
  }));

interface LoadLatestAlertEventsByGroupHashParams {
  queryService: QueryServiceContract;
  spaceId: string;
  groupHashes: readonly string[];
}

/**
 * Resolves the latest `.rule-events` row per series (`group_hash`) in a
 * single ES|QL round-trip. Series that have no matching event simply don't
 * appear in the result; callers that need throw-on-empty semantics layer
 * that on top ({@link loadLastSeriesAlertEventOrThrow}).
 */
export const loadLatestAlertEventsByGroupHash = async ({
  queryService,
  spaceId,
  groupHashes,
}: LoadLatestAlertEventsByGroupHashParams): Promise<AlertEventRecord[]> => {
  if (groupHashes.length === 0) {
    return [];
  }

  const groupHashValues = [...new Set(groupHashes)].map((groupHash) => esql.str(groupHash));

  const query = esql`
    FROM ${ALERT_EVENTS_DATA_STREAM} METADATA _source
    | WHERE type == "alert" AND space_id == ${spaceId} AND group_hash IN (${groupHashValues})
    | EVAL data_json = JSON_EXTRACT(_source, "$.data")
    | DROP _source
    | STATS
        @timestamp = MAX(@timestamp),
        episode_id = LAST(episode.id, @timestamp),
        episode_status = LAST(episode.status, @timestamp),
        episode_status_count = LAST(episode.status_count, @timestamp),
        data_json = LAST(data_json, @timestamp),
        severity = LAST(severity, @timestamp),
        status = LAST(status, @timestamp),
        source = LAST(source, @timestamp),
        rule_id = LAST(rule.id, @timestamp),
        rule_version = LAST(rule.version, @timestamp)
      BY group_hash, space_id
    | KEEP @timestamp, group_hash, episode_id, episode_status, episode_status_count, rule_id, rule_version, space_id, status, source, data_json, severity
  `.toRequest();

  return toAlertEventRecords(await queryService.executeQuery({ query: query.query }));
};

interface LoadLatestAlertEventsByEpisodeIdParams {
  queryService: QueryServiceContract;
  spaceId: string;
  episodeIds: readonly string[];
}

/**
 * Resolves the latest `.rule-events` row per episode (`episode.id`) in a
 * single ES|QL round-trip, without requiring the caller to know the series
 * the episode belongs to — `group_hash` is aggregated off the episode's own
 * events. Episode ids are UUIDv4 (see the director's episode creation), so
 * an id plus the `space_id` filter uniquely identifies one episode;
 * externally-sourced events could theoretically collide across groups
 * within a space, in which case the per-episode bucket would merge rows —
 * practically unreachable.
 *
 * Episodes with no matching event don't appear in the result; callers that
 * need throw-on-empty semantics layer that on top
 * ({@link loadLastEpisodeAlertEventOrThrow}).
 */
export const loadLatestAlertEventsByEpisodeId = async ({
  queryService,
  spaceId,
  episodeIds,
}: LoadLatestAlertEventsByEpisodeIdParams): Promise<AlertEventRecord[]> => {
  if (episodeIds.length === 0) {
    return [];
  }

  const episodeIdValues = [...new Set(episodeIds)].map((episodeId) => esql.str(episodeId));

  const query = esql`
    FROM ${ALERT_EVENTS_DATA_STREAM} METADATA _source
    | WHERE type == "alert" AND space_id == ${spaceId} AND episode.id IN (${episodeIdValues})
    | EVAL data_json = JSON_EXTRACT(_source, "$.data"), episode_id = episode.id
    | DROP _source
    | STATS
        @timestamp = MAX(@timestamp),
        group_hash = LAST(group_hash, @timestamp),
        episode_status = LAST(episode.status, @timestamp),
        episode_status_count = LAST(episode.status_count, @timestamp),
        data_json = LAST(data_json, @timestamp),
        severity = LAST(severity, @timestamp),
        status = LAST(status, @timestamp),
        source = LAST(source, @timestamp),
        rule_id = LAST(rule.id, @timestamp),
        rule_version = LAST(rule.version, @timestamp)
      BY episode_id, space_id
    | KEEP @timestamp, group_hash, episode_id, episode_status, episode_status_count, rule_id, rule_version, space_id, status, source, data_json, severity
  `.toRequest();

  return toAlertEventRecords(await queryService.executeQuery({ query: query.query }));
};

interface LoadLastSeriesAlertEventParams {
  queryService: QueryServiceContract;
  spaceId: string;
  groupHash: string;
}

/**
 * Single-series adapter over {@link loadLatestAlertEventsByGroupHash}:
 * returns the most recent `.rule-events` row for one `group_hash` or throws
 * `Boom.notFound` with the canonical `ALERT_EVENT_NOT_FOUND` shape the
 * series-level route surface relies on.
 */
export const loadLastSeriesAlertEventOrThrow = async ({
  queryService,
  spaceId,
  groupHash,
}: LoadLastSeriesAlertEventParams): Promise<AlertEventRecord> => {
  const events = await loadLatestAlertEventsByGroupHash({
    queryService,
    spaceId,
    groupHashes: [groupHash],
  });

  if (events.length === 0) {
    throw Boom.notFound(getAlertSeriesNotFoundMessage(groupHash), {
      code: ALERTING_ERROR_CODES.ALERT_EVENT_NOT_FOUND,
      details: { group_hash: groupHash },
    });
  }

  return events[0];
};

interface LoadLastEpisodeAlertEventParams {
  queryService: QueryServiceContract;
  spaceId: string;
  episodeId: string;
}

/**
 * Single-episode adapter over {@link loadLatestAlertEventsByEpisodeId}:
 * returns the most recent `.rule-events` row for one `episode.id` or throws
 * `Boom.notFound` with the canonical `ALERT_EPISODE_NOT_FOUND` shape the
 * episode-level route surface relies on.
 */
export const loadLastEpisodeAlertEventOrThrow = async ({
  queryService,
  spaceId,
  episodeId,
}: LoadLastEpisodeAlertEventParams): Promise<AlertEventRecord> => {
  const events = await loadLatestAlertEventsByEpisodeId({
    queryService,
    spaceId,
    episodeIds: [episodeId],
  });

  if (events.length === 0) {
    throw Boom.notFound(getAlertEpisodeNotFoundMessage(episodeId), {
      code: ALERTING_ERROR_CODES.ALERT_EPISODE_NOT_FOUND,
      details: { episode_id: episodeId },
    });
  }

  return events[0];
};
