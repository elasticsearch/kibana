/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { SyntheticsJourneyApiResponse } from '../../../common/runtime_types';
import { getJourneySteps } from '../../queries/get_journey_steps';
import { getJourneyDetails } from '../../queries/get_journey_details';
import type { SyntheticsRestApiRouteFactory } from '../types';
import { SYNTHETICS_API_URLS } from '../../../common/constants';

export const createJourneyRoute: SyntheticsRestApiRouteFactory = () => ({
  method: 'GET',
  path: SYNTHETICS_API_URLS.JOURNEY,
  validate: {
    params: schema.object({
      checkGroup: schema.string(),
    }),
    query: schema.object({
      remoteName: schema.maybe(schema.string({ maxLength: 256 })),
      timestamp: schema.maybe(schema.string({ maxLength: 30 })),
      // Screenshot-only callers (e.g. the "Last 10 test runs" thumbnails) only
      // need `steps`. They set this to skip the `getJourneyDetails` lookup,
      // which also fans out unbounded sibling (prev/next) queries.
      stepsOnly: schema.maybe(schema.boolean()),
    }),
  },
  handler: async ({
    syntheticsEsClient,
    request,
    response,
  }): Promise<SyntheticsJourneyApiResponse> => {
    const { checkGroup } = request.params;
    const { remoteName, timestamp, stepsOnly } = request.query;

    const [steps, details] = await Promise.all([
      getJourneySteps({
        syntheticsEsClient,
        checkGroup,
        remoteName,
        timestamp,
      }),
      stepsOnly
        ? Promise.resolve(null)
        : getJourneyDetails({
            syntheticsEsClient,
            checkGroup,
            remoteName,
            timestamp,
          }),
    ]);

    return {
      steps,
      details,
      checkGroup,
    };
  },
});
