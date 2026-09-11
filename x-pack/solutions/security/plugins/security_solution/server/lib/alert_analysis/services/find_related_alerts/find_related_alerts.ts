/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import {
  extractSourceEntitiesFromAlert,
  RELATED_ALERT_ENTITY_SOURCE_INCLUDES,
  RELATED_ALERT_SOURCE_ALLOWLIST,
  trimEntityValues,
  type SourceEntities,
} from './utils/entity_utils';
import { getErrorMessage } from './utils/es_errors';

export type { SourceEntities } from './utils/entity_utils';

export interface FindRelatedAlertsParams {
  alertId: string;
  alertsIndex: string;
  timeWindowHours: number;
  maxResults?: number;
  hostNames?: string[];
  userNames?: string[];
  sourceIps?: string[];
  destIps?: string[];
  logger?: Logger;
}

interface RelatedAlertDocument extends Record<string, unknown> {
  _id: string;
  _index: string;
}

export interface FindRelatedAlertsSuccess {
  ok: true;
  message: string;
  relatedAlerts: RelatedAlertDocument[];
  sourceEntities: SourceEntities;
  totalMatched: number;
  returnedCount: number;
  isTruncated: boolean;
}

export type FindRelatedAlertsFailureReason = 'alert_not_found' | 'search_failed';

export interface FindRelatedAlertsError {
  ok: false;
  message: string;
  reason: FindRelatedAlertsFailureReason;
}

export type FindRelatedAlertsResult = FindRelatedAlertsSuccess | FindRelatedAlertsError;

/** Default for REST/API callers; inline tool passes a higher cap for fewer follow-up calls. */
export const RELATED_ALERTS_DEFAULT_MAX_RESULTS = 25;
/** Matches legacy inline-tool behavior and 15-rep eval token budget. */
export const RELATED_ALERTS_INLINE_MAX_RESULTS = 50;

export const findRelatedAlerts = async (
  esClient: ElasticsearchClient,
  params: FindRelatedAlertsParams
): Promise<FindRelatedAlertsResult> => {
  const {
    alertId,
    alertsIndex,
    timeWindowHours,
    maxResults = RELATED_ALERTS_DEFAULT_MAX_RESULTS,
    hostNames: providedHostNames,
    userNames: providedUserNames,
    sourceIps: providedSourceIps,
    destIps: providedDestIps,
    logger,
  } = params;

  const providedEntities: SourceEntities = {
    hostNames: trimEntityValues(providedHostNames),
    userNames: trimEntityValues(providedUserNames),
    sourceIps: trimEntityValues(providedSourceIps),
    destIps: trimEntityValues(providedDestIps),
  };

  const hasProvidedEntities = hasAnyEntityValues(providedEntities);

  try {
    let sourceEntities: SourceEntities;

    if (hasProvidedEntities) {
      let alertEntities: SourceEntities | null = null;
      try {
        alertEntities = await getAlertSourceEntities(esClient, alertsIndex, alertId);
      } catch (error) {
        logger?.warn(
          `Failed to load source alert ${alertId} from index ${alertsIndex}; proceeding with provided entity values: ${getErrorMessage(
            error
          )}`
        );
      }
      sourceEntities = mergeSourceEntities(alertEntities, providedEntities);
    } else {
      const alertEntities = await getAlertSourceEntities(esClient, alertsIndex, alertId);
      if (!alertEntities) {
        return {
          ok: false,
          reason: 'alert_not_found',
          message: `Alert ${alertId} not found or has no source data.`,
        };
      }
      sourceEntities = alertEntities;
    }

    if (!hasAnyEntityValues(sourceEntities)) {
      return {
        ok: true,
        message: 'No entity values found on the source alert to correlate.',
        sourceEntities,
        relatedAlerts: [],
        totalMatched: 0,
        returnedCount: 0,
        isTruncated: false,
      };
    }

    const shouldClauses: Array<{ terms: Record<string, string[]> }> = [];
    if (sourceEntities.hostNames.length > 0) {
      shouldClauses.push({ terms: { 'host.name': sourceEntities.hostNames } });
    }
    if (sourceEntities.userNames.length > 0) {
      shouldClauses.push({ terms: { 'user.name': sourceEntities.userNames } });
    }
    if (sourceEntities.sourceIps.length > 0) {
      shouldClauses.push({ terms: { 'source.ip': sourceEntities.sourceIps } });
    }
    if (sourceEntities.destIps.length > 0) {
      shouldClauses.push({ terms: { 'destination.ip': sourceEntities.destIps } });
    }

    const size = Math.min(Math.max(maxResults, 1), 100);

    const searchResult = await esClient.search<Record<string, unknown>>({
      index: alertsIndex,
      size,
      track_total_hits: true,
      query: {
        bool: {
          must: [
            {
              range: {
                '@timestamp': {
                  gte: `now-${timeWindowHours}h`,
                },
              },
            },
          ],
          should: shouldClauses,
          minimum_should_match: 1,
          must_not: [{ ids: { values: [alertId] } }],
        },
      },
      sort: [{ '@timestamp': 'desc' }],
      _source: [...RELATED_ALERT_SOURCE_ALLOWLIST],
      ignore_unavailable: true,
    });

    const relatedAlerts: RelatedAlertDocument[] = searchResult.hits.hits.flatMap((hit) => {
      if (hit._id == null) {
        return [];
      }
      return [
        {
          _id: hit._id,
          _index: hit._index ?? alertsIndex,
          ...((hit._source as Record<string, unknown> | undefined) ?? {}),
        },
      ];
    });

    const totalMatched = getTotalMatched(searchResult.hits.total);
    const returnedCount = relatedAlerts.length;
    const isTruncated = totalMatched > returnedCount;

    return {
      ok: true,
      message: buildSuccessMessage({ alertId, returnedCount, totalMatched, isTruncated }),
      sourceEntities,
      relatedAlerts,
      totalMatched,
      returnedCount,
      isTruncated,
    };
  } catch (error) {
    logger?.error(`Failed to find related alerts for alert ${alertId}: ${getErrorMessage(error)}`);
    return {
      ok: false,
      reason: 'search_failed',
      message: `Failed to find related alerts: ${getErrorMessage(error)}`,
    };
  }
};

