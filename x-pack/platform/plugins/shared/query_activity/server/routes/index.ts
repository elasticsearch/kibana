/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRouter, Logger } from '@kbn/core/server';
import { registerCancelRoute } from './cancel';
import { registerDetailsRoute } from './details';
import { registerPrivilegesRoute } from './privileges';
import { registerSearchRoute } from './search';

export interface RouteOptions {
  router: IRouter;
  logger: Logger;
}

export function registerRoutes(options: RouteOptions) {
  registerCancelRoute(options);
  registerDetailsRoute(options);
  registerPrivilegesRoute(options);
  registerSearchRoute(options);
}
