/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import type { SyntheticsEsClient } from '../lib';
import { asMutableArray } from '../../common/utils/as_mutable_array';
import { getCheckGroupTimeRangeFilter } from '../../common/constants/client_defaults';
import { getSyntheticsCcsIndex } from '../../common/get_synthetics_indices';
import type { JourneyStep } from '../../common/runtime_types/ping/synthetics';

export interface GetJourneyStepsParams {
  checkGroup: string;
  remoteName?: string;
  timestamp?: string;
}

type ResultType = JourneyStep & { '@timestamp': string };

export const getJourneySteps = async ({
  syntheticsEsClient,
  checkGroup,
  remoteName,
  timestamp,
}: GetJourneyStepsParams & {
  syntheticsEsClient: SyntheticsEsClient;
}): Promise<JourneyStep[]> => {
  const params = {
    index: getSyntheticsCcsIndex(remoteName, syntheticsEsClient.heartbeatIndices),
    query: {
      bool: {
        filter: [
          {
            terms: {
              'synthetics.type': [
                'cmd/status',
                'journey/browserconsole',
                'step/end',
                'step/screenshot',
                'step/screenshot_ref',
              ],
            },
          },
          {
            term: {
              'monitor.check_group': checkGroup,
            },
          },
          ...(timestamp ? [getCheckGroupTimeRangeFilter(timestamp)] : []),
        ] as QueryDslQueryContainer[],
      },
    },
    sort: asMutableArray([
      { 'synthetics.step.index': { order: 'asc' } },
      { '@timestamp': { order: 'asc' } },
    ] as const),
    _source: {
      excludes: ['synthetics.blob', 'screenshot_ref'],
    },
    size: 500,
  };
  const { body: result } = await syntheticsEsClient.search(params, 'getJourneySteps');

  const steps = result.hits.hits.map(
    ({ _id, _source }) => Object.assign({ _id }, _source) as ResultType
  );

  const screenshotIndexList: number[] = [];
  const refIndexList: number[] = [];
  const stepsWithoutImages: ResultType[] = [];

  /**
   * Store screenshot indexes, we use these to determine if a step has a screenshot below.
   * Store steps that are not screenshots, we return these to the client.
   */
  for (const step of steps) {
    const { synthetics } = step;
    if (synthetics.type === 'step/screenshot' && synthetics?.step?.index) {
      screenshotIndexList.push(synthetics.step.index);
    } else if (synthetics.type === 'step/screenshot_ref' && synthetics?.step?.index) {
      refIndexList.push(synthetics.step.index);
    } else {
      stepsWithoutImages.push(step);
    }
  }

  return stepsWithoutImages.map(({ _id, ...rest }) => ({
    _id,
    ...rest,
    timestamp: rest['@timestamp'],
    synthetics: {
      ...rest.synthetics,
      isFullScreenshot: screenshotIndexList.some((i) => i === rest?.synthetics?.step?.index),
      isScreenshotRef: refIndexList.some((i) => i === rest?.synthetics?.step?.index),
    },
  }));
};
