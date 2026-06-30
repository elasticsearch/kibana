/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import type { CRUDClient } from '@kbn/entity-store/server/domain/crud/crud_client';
import type { EntityType } from '@kbn/entity-store/common';
import type { Entity } from '@kbn/entity-store/common/domain/definitions/entity.gen';
import type { EntityStoreCRUDClient } from '@kbn/entity-store/server';

export interface EntityRef {
  euid: string;
  type: EntityType;
  currentWatchlists?: string[];
}

/**
 * Updates the entity store to add the watchlist ID to each entity's
 * `entity.attributes.watchlists` array using the v2 CRUD client.
 */
export const addWatchlistAttributeToStore = async ({
  crudClient,
  logger,
  entityRefs,
  watchlistId,
}: {
  crudClient: EntityStoreCRUDClient;
  logger: Logger;
  entityRefs: EntityRef[];
  watchlistId: string;
}): Promise<void> => {
  if (entityRefs.length === 0) return;

  const objects = entityRefs.map(({ euid, type, currentWatchlists }) => {
    const watchlists = Array.isArray(currentWatchlists)
      ? currentWatchlists
      : typeof currentWatchlists === 'string'
      ? [currentWatchlists]
      : [];
    const updated = watchlists.includes(watchlistId) ? watchlists : [...watchlists, watchlistId];

    return {
      type,
      doc: {
        entity: {
          id: euid,
          attributes: {
            watchlists: updated,
          },
        },
      } satisfies Entity,
    };
  });

  await crudClient.bulkUpdateEntity({ objects }).catch((err) => {
    logger.error(`[WatchlistSync] Entity store bulkUpdateEntity error: ${err}`);
    throw err;
  });
};

/**
 * Updates the entity store to remove the watchlist ID from each entity's
 * `entity.attributes.watchlists` array using the v2 CRUD client.
 */
export const removeWatchlistAttributeFromStore = async ({
  crudClient,
  logger,
  entityRefs,
  watchlistId,
}: {
  crudClient: CRUDClient;
  logger: Logger;
  entityRefs: EntityRef[];
  watchlistId: string;
}): Promise<void> => {
  // Only update entities whose current watchlists are known — if we don't have the current value we'd blindly write an empty array to the store.
  const knownRefs = entityRefs.filter(
    (ref): ref is EntityRef & { currentWatchlists: string[] } =>
      Boolean(ref.currentWatchlists) && Array.isArray(ref.currentWatchlists)
  );
  if (knownRefs.length === 0) return;

  const objects = knownRefs.map(({ euid, type, currentWatchlists }) => {
    const updated = currentWatchlists.filter((w) => w !== watchlistId);

    return {
      type,
      doc: {
        entity: {
          id: euid,
          attributes: {
            watchlists: updated,
          },
        },
      } satisfies Entity,
    };
  });

  await crudClient.bulkUpdateEntity({ objects }).catch((err) => {
    logger.error(`[WatchlistSync] Entity store bulkUpdateEntity error: ${err}`);
    throw err;
  });
};
