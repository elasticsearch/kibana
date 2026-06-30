/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ElasticsearchClient,
  Logger,
  SavedObject,
  SavedObjectsClientContract,
  SavedObjectReference,
  SecurityServiceStart,
} from '@kbn/core/server';
import { isSavedObjectErrorResult } from '@kbn/core-saved-objects-server';
import type { SetOptional } from 'type-fest';
import type {
  AggregationsStringTermsAggregate,
  AggregationsStringTermsBucket,
} from '@elastic/elasticsearch/lib/api/types';
import type { WatchlistObject } from '../../../../../common/api/entity_analytics/watchlists/management/common.gen';
import type { MonitoringEntitySource } from '../../../../../common/api/entity_analytics/watchlists/data_source/common.gen';
import { validateWatchlistUpdate } from './validation';
import { getIndexForWatchlist } from '../entities/utils';
import { generateWatchlistEntityIndexMappings } from '../entities/mappings';
import { watchlistConfigTypeName } from './saved_object/watchlist_config_type';
import { createOrUpdateIndex } from '../../utils/create_or_update_index';
import { watchlistEntitySourceTypeName } from '../entity_sources/infra';
import { invalidateEntitySourceApiKey } from '../entity_sources/entity_source_api_key';

export const MAX_PER_PAGE = 10_000;

interface WatchlistConfigClientDeps {
  soClient: SavedObjectsClientContract;
  esClient: ElasticsearchClient;
  /**
   * Used for system index operations (e.g. creating the watchlist backing index).
   * Hidden indices require the `x-elastic-product-origin: kibana` header which is
   * only attached when using the internal client.
   */
  internalEsClient?: ElasticsearchClient;
  securityServiceStart?: SecurityServiceStart;
  namespace: string;
  logger: Logger;
}

type WatchlistSavedObjectAttributes = Omit<WatchlistObject, 'id' | 'createdAt' | 'updatedAt'>;
type WatchlistUpdateAttrs = Partial<WatchlistSavedObjectAttributes>;
type WatchlistObjectWithId = WatchlistObject & { id: string };

const omitWatchlistMeta = (
  watchlist: Partial<WatchlistObject>
): Partial<WatchlistSavedObjectAttributes> => {
  const {
    id: _ignoredId,
    createdAt: _ignoredCreatedAt,
    updatedAt: _ignoredUpdatedAt,
    ...attrs
  } = watchlist;
  return attrs;
};

const ENTITY_SOURCE_REF_NAME_PREFIX = 'entity-source_';

const isEntitySourceRef = (ref: SavedObjectReference): boolean =>
  ref.type === watchlistEntitySourceTypeName && ref.name.startsWith(ENTITY_SOURCE_REF_NAME_PREFIX);

const extractEntitySourceIds = (references: SavedObjectReference[]): string[] =>
  references.filter(isEntitySourceRef).map((ref) => ref.id);

// TODO: Update WatchlistObject OpenAPI schema to include entitySourceIds
const toWatchlistObject = (so: SavedObject<WatchlistSavedObjectAttributes>): WatchlistObject => ({
  ...so.attributes,
  id: so.id,
  createdAt: so.created_at,
  updatedAt: so.updated_at,
  entitySourceIds: extractEntitySourceIds(so.references ?? []),
});

export interface WatchlistValidationError extends Error {
  statusCode: number;
}

export const createWatchlistValidationError = (
  statusCode: number,
  message: string
): WatchlistValidationError => {
  const error = new Error(message) as WatchlistValidationError;
  error.statusCode = statusCode;
  return error;
};

export class WatchlistConfigClient {
  constructor(private readonly deps: WatchlistConfigClientDeps) {}

  async create(
    attrs: SetOptional<WatchlistSavedObjectAttributes, 'managed'>,
    options?: { id?: string }
  ): Promise<WatchlistObject> {
    const so = await this.deps.soClient.create<WatchlistSavedObjectAttributes>(
      watchlistConfigTypeName,
      { ...attrs, managed: attrs.managed ?? false },
      { id: options?.id, refresh: 'wait_for' }
    );

    if (!this.deps.internalEsClient) {
      throw new Error('internalEsClient is required to create a watchlist index');
    }

    await createOrUpdateIndex({
      esClient: this.deps.internalEsClient,
      logger: this.deps.logger,
      options: {
        index: getIndexForWatchlist(this.deps.namespace),
        mappings: generateWatchlistEntityIndexMappings(),
        settings: { hidden: true },
      },
    });

    return toWatchlistObject(so);
  }

