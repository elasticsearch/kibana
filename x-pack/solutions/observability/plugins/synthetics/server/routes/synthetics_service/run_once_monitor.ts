/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { schema } from '@kbn/config-schema';
import { isEmpty } from 'lodash';
import type { PrivateLocationAttributes } from '../../runtime_types/private_locations';
import { getPrivateLocationsForMonitor } from '../monitor_cruds/add_monitor/utils';
import type { SyntheticsRestApiRouteFactory } from '../types';
import type { MonitorFields } from '../../../common/runtime_types';
import { ConfigKey } from '../../../common/runtime_types';
import { SYNTHETICS_API_URLS } from '../../../common/constants';
import { validateMonitor } from '../monitor_cruds/monitor_validation';

export const runOnceSyntheticsMonitorRoute: SyntheticsRestApiRouteFactory = () => ({
  method: 'POST',
  path: SYNTHETICS_API_URLS.RUN_ONCE_MONITOR + '/{monitorId}',
  validate: {
    body: schema.any(),
    params: schema.object({
      monitorId: schema.string({ minLength: 1, maxLength: 1024 }),
    }),
  },
  handler: async ({
    request,
    response,
    server,
    syntheticsMonitorClient,
    savedObjectsClient,
    spaceId,
  }): Promise<any> => {
    const monitor = request.body as MonitorFields;
    const { monitorId } = request.params;
    if (isEmpty(monitor)) {
      return response.badRequest({ body: { message: 'Monitor data is empty.' } });
    }

    const validationResult = validateMonitor(monitor, spaceId, server.cloud?.isServerlessEnabled);

    const decodedMonitor = validationResult.decodedMonitor;
    if (!validationResult.valid || !decodedMonitor) {
      const { reason: message, details, payload } = validationResult;
      return response.badRequest({ body: { message, attributes: { details, ...payload } } });
    }

    const privateLocations: PrivateLocationAttributes[] = await getPrivateLocationsForMonitor(
      savedObjectsClient,
      decodedMonitor
    );

    const [, errors] = await syntheticsMonitorClient.testNowConfigs(
      {
        monitor: {
          ...decodedMonitor,
          [ConfigKey.CONFIG_ID]: monitorId,
          [ConfigKey.MONITOR_QUERY_ID]: monitorId,
        } as MonitorFields,
        id: monitorId,
        testRunId: monitorId,
      },
      privateLocations,
      spaceId,
      true
    );

    if (errors) {
      return { errors };
    }

    return monitor;
  },
});
