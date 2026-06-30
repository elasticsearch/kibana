/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import type { SyntheticsEsClient } from '../lib';
import { getCheckGroupTimeRangeFilter } from '../../common/constants/client_defaults';
import { getSyntheticsCcsIndex } from '../../common/get_synthetics_indices';
import type { RefResult, FullScreenshot } from '../../common/runtime_types/ping/synthetics';

interface ResultType {
  _source: RefResult | FullScreenshot;
}

export type ScreenshotReturnTypesUnion =
  | ((FullScreenshot | RefResult) & { totalSteps: number })
  | null;

export const getJourneyScreenshot = async ({
  checkGroup,
  stepIndex,
  syntheticsEsClient,
  remoteName,
  timestamp,
}: {
  checkGroup: string;
  stepIndex: number;
  remoteName?: string;
  timestamp?: string;
} & {
  syntheticsEsClient: SyntheticsEsClient;
}): Promise<ScreenshotReturnTypesUnion> => {
  const body = {
    index: getSyntheticsCcsIndex(remoteName, syntheticsEsClient.heartbeatIndices),
    track_total_hits: true,
    size: 0,
    query: {
      bool: {
        filter: [
          {
            term: {
              'monitor.check_group': checkGroup,
            },
          },
          {
            terms: {
              'synthetics.type': ['step/screenshot', 'step/screenshot_ref'],
            },
          },
          ...(timestamp ? [getCheckGroupTimeRangeFilter(timestamp)] : []),
        ] as QueryDslQueryContainer[],
      },
    },
    aggs: {
      step: {
        filter: {
          term: {
            'synthetics.step.index': stepIndex,
          },
        },
        aggs: {
          image: {
            top_hits: {
              size: 1,
            },
          },
        },
      },
    },
  };

  const result = await syntheticsEsClient.search(body);

  const screenshotsOrRefs =
    (result.body.aggregations?.step.image.hits.hits as ResultType[]) ?? null;

  if (!screenshotsOrRefs || screenshotsOrRefs?.length === 0) return null;

  return {
    ...screenshotsOrRefs[0]._source,
    totalSteps: result.body.hits.total.value,
  };
};