  async update(id: string, attrs: WatchlistUpdateAttrs): Promise<WatchlistObject> {
    const existing = await this.get(id);

    validateWatchlistUpdate(id, attrs, existing);

    const existingAttrs = omitWatchlistMeta(existing);
    const attrsNoMeta = omitWatchlistMeta(attrs);
    const update: Partial<WatchlistSavedObjectAttributes> = {
      ...existingAttrs,
      ...attrsNoMeta,
    };
    await this.deps.soClient.update<WatchlistSavedObjectAttributes>(
      watchlistConfigTypeName,
      id,
      update,
      { refresh: 'wait_for' }
    );
    return this.get(id);
  }

  /**
   * List all watchlists and populate entity counts for each watchlist
   * @returns List of watchlists with entity counts
   */
  async list(limit: number = MAX_PER_PAGE): Promise<WatchlistObjectWithId[]> {
    const response = await this.deps.soClient.find<WatchlistObject>({
      type: watchlistConfigTypeName,
      namespaces: [this.deps.namespace],
      perPage: limit,
    });
    const watchlists = response.saved_objects.map(
      (so) => toWatchlistObject(so) as WatchlistObjectWithId
    );
    const watchlistIds = watchlists.map((w) => w.id);
    if (watchlistIds.length > 0) {
      const countsMap = await this.getEntityCounts(watchlistIds);
      for (const w of watchlists) {
        w.entityCount = countsMap[w.id] ?? 0;
      }
    }
    return watchlists;
  }

  async get(id: string) {
    try {
      const so = await this.deps.soClient.get<WatchlistSavedObjectAttributes>(
        watchlistConfigTypeName,
        id
      );
      const watchlist = toWatchlistObject(so);
      watchlist.entityCount = await this.getEntityCount(id);
      return watchlist;
    } catch (e) {
      if (e.output && e.output.statusCode === 404) {
        throw new Error(`Watchlist config '${id}' not found`);
      }
      throw e;
    }
  }

  async delete(id: string) {
    const securityServiceStart = this.deps.securityServiceStart;

    // Step 1: Fetch all entity source linked to the watchlist
    const entitySourceIds = await this.getEntitySourceIds(id);
    const indexSourcesApiKeyIdMap = new Map<string, string>();
    if (securityServiceStart && entitySourceIds.length > 0) {
      const soResults = await this.deps.soClient.bulkGet<MonitoringEntitySource>(
        entitySourceIds.map((sourceId) => ({ type: watchlistEntitySourceTypeName, id: sourceId }))
      );

      soResults.saved_objects.forEach((so) => {
        if (
          !isSavedObjectErrorResult(so) &&
          so.attributes.type === 'index' &&
          !!so.attributes.apiKeyId
        ) {
          indexSourcesApiKeyIdMap.set(so.id, so.attributes.apiKeyId);
        }
      });
    }

    // Step 2: Cascade-delete linked entity sources to prevent orphans
    const results = await Promise.allSettled(
      entitySourceIds.map((sourceId) =>
        this.deps.soClient.delete(watchlistEntitySourceTypeName, sourceId, {
          refresh: 'wait_for',
        })
      )
    );

    const successfullyDeletedSourceIds: string[] = [];
    for (const [i, result] of results.entries()) {
      const sourceId = entitySourceIds[i];
      if (result.status === 'rejected') {
        this.deps.logger.warn(
          `Failed to delete entity source '${sourceId}' while deleting watchlist '${id}': ${result.reason.message}`
        );
      } else {
        successfullyDeletedSourceIds.push(sourceId);
      }
    }

    // Step 3: Invalidate API keys for successfully deleted entity sources
    if (securityServiceStart && successfullyDeletedSourceIds.length > 0) {
      await Promise.allSettled(
        successfullyDeletedSourceIds.flatMap((sourceId) => {
          const apiKeyId = indexSourcesApiKeyIdMap.get(sourceId);
          return apiKeyId
            ? [invalidateEntitySourceApiKey(securityServiceStart, apiKeyId, this.deps.logger)]
            : [];
        })
      );
    }

    return this.deps.soClient.delete(watchlistConfigTypeName, id, { refresh: 'wait_for' });
  }

