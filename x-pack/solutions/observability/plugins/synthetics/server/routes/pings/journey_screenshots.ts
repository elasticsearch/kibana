/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { journeyScreenshotHandler } from '../../queries/journey_screenshots';
import type { SyntheticsRestApiRouteFactory } from '../types';
import { SYNTHETICS_API_URLS } from '../../../common/constants';

export const createJourneyScreenshotRoute: SyntheticsRestApiRouteFactory = () => ({
  method: 'GET',
  path: SYNTHETICS_API_URLS.JOURNEY_SCREENSHOT,
  validate: {
    params: schema.object({
      checkGroup: schema.string(),
      stepIndex: schema.number(),
    }),
    query: schema.object({
      remoteName: schema.maybe(schema.string({ maxLength: 256 })),
      timestamp: schema.maybe(schema.string({ maxLength: 30 })),
    }),
  },
  handler: async (routeProps) => {
    return await journeyScreenshotHandler(routeProps);
  },
});
