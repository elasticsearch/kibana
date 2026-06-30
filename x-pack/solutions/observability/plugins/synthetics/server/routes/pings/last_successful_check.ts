/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { getJourneyScreenshot } from '../../queries/get_journey_screenshot';
import { getLastSuccessfulCheck } from '../../queries/get_last_successful_check';
import type { Ping } from '../../../common/runtime_types';
import { isFullScreenshot, isRefResult } from '../../../common/runtime_types';
import { SYNTHETICS_API_URLS } from '../../../common/constants';
import type { RouteContext, SyntheticsRestApiRouteFactory } from '../types';

export const createLastSuccessfulCheckRoute: SyntheticsRestApiRouteFactory = () => ({
  method: 'GET',
  path: SYNTHETICS_API_URLS.SYNTHETICS_SUCCESSFUL_CHECK,
  validate: {
    query: schema.object({
      monitorId: schema.string(),
      stepIndex: schema.number(),
      timestamp: schema.string(),
      location: schema.maybe(schema.string()),
      remoteName: schema.maybe(schema.string({ maxLength: 256 })),
    }),
  },
  handler: async (routeProps) => {
    return await getLastSuccessfulCheckScreenshot(routeProps);
  },
});

export const getLastSuccessfulCheckScreenshot = async ({
  response,
  request,
  syntheticsEsClient,
}: RouteContext) => {
  const { timestamp, monitorId, stepIndex, location, remoteName } = request.query;

  const check: Ping | null = await getLastSuccessfulCheck({
    syntheticsEsClient,
    monitorId,
    timestamp,
    location,
    remoteName,
  });

  if (check === null) {
    return response.notFound();
  }

  if (!check.monitor.check_group) {
    return response.ok({ body: check });
  }

  const screenshot = await getJourneyScreenshot({
    syntheticsEsClient,
    checkGroup: check.monitor.check_group,
    stepIndex,
    remoteName,
    // The screenshot documents share the resolved check's `@timestamp`, so
    // bound the lookup to that run to allow shard pruning instead of scanning
    // every backing index (including frozen-tier ones).
    timestamp: check['@timestamp'],
  });

  if (screenshot === null) {
    return response.ok({ body: check });
  }

  if (check.synthetics) {
    check.synthetics.isScreenshotRef = isRefResult(screenshot);
    check.synthetics.isFullScreenshot = isFullScreenshot(screenshot);
  }

  return response.ok({
    body: check,
  });
};