  async addEntitySourceReference(watchlistId: string, entitySourceId: string): Promise<void> {
    const so = await this.deps.soClient.get<WatchlistSavedObjectAttributes>(
      watchlistConfigTypeName,
      watchlistId
    );

    const existingRefs = so.references ?? [];
    const alreadyLinked = existingRefs.some(
      (ref) => isEntitySourceRef(ref) && ref.id === entitySourceId
    );

    if (alreadyLinked) {
      return;
    }

    const newRef: SavedObjectReference = {
      name: `${ENTITY_SOURCE_REF_NAME_PREFIX}${entitySourceId}`,
      type: watchlistEntitySourceTypeName,
      id: entitySourceId,
    };

    await this.deps.soClient.update<WatchlistSavedObjectAttributes>(
      watchlistConfigTypeName,
      watchlistId,
      {},
      { references: [...existingRefs, newRef], refresh: 'wait_for' }
    );
  }

  async removeEntitySourceReference(
    watchlistId: string,
    source: MonitoringEntitySource
  ): Promise<void> {
    const so = await this.deps.soClient.get<WatchlistSavedObjectAttributes>(
      watchlistConfigTypeName,
      watchlistId
    );

    if (source.managed === true) {
      throw createWatchlistValidationError(
        400,
        `Cannot delete managed entity source '${source.id}'`
      );
    }

    const existingRefs = so.references ?? [];
    const hasRef = existingRefs.some((ref) => isEntitySourceRef(ref) && ref.id === source.id);

    if (!hasRef) {
      throw createWatchlistValidationError(
        404,
        `Entity source '${source.id}' is not linked to watchlist '${watchlistId}'`
      );
    }

    const filteredRefs = existingRefs.filter(
      (ref) => !(isEntitySourceRef(ref) && ref.id === source.id)
    );

    await this.deps.soClient.update<WatchlistSavedObjectAttributes>(
      watchlistConfigTypeName,
      watchlistId,
      {},
      { references: filteredRefs, refresh: 'wait_for' }
    );
  }

  async getEntitySourceIds(watchlistId: string): Promise<string[]> {
    const so = await this.deps.soClient.get<WatchlistSavedObjectAttributes>(
      watchlistConfigTypeName,
      watchlistId
    );

    return extractEntitySourceIds(so.references ?? []);
  }

  async getEntityCount(id: string): Promise<number> {
    const counts = await this.getEntityCounts([id]);
    return counts[id] ?? 0;
  }

  /**
   * Bulk fetch entity counts for a list of watchlists
   * @param ids List of watchlist IDs to fetch entity counts for
   * @returns Map of watchlist IDs to entity counts
   */
  async getEntityCounts(ids: string[]): Promise<Record<string, number>> {
    if (ids.length === 0) return {};

    const index = getIndexForWatchlist(this.deps.namespace);
    const counts: Record<string, number> = {};

    // Initialize all requested IDs to 0 so they are guaranteed to exist in the response
    for (const id of ids) {
      counts[id] = 0;
    }

    try {
      const countResponse = await this.deps.esClient.search({
        index,
        ignore_unavailable: true,
        size: 0,
        query: {
          terms: {
            'watchlist.id': ids,
          },
        },
        aggs: {
          watchlist_counts: {
            terms: {
              field: 'watchlist.id',
              size: ids.length,
            },
          },
        },
      });

      const watchlistCountsAgg = countResponse.aggregations?.watchlist_counts as
        | AggregationsStringTermsAggregate
        | undefined;
      const buckets = (watchlistCountsAgg?.buckets as AggregationsStringTermsBucket[]) ?? [];
      for (const bucket of buckets) {
        counts[String(bucket.key)] = bucket.doc_count;
      }
    } catch (err) {
      this.deps.logger.warn(`Failed to fetch watchlist entity counts: ${(err as Error).message}`);
    }

    return counts;
  }
}
