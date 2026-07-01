/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { HttpServiceSetup, Logger, RequestHandlerContext } from '@kbn/core/server';
import type { UsageCounter } from '@kbn/usage-collection-plugin/server';

import { registerCreateRoute } from './create';
import { registerDeleteRoute } from './delete';
import { registerReadRoute } from './read';
import { registerSearchRoute } from './search';
import { registerUpdateRoute } from './update';

export function registerRoutes(
  http: HttpServiceSetup,
  usageCounter: UsageCounter | undefined,
  logger: Logger
) {
  const { versioned: versionedRouter } = http.createRouter<RequestHandlerContext>();
  registerCreateRoute(versionedRouter, usageCounter, logger);
  registerReadRoute(versionedRouter, usageCounter, logger);
  registerUpdateRoute(versionedRouter, usageCounter, logger);
  registerDeleteRoute(versionedRouter, usageCounter, logger);
  registerSearchRoute(versionedRouter, usageCounter, logger);
}
