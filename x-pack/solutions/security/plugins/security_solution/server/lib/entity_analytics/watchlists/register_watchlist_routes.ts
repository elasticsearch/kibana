/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EntityAnalyticsRoutesDeps } from '../types';
import {
  createWatchlistRoute,
  deleteWatchlistRoute,
  getWatchlistRoute,
  listWatchlistsRoute,
  watchlistsPrivilegesRoute,
  searchWatchlistIndicesRoute,
  updateWatchlistRoute,
} from './management/routes';
import { registerEntitySourceRoutes } from './management/routes/entity_sources';
import { syncWatchlistRoute } from './management/routes/sync';
import { csvUploadRoute } from './management/routes/csv_upload';
import { registerManualEntityRoutes } from './management/routes/entities';
import { installPrebuiltWatchlistsRoute } from './management/routes/prebuilt_install';

export const registerWatchlistRoutes = ({
  router,
  logger,
  getStartServices,
  telemetrySender,
  hasEncryptionKey,
}: EntityAnalyticsRoutesDeps) => {
  installPrebuiltWatchlistsRoute(router, logger, getStartServices, hasEncryptionKey);
  createWatchlistRoute(router, logger, telemetrySender, getStartServices, hasEncryptionKey);
  deleteWatchlistRoute(router, logger, getStartServices, hasEncryptionKey);
  getWatchlistRoute(router, logger);
  watchlistsPrivilegesRoute(router, logger, getStartServices);
  listWatchlistsRoute(router, logger);
  searchWatchlistIndicesRoute(router, logger);
  updateWatchlistRoute(router, logger, telemetrySender);
  registerEntitySourceRoutes(router, logger, getStartServices, hasEncryptionKey);
  syncWatchlistRoute(router, logger, getStartServices, hasEncryptionKey);
  csvUploadRoute({ router, logger, getStartServices });
  registerManualEntityRoutes(router, logger);
};
