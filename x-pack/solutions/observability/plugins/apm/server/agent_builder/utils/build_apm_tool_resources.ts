/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreSetup, KibanaRequest, SavedObjectsClientContract } from '@kbn/core/server';
import type { IScopedClusterClient } from '@kbn/core-elasticsearch-server';
import type { ApmDataAccessServices } from '@kbn/apm-data-access-plugin/server';
import { firstValueFrom } from 'rxjs';
import type { APMPluginSetupDependencies, APMPluginStartDependencies } from '../../types';
import { getApmEventClient } from '../../lib/helpers/get_apm_event_client';
import type { MinimalApmPluginRequestHandlerContext } from '../../routes/typings';
import { getMlClient } from '../../lib/helpers/get_ml_client';
import type { MinimalAPMRouteHandlerResources } from '../../routes/apm_routes/register_apm_server_routes';
import { getApmAlertsClient } from '../../lib/helpers/get_apm_alerts_client';
import type { ApmAlertsClient } from '../../lib/helpers/get_apm_alerts_client';
import { getApmSloClient } from '../../lib/helpers/get_apm_slo_client';
import type { ApmSloClient } from '../../lib/helpers/get_apm_slo_client';
import { getRandomSamplerSeed } from '../../lib/helpers/get_random_sampler';

export interface ApmToolResources {
  apmEventClient: Awaited<ReturnType<typeof getApmEventClient>>;
  apmDataAccessServices: ApmDataAccessServices;
  randomSamplerSeed: number;
  mlClient: Awaited<ReturnType<typeof getMlClient>>;
  apmAlertsClient: ApmAlertsClient;
  /** SLO client; undefined when the SLO plugin is not available. */
  sloClient: ApmSloClient | undefined;
  esClient: IScopedClusterClient;
  soClient: SavedObjectsClientContract;
}

export async function buildApmToolResources({
  core,
  plugins,
  request,
  esClient,
}: {
  core: CoreSetup<APMPluginStartDependencies>;
  plugins: APMPluginSetupDependencies;
  request: KibanaRequest;
  esClient?: IScopedClusterClient;
}): Promise<ApmToolResources> {
  const [coreStart, pluginStart] = await core.getStartServices();
  const esScoped = esClient ?? coreStart.elasticsearch.client.asScoped(request);
  const soClient = coreStart.savedObjects.getScopedClient(request, { includedHiddenTypes: [] });
  const uiSettingsClient = coreStart.uiSettings.asScopedToClient(soClient);

  const licensingContext = firstValueFrom(pluginStart.licensing.license$).then((license) => ({
    license,
    featureUsage: pluginStart.licensing.featureUsage,
  }));

  const contextAdapter = {
    core: Promise.resolve({
      savedObjects: { client: soClient },
      uiSettings: { client: uiSettingsClient },
      elasticsearch: { client: esScoped },
    }),
    licensing: licensingContext,
  } as unknown as MinimalApmPluginRequestHandlerContext;

  const pluginsAdapter = {
    ml: plugins.ml
      ? {
          setup: plugins.ml,
          start: async () => pluginStart.ml!,
        }
      : undefined,
    ruleRegistry: {
      setup: plugins.ruleRegistry,
      start: async () => pluginStart.ruleRegistry,
    },
    slo: plugins.slo
      ? {
          setup: plugins.slo,
          start: async () => pluginStart.slo,
        }
      : undefined,
  } as unknown as MinimalAPMRouteHandlerResources['plugins'];

  const apmEventClientPromise = getApmEventClient({
    context: contextAdapter,
    core: {
      setup: core,
      start: () => core.getStartServices().then(([cs]) => cs),
    },
    request,
    params: {
      query: {
        _inspect: false,
      },
    },
    getApmIndices: async () => {
      return plugins.apmDataAccess.getApmIndices(soClient);
    },
  });

  const randomSamplerSeed = getRandomSamplerSeed(coreStart, request);

  const mlClientPromise = getMlClient({
    plugins: pluginsAdapter,
    context: contextAdapter,
    request,
  }).catch(() => undefined);

  const apmAlertsClientPromise = getApmAlertsClient({
    context: contextAdapter,
    plugins: pluginsAdapter,
    request,
  });

  // SLO client degrades gracefully to undefined when the SLO plugin is absent.
  const sloClientPromise = getApmSloClient({
    plugins: pluginsAdapter,
    request,
  }).catch(() => undefined);

  const [apmEventClient, mlClient, apmAlertsClient, sloClient] = await Promise.all([
    apmEventClientPromise,
    mlClientPromise,
    apmAlertsClientPromise,
    sloClientPromise,
  ]);

  const apmDataAccessServices = plugins.apmDataAccess.getServices({ apmEventClient });

  return {
    apmEventClient,
    apmDataAccessServices,
    randomSamplerSeed,
    mlClient,
    apmAlertsClient,
    sloClient,
    esClient: esScoped,
    soClient,
  };
}
