/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import type { SyntheticsEsClient } from '../lib';
import { createEsParams } from '../lib';
import { getCheckGroupTimeRangeFilter } from '../../common/constants/client_defaults';
import { getSyntheticsCcsIndex } from '../../common/get_synthetics_indices';
import type { JourneyStep, Ping, SyntheticsJourneyApiResponse } from '../../common/runtime_types';

export interface GetJourneyDetails {
  checkGroup: string;
  remoteName?: string;
  timestamp?: string;
}

type DocumentSource = (Ping & { '@timestamp': string; synthetics: { type: string } }) | JourneyStep;

export const getJourneyDetails = async ({
  syntheticsEsClient,
  checkGroup,
  remoteName,
  timestamp,
}: GetJourneyDetails & {
  syntheticsEsClient: SyntheticsEsClient;
}): Promise<SyntheticsJourneyApiResponse['details']> => {
  const index = getSyntheticsCcsIndex(remoteName, syntheticsEsClient.heartbeatIndices);

  const params = createEsParams({
    index,
    query: {
      bool: {
        // The current-run lookup targets a single `check_group`, so it can be
        // bounded to the run's `@timestamp` to prune frozen-tier shards. The
        // sibling (previous/next) queries below are intentionally left unbounded
        // since an adjacent run can be arbitrarily far away in time.
        filter: [
          {
            term: {
              'monitor.check_group': checkGroup,
            },
          },
          {
            terms: {
              'synthetics.type': ['journey/start', 'heartbeat/summary'],
            },
          },
          ...(timestamp ? [getCheckGroupTimeRangeFilter(timestamp)] : []),
        ] as QueryDslQueryContainer[],
      },
    },
    size: 2,
  });

  const { body: thisJourney } = await syntheticsEsClient.search<DocumentSource, typeof params>(
    params,
    'getJourneyDetailsCurrentJourney'
  );

  const journeyStartHit = thisJourney.hits.hits.find(
    (hit) => hit._source.synthetics?.type === 'journey/start'
  );

  const journeySummaryHit = thisJourney.hits.hits.find(
    ({ _source: summarySource }) => summarySource.synthetics?.type === 'heartbeat/summary'
  );

  const foundJourney = journeyStartHit || journeySummaryHit;

  const journeySource = journeySummaryHit?._source ?? journeyStartHit?._source;

  if (journeySource && foundJourney) {
    const baseSiblingParams = createEsParams({
      index,
      query: {
        bool: {
          must_not: [
            {
              term: {
                'monitor.check_group': {
                  value: journeySource.monitor.check_group,
                },
              },
            },
          ],
          filter: [
            {
              term: {
                'monitor.id': journeySource.monitor.id,
              },
            },
            {
              term: {
                'observer.geo.name': journeySource.observer?.geo?.name,
              },
            },
            {
              terms: {
                'synthetics.type': ['journey/start', 'heartbeat/summary'],
              },
            },
          ] as QueryDslQueryContainer[],
        },
      },
      _source: ['@timestamp', 'monitor.check_group'],
      size: 1,
    });

    const previousParams = createEsParams({
      ...baseSiblingParams,
      query: {
        bool: {
          must_not: baseSiblingParams.query.bool.must_not,
          filter: [
            ...baseSiblingParams.query.bool.filter,
            {
              range: {
                '@timestamp': {
                  lt: journeySource['@timestamp'],
                },
              },
            },
          ],
        },
      },
      sort: [{ '@timestamp': { order: 'desc' as const } }],
    });

    const nextParams = createEsParams({
      ...baseSiblingParams,
      query: {
        bool: {
          must_not: baseSiblingParams.query.bool.must_not,
          filter: [
            ...baseSiblingParams.query.bool.filter,
            {
              range: {
                '@timestamp': {
                  gt: journeySource['@timestamp'],
                },
              },
            },
          ],
        },
      },
      sort: [{ '@timestamp': { order: 'asc' as const } }],
    });

    const [previousJourneyPromise, nextJourneyPromise] = await Promise.all([
      syntheticsEsClient.search<JourneyStep, typeof previousParams>(
        previousParams,
        'getJourneyDetailsPreviousJourney'
      ),
      syntheticsEsClient.search<JourneyStep, typeof nextParams>(
        nextParams,
        'getJourneyDetailsNextJourney'
      ),
    ]);

    const { body: previousJourneyResult } = previousJourneyPromise;
    const { body: nextJourneyResult } = nextJourneyPromise;

    const previousJourney = previousJourneyResult?.hits?.hits?.[0];
    const nextJourney = nextJourneyResult?.hits?.hits?.[0];

    const summaryPing = thisJourney.hits.hits.find(
      ({ _source: summarySource }) => summarySource.synthetics?.type === 'heartbeat/summary'
    )?._source;

    return {
      timestamp: journeySource['@timestamp'],
      journey: { ...journeySource, _id: foundJourney._id! },
      ...(summaryPing && 'state' in summaryPing && summaryPing.state
        ? {
            summary: {
              state: summaryPing.state,
            },
          }
        : {}),
      previous: filterNextPrevJourney(journeySource.monitor.check_group, previousJourney?._source),
      next: filterNextPrevJourney(journeySource.monitor.check_group, nextJourney?._source),
    };
  } else {
    return null;
  }
};

const filterNextPrevJourney = (checkGroup: string, pingSource: DocumentSource) => {
  return pingSource && pingSource.monitor.check_group !== checkGroup
    ? {
        checkGroup: pingSource.monitor.check_group,
        timestamp: pingSource['@timestamp'],
      }
    : undefined;
};