const getTotalMatched = (
  total: number | { relation?: string; value?: number } | undefined
): number => {
  if (typeof total === 'number') {
    return total;
  }
  if (total && typeof total.value === 'number') {
    return total.value;
  }
  return 0;
};

const buildSuccessMessage = ({
  alertId,
  returnedCount,
  totalMatched,
  isTruncated,
}: {
  alertId: string;
  returnedCount: number;
  totalMatched: number;
  isTruncated: boolean;
}): string => {
  if (isTruncated) {
    return `Found ${returnedCount} of ${totalMatched} related alerts sharing entities with alert ${alertId}.`;
  }
  return `Found ${returnedCount} related alerts sharing entities with alert ${alertId}.`;
};

const hasAnyEntityValues = (entities: SourceEntities): boolean =>
  entities.hostNames.length > 0 ||
  entities.userNames.length > 0 ||
  entities.sourceIps.length > 0 ||
  entities.destIps.length > 0;

const mergeSourceEntities = (
  alertEntities: SourceEntities | null,
  providedEntities: SourceEntities
): SourceEntities => ({
  hostNames: unionEntityValues(alertEntities?.hostNames, providedEntities.hostNames),
  userNames: unionEntityValues(alertEntities?.userNames, providedEntities.userNames),
  sourceIps: unionEntityValues(alertEntities?.sourceIps, providedEntities.sourceIps),
  destIps: unionEntityValues(alertEntities?.destIps, providedEntities.destIps),
});

const unionEntityValues = (...valueLists: Array<string[] | undefined>): string[] =>
  trimEntityValues(valueLists.flatMap((values) => values ?? []));

const getAlertSourceEntities = async (
  esClient: ElasticsearchClient,
  alertsIndex: string,
  alertId: string
): Promise<SourceEntities | null> => {
  const searchResult = await esClient.search<Record<string, unknown>>({
    index: alertsIndex,
    size: 1,
    query: { ids: { values: [alertId] } },
    _source: [...RELATED_ALERT_ENTITY_SOURCE_INCLUDES],
    ignore_unavailable: true,
  });

  const alertSource = searchResult.hits.hits[0]?._source;
  if (!alertSource) {
    return null;
  }

  return extractSourceEntitiesFromAlert(alertSource);
};
