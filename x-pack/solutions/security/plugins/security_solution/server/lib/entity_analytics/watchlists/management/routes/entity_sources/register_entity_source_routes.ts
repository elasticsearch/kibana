/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EntityAnalyticsRoutesDeps } from '../../../../types';
import { createEntitySourceRoute } from './create';
import { getEntitySourceRoute } from './get';
import { updateEntitySourceRoute } from './update';
import { deleteEntitySourceRoute } from './delete';
import { listEntitySourcesRoute } from './list';

export const registerEntitySourceRoutes = (
  router: EntityAnalyticsRoutesDeps['router'],
  logger: EntityAnalyticsRoutesDeps['logger'],
  getStartServices: EntityAnalyticsRoutesDeps['getStartServices'],
  hasEncryptionKey: EntityAnalyticsRoutesDeps['hasEncryptionKey']
) => {
  createEntitySourceRoute(router, logger, getStartServices, hasEncryptionKey);
  getEntitySourceRoute(router, logger, getStartServices, hasEncryptionKey);
  updateEntitySourceRoute(router, logger, getStartServices, hasEncryptionKey);
  deleteEntitySourceRoute(router, logger, getStartServices, hasEncryptionKey);
  listEntitySourcesRoute(router, logger, getStartServices, hasEncryptionKey);
};
