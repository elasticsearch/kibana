/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CoreSetup, PluginInitializerContext } from '@kbn/core/server';
import type { EsqlServerPluginStart } from '../types';
import { registerGetInferenceEndpointsRoute } from './get_inference_endpoints';
import type { ESQLExtensionsRegistry } from '../extensions_registry';

import { registerGetJoinIndicesRoute } from './get_join_indices';
import { registerGetTimeseriesIndicesRoute } from './get_timeseries_indices';
import { registerGetViewsRoute } from './get_views';
import { registerGetDatasetsRoute } from './get_datasets';
import { registerESQLExtensionsRoute } from './get_esql_extensions_route';
import { registerLookupIndexRoutes } from './lookup_index';
import { registerGetSourcesRoute } from './get_all_sources';
import { registerGetTimeFieldRoute } from './get_timefield';
import { registerNLtoESQLRoute } from './nl_to_esql_route';
import { registerSuggestFixRoute } from './suggest_fix_route';

export const registerRoutes = (
  setup: CoreSetup<EsqlServerPluginStart>,
  extensionsRegistry: ESQLExtensionsRegistry,
  initContext: PluginInitializerContext
) => {
  const router = setup.http.createRouter();

  registerGetJoinIndicesRoute(router, initContext);
  registerGetTimeseriesIndicesRoute(router, initContext);
  registerGetViewsRoute(router, initContext);
  registerGetDatasetsRoute(router, initContext);
  registerESQLExtensionsRoute(router, extensionsRegistry, initContext);
  registerGetInferenceEndpointsRoute(router, initContext);
  registerLookupIndexRoutes(router, initContext);
  registerGetSourcesRoute(router, initContext);
  registerGetTimeFieldRoute(router, initContext);
  registerNLtoESQLRoute(router, setup.getStartServices, initContext);
  registerSuggestFixRoute(router, setup.getStartServices, initContext);
};
