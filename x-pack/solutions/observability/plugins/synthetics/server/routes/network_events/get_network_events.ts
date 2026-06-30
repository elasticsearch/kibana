/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { getNetworkEvents } from '../../queries/get_network_events';
import type { SyntheticsRestApiRouteFactory } from '../types';
import { SYNTHETICS_API_URLS } from '../../../common/constants';

export const createNetworkEventsRoute: SyntheticsRestApiRouteFactory = () => ({
  method: 'GET',
  path: SYNTHETICS_API_URLS.NETWORK_EVENTS,
  validate: {
    query: schema.object({
      checkGroup: schema.string(),
      stepIndex: schema.number(),
      remoteName: schema.maybe(schema.string({ maxLength: 256 })),
      timestamp: schema.maybe(schema.string({ maxLength: 30 })),
    }),
  },
  handler: async ({ syntheticsEsClient, request }): Promise<any> => {
    const { checkGroup, stepIndex, remoteName, timestamp } = request.query;

    return await getNetworkEvents({
      syntheticsEsClient,
      checkGroup,
      stepIndex: String(stepIndex),
      remoteName,
      timestamp,
    });
  },
});
