/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRouter, Logger } from '@kbn/core/server';
import type { AutomaticImportPluginRequestHandlerContext } from '../types';
import { registerIntegrationRoutes } from './integrations_route';
import { registerDataStreamRoutes } from './data_stream_routes';
import { registerIndexMappingRoutes } from './index_mapping_route';

export function registerRoutes(
  router: IRouter<AutomaticImportPluginRequestHandlerContext>,
  logger: Logger
) {
  registerIntegrationRoutes(router, logger);
  registerDataStreamRoutes(router, logger);
  registerIndexMappingRoutes(router, logger);
}
