/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import type { SyntheticsEsClient } from '../lib';
import { getSyntheticsCcsIndex } from '../../common/get_synthetics_indices';
import type { Ping } from '../../common/runtime_types/ping';

export interface GetStepScreenshotParams {
  monitorId: string;
  timestamp: string;
  location?: string;
}

/**
 * How far back to look for a monitor's most recent successful check. Without a
 * lower bound the `@timestamp desc` search walks backwards across every backing
 * index — including frozen-tier searchable snapshots — for monitors that have
 * been down for a long time. Capping the look-back at 30 days lets `can_match`
 * prune older shards; a monitor with no success in the last 30 days simply has
 * no "last successful check" to show, which is acceptable.
 */
export const LAST_SUCCESSFUL_CHECK_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

export const getLastSuccessfulStepParams = ({
  monitorId,
  timestamp,
  location,
}: GetStepScreenshotParams): estypes.SearchRequest => {
  const lookbackStart = new Date(
    new Date(timestamp).getTime() - LAST_SUCCESSFUL_CHECK_LOOKBACK_MS
  ).toISOString();

  return {
    size: 1,
    // With size:1 + `@timestamp desc` we only need the latest doc, so skip hit
    // counting. This lets ES order shards by `@timestamp` and short-circuit once
    // the first match is found instead of scanning every matching shard.
    track_total_hits: false,
    sort: [
      {
        '@timestamp': {
          order: 'desc',
        },
      },
    ],
    query: {
      bool: {
        filter: [
          {
            range: {
              '@timestamp': {
                gte: lookbackStart,
                lte: timestamp,
              },
            },
          },
          {
            term: {
              'monitor.id': monitorId,
            },
          },
          {
            term: {
              'synthetics.type': 'heartbeat/summary',
            },
          },
          {
            range: {
              'summary.down': {
                lte: '0',
              },
            },
          },
          ...(location
            ? [
                {
                  term: {
                    'observer.geo.name': location,
                  },
                },
              ]
            : []),
        ],
        ...(!location
          ? {
              must_not: {
                exists: {
                  field: 'observer.geo.name',
                },
              },
            }
          : {}),
      },
    },
  };
};

export const getLastSuccessfulCheck = async ({
  syntheticsEsClient,
  monitorId,
  timestamp,
  location,
  remoteName,
}: GetStepScreenshotParams & {
  syntheticsEsClient: SyntheticsEsClient;
  remoteName?: string;
}): Promise<Ping | null> => {
  const lastSuccessCheckParams = getLastSuccessfulStepParams({
    monitorId,
    timestamp,
    location,
  });

  const { body: result } = await syntheticsEsClient.search({
    index: getSyntheticsCcsIndex(remoteName, syntheticsEsClient.heartbeatIndices),
    ...lastSuccessCheckParams,
  });

  // `track_total_hits: false` omits `hits.total`, so check the returned hits.
  if (result.hits.hits.length < 1) {
    return null;
  }

  const check = result.hits.hits[0]._source as Ping;

  return {
    ...check,
    docId: result.hits.hits[0]._id!,
  };
};
