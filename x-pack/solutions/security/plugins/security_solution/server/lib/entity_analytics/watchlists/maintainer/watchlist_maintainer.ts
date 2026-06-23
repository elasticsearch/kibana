/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import { SECURITY_EXTENSION_ID } from '@kbn/core-saved-objects-server';
import type { RegisterEntityMaintainerConfig } from '@kbn/entity-store/server';
import type { EntityAnalyticsRoutesDeps } from '../../types';
import { createEntitySourcesService } from '../entity_sources/entity_sources_service';
import { watchlistEntitySourceTypeName } from '../entity_sources/infra';

export interface WatchlistMaintainerDeps {
  getStartServices: EntityAnalyticsRoutesDeps['getStartServices'];
  logger: Logger;
  hasEncryptionKey: EntityAnalyticsRoutesDeps['hasEncryptionKey'];
}

type WatchlistMaintainerConfig = Pick<RegisterEntityMaintainerConfig, 'setup' | 'run'>;

export const createWatchlistMaintainer = ({
  getStartServices,
  logger,
  hasEncryptionKey,
}: WatchlistMaintainerDeps): WatchlistMaintainerConfig => ({
  setup: async ({ status }) => {
    const namespace = status.metadata.namespace;
    logger.debug(`Initializing watchlist maintainer for namespace "${namespace}"`);
    logger.info(`Watchlist maintainer setup completed for namespace "${namespace}"`);
    return status.state;
  },
  run: async ({ status, esClient, fakeRequest, abortController }) => {
    const namespace = status.metadata.namespace;

    const [coreStart, pluginsStart] = await getStartServices();
    const license = await pluginsStart.licensing.getLicense();

    if (!license.hasAtLeast('platinum')) {
      logger.debug('Watchlist maintainer run skipped due to insufficient license');
      return status.state;
    }

    logger.debug(`Watchlist maintainer run for namespace "${namespace}"`);

    // Use the authenticated fakeRequest from the task manager (created with the
    // credentials of the user who installed the Entity Store) rather than
    // buildScopedInternalSavedObjectsClientUnsafe, which builds its own fake
    // request with empty headers and no auth credentials.
    const soClient = coreStart.savedObjects.getScopedClient(fakeRequest, {
      excludedExtensions: [SECURITY_EXTENSION_ID],
      includedHiddenTypes: [watchlistEntitySourceTypeName],
    });

    const entitySourcesService = createEntitySourcesService({
      esClient,
      soClient,
      logger,
      namespace,
      getStartServices,
      hasEncryptionKey,
    });

    await entitySourcesService.syncAllWatchlists({ abortSignal: abortController.signal });

    return status.state;
  },
});

export type RegisterWatchlistMaintainerDeps = WatchlistMaintainerDeps;
