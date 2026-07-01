/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import * as t from 'io-ts';
import { jsonRt } from '@kbn/io-ts-utils';
import { apmServiceGroupMaxNumberOfServices } from '@kbn/observability-plugin/common';
import type { BoolQuery } from '@kbn/es-query';
import type { ServiceMapResponse } from '../../../common/service_map';
import { isActivePlatinumLicense } from '../../../common/license_check';
import { invalidLicenseMessage } from '../../../common/service_map/utils';
import { notifyFeatureUsage } from '../../feature';
import { getSearchTransactionsEvents } from '../../lib/helpers/transactions';
import { getMlClient } from '../../lib/helpers/get_ml_client';
import { getServiceMap } from './get_service_map';
import type { ServiceMapServiceDependencyInfoResponse } from './get_service_map_dependency_node_info';
import { getServiceMapDependencyNodeInfo } from './get_service_map_dependency_node_info';
import { createApmServerRoute } from '../apm_routes/create_apm_server_route';
import { environmentRt, rangeRt, kueryRt } from '../default_api_types';
import { getServiceGroup } from '../service_groups/get_service_group';
import { offsetRt } from '../../../common/comparison_rt';
import { getApmEventClient } from '../../lib/helpers/get_apm_event_client';
import { getApmAlertsClient } from '../../lib/helpers/get_apm_alerts_client';
import { getApmSloClient } from '../../lib/helpers/get_apm_slo_client';
import {
  getServiceMapServiceBadges,
  type ServiceMapServiceBadgesResponse,
} from './get_service_map_service_badges';

const serviceMapRoute = createApmServerRoute({
  endpoint: 'GET /internal/apm/service-map',
  params: t.type({
    query: t.intersection([
      t.partial({
        serviceName: t.string,
        serviceGroup: t.string,
        kuery: kueryRt.props.kuery,
        // JSON-serialised ES query produced by buildEsQuery() on the client.
        // Carries filter-bar pills + Controls API selections already merged.
        esQuery: jsonRt,
      }),
      environmentRt,
      rangeRt,
    ]),
  }),
  security: { authz: { requiredPrivileges: ['apm'] } },
  handler: async (resources): Promise<ServiceMapResponse> => {
    const { config, context, params, logger } = resources;
    if (!config.serviceMapEnabled) {
      throw Boom.notFound();
    }

    const licensingContext = await context.licensing;
    if (!isActivePlatinumLicense(licensingContext.license)) {
      throw Boom.forbidden(invalidLicenseMessage);
    }

    notifyFeatureUsage({
      licensingPlugin: licensingContext,
      featureName: 'serviceMaps',
    });

    const {
      query: { serviceName, serviceGroup: serviceGroupId, environment, start, end, kuery, esQuery },
    } = params;

    const {
      savedObjects: { client: savedObjectsClient },
      uiSettings: { client: uiSettingsClient },
    } = await context.core;

    const [mlClient, apmEventClient, serviceGroup, maxNumberOfServices] = await Promise.all([
      getMlClient(resources),
      getApmEventClient(resources),
      serviceGroupId
        ? getServiceGroup({
            savedObjectsClient,
            serviceGroupId,
          })
        : Promise.resolve(null),
      uiSettingsClient.get<number>(apmServiceGroupMaxNumberOfServices),
    ]);

    const searchAggregatedTransactions = await getSearchTransactionsEvents({
      apmEventClient,
      config,
      start,
      end,
      kuery,
    });

    return getServiceMap({
      mlClient,
      config,
      apmEventClient,
      serviceName,
      environment,
      searchAggregatedTransactions,
      logger: logger.get('serviceMap'),
      start,
      end,
      maxNumberOfServices,
      serviceGroupKuery: serviceGroup?.kuery,
      kuery,
      esQuery: esQuery as { bool: BoolQuery } | undefined,
    });
  },
});

const serviceMapDependencyNodeRoute = createApmServerRoute({
  endpoint: 'GET /internal/apm/service-map/dependency',
  params: t.type({
    query: t.intersection([
      t.type({
        dependencies: t.union([t.string, t.array(t.string)]),
      }),
      t.partial({
        sourceServiceName: t.string,
      }),
      environmentRt,
      rangeRt,
      offsetRt,
    ]),
  }),
  security: { authz: { requiredPrivileges: ['apm'] } },
  handler: async (resources): Promise<ServiceMapServiceDependencyInfoResponse> => {
    const { config, context, params } = resources;

    if (!config.serviceMapEnabled) {
      throw Boom.notFound();
    }
    const licensingContext = await context.licensing;
    if (!isActivePlatinumLicense(licensingContext.license)) {
      throw Boom.forbidden(invalidLicenseMessage);
    }
    const apmEventClient = await getApmEventClient(resources);

    const {
      query: { dependencies, sourceServiceName, environment, start, end, offset },
    } = params;

    return getServiceMapDependencyNodeInfo({
      apmEventClient,
      sourceServiceName,
      dependencies: Array.isArray(dependencies) ? dependencies : [dependencies],
      start,
      end,
      environment,
      offset,
    });
  },
});

const serviceMapServiceBadgesRoute = createApmServerRoute({
  endpoint: 'POST /internal/apm/service-map/service_badges',
  params: t.type({
    query: t.intersection([
      environmentRt,
      rangeRt,
      t.partial({
        kuery: t.string,
      }),
    ]),
    body: t.type({ serviceNames: jsonRt.pipe(t.array(t.string)) }),
  }),
  security: { authz: { requiredPrivileges: ['apm'] } },
  handler: async (resources): Promise<ServiceMapServiceBadgesResponse> => {
    const { config, context, params } = resources;

    if (!config.serviceMapEnabled) {
      throw Boom.notFound();
    }
    const licensingContext = await context.licensing;
    if (!isActivePlatinumLicense(licensingContext.license)) {
      throw Boom.forbidden(invalidLicenseMessage);
    }

    const {
      query: { environment, start, end, kuery },
      body: { serviceNames },
    } = params;

    const [apmAlertsClient, sloClient] = await Promise.all([
      getApmAlertsClient(resources).catch((): undefined => undefined),
      getApmSloClient(resources),
    ]);

    return getServiceMapServiceBadges({
      serviceNames,
      environment,
      start,
      end,
      kuery,
      apmAlertsClient,
      sloClient,
    });
  },
});

export const serviceMapRouteRepository = {
  ...serviceMapRoute,
  ...serviceMapDependencyNodeRoute,
  ...serviceMapServiceBadgesRoute,
};
