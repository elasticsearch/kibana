/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ElasticsearchClient,
  KibanaRequest,
  Logger,
  SavedObjectsClientContract,
  StartServicesAccessor,
} from '@kbn/core/server';
import _ from 'lodash';
import moment from 'moment';
import type {
  MonitoringEntitySourceAttributes,
  MonitoringEntitySource,
} from '../../../../../../common/api/entity_analytics/watchlists/data_source/common.gen';
import type {
  ListWatchlistEntitySourcesRequestQuery,
  ListWatchlistEntitySourcesResponse,
} from '../../../../../../common/api/entity_analytics/watchlists/data_source/list.gen';
import type { StartPlugins } from '../../../../../plugin';
import { watchlistEntitySourceTypeName } from './entity_source_type';
import {
  grantEntitySourceApiKey,
  invalidateEntitySourceApiKey,
  validateIndexPermissions,
} from '../entity_source_api_key';

export interface WatchlistEntitySourceClientDependencies {
  soClient: SavedObjectsClientContract;
  namespace: string;
  // user's scoped client (`core.elasticsearch.client.asCurrentUser`) - used to validate index read privileges
  esClient: ElasticsearchClient;
  getStartServices: StartServicesAccessor<StartPlugins>;
  logger: Logger;
  hasEncryptionKey: boolean;
}

interface UpsertResult {
  action: 'created' | 'updated';
  source: MonitoringEntitySource;
}

export class WatchlistEntitySourceClient {
  constructor(private readonly dependencies: WatchlistEntitySourceClientDependencies) {}

  async create(
    attributes: MonitoringEntitySourceAttributes,
    request?: KibanaRequest
  ): Promise<MonitoringEntitySource> {
    await this.assertNameUniqueness(attributes);

    let apiKey = {};
    if (attributes.type === 'index') {
      if (!this.dependencies.hasEncryptionKey) {
        throw new Error(
          'Index-type entity sources require encrypted saved objects. Ensure xpack.encryptedSavedObjects.encryptionKey is configured.'
        );
      }
      if (!request) {
        throw new Error('Cannot create index-type entity source without a request.');
      }

      if (attributes.indexPattern) {
        await validateIndexPermissions(this.dependencies.esClient, attributes.indexPattern);
      }
      const [coreStart] = await this.dependencies.getStartServices();
      apiKey = (await grantEntitySourceApiKey(coreStart.security, request, attributes.name)) ?? {};
    }

    const { id, attributes: created } =
      await this.dependencies.soClient.create<MonitoringEntitySourceAttributes>(
        watchlistEntitySourceTypeName,
        { ...attributes, ...apiKey, managed: attributes.managed ?? false },
        { refresh: 'wait_for' }
      );

    return { ...created, id };
  }

  async upsert(
    source: Partial<MonitoringEntitySource>,
    request?: KibanaRequest
  ): Promise<UpsertResult> {
    const { sources } = await this.list({ name: source.name, per_page: 1 });
    const found = sources[0];

    if (found) {
      // TODO: Add matcher override protection (matchersModifiedByUser) once
      // managed source reconciliation is implemented for watchlists.
      const updated = await this.update({ ...source, id: found.id }, request);
      return { action: 'updated', source: updated };
    }

    const created = await this.create(source, request);
    return { action: 'created', source: created };
  }

  async update(
    entitySource: Partial<MonitoringEntitySource> & { id: string },
    request?: KibanaRequest
  ): Promise<MonitoringEntitySource> {
    const { esClient, getStartServices, logger } = this.dependencies;
    const [coreStart] = await getStartServices();

    // Step 1: Validate index permissions
    const currentSource = await this.get(entitySource.id);
    const newType = entitySource.type ?? currentSource?.type;
    const indexPatternToCheck =
      newType === 'index' ? entitySource.indexPattern ?? currentSource?.indexPattern : undefined;
    if (indexPatternToCheck) {
      await validateIndexPermissions(esClient, indexPatternToCheck);
    }

    // Step 2: handle API key fields
    const wasIndex = currentSource.type === 'index';
    const isNowIndex = newType === 'index';
    const indexPatternChanged =
      wasIndex &&
      isNowIndex &&
      entitySource.indexPattern !== undefined &&
      entitySource.indexPattern !== currentSource.indexPattern;

    let apiKey = {};
    // Invalidates old API key: index pattern changed or type changed from index to non-index
    if ((indexPatternChanged || (wasIndex && !isNowIndex)) && currentSource.apiKeyId) {
      await invalidateEntitySourceApiKey(coreStart.security, currentSource.apiKeyId, logger);
    }
    // Needs new API key: index pattern changed, type changed from non-index to index, or API key is missing (re-auth)
    if (isNowIndex && (indexPatternChanged || !wasIndex || !currentSource.apiKeyId)) {
      if (!this.dependencies.hasEncryptionKey) {
        throw new Error(
          'Index-type entity sources require encrypted saved objects. Ensure xpack.encryptedSavedObjects.encryptionKey is configured.'
        );
      }
      if (!request) {
        throw new Error('Cannot update index-type entity source without a request.');
      }

      apiKey =
        (await grantEntitySourceApiKey(coreStart.security, request, entitySource.name)) ?? {};
    }
    // Clears API key fields: type changed from index to non-index
    if (wasIndex && !isNowIndex) {
      apiKey = { apiKeyId: null, apiKey: null };
    }

    // Step 3: Update entity source
    const newEntitySource = { ..._.omit(entitySource, ['id', 'apiKeyId', 'apiKey']), ...apiKey };
    await this.assertNameUniqueness(entitySource);
    const { attributes } =
      await this.dependencies.soClient.update<MonitoringEntitySourceAttributes>(
        watchlistEntitySourceTypeName,
        entitySource.id,
        newEntitySource,
        { refresh: 'wait_for' }
      );

    return { ...attributes, id: entitySource.id };
  }

  async get(id: string): Promise<MonitoringEntitySource> {
    const { attributes, id: savedObjectId } =
      await this.dependencies.soClient.get<MonitoringEntitySource>(
        watchlistEntitySourceTypeName,
        id
      );
    return { ...attributes, id: savedObjectId };
  }

  async delete(id: string): Promise<void> {
    const { getStartServices, logger } = this.dependencies;
    const [coreStart] = await getStartServices();
    const source = await this.get(id);

    if (source.apiKeyId) {
      await invalidateEntitySourceApiKey(coreStart.security, source.apiKeyId, logger);
    }
    await this.dependencies.soClient.delete(watchlistEntitySourceTypeName, id);
  }

  async find({
    kuery,
    sortField,
    sortOrder,
    page,
    perPage,
  }: {
    kuery: string;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
    page?: number;
    perPage?: number;
  }): Promise<ListWatchlistEntitySourcesResponse> {
    const soResult = await this.dependencies.soClient.find<MonitoringEntitySource>({
      type: watchlistEntitySourceTypeName,
      filter: kuery,
      sortField,
      sortOrder,
      page,
      perPage,
    });

    return {
      sources: soResult.saved_objects.map((so) => ({ ...so.attributes, id: so.id })),
      page: page ?? 1,
      per_page: perPage ?? 10,
      total: soResult.total,
    };
  }

  async list(
    query: ListWatchlistEntitySourcesRequestQuery,
    ids?: string[]
  ): Promise<ListWatchlistEntitySourcesResponse> {
    return this.find({
      kuery: this.getQueryFilters(query, ids),
      sortField: query?.sort_field ?? undefined,
      sortOrder: query?.sort_order ?? undefined,
      page: query?.page ?? 1,
      perPage: query?.per_page ?? 10,
    });
  }

  private getQueryFilters(query?: ListWatchlistEntitySourcesRequestQuery, ids?: string[]): string {
    const queryParts = _.pick(query ?? {}, ['type', 'managed', 'name']);
    const filters = Object.entries(queryParts).map(
      ([key, value]) => `${watchlistEntitySourceTypeName}.attributes.${key}: "${value}"`
    );

    if (ids?.length) {
      const idFilter = ids.map((id) => `${watchlistEntitySourceTypeName}.id: "${id}"`).join(' or ');
      filters.push(`(${idFilter})`);
    }

    return filters.join(' and ');
  }

  private async assertNameUniqueness(attributes: Partial<MonitoringEntitySource>): Promise<void> {
    if (attributes.name) {
      const { sources } = await this.list({ name: attributes.name });

      const filtered = attributes.id ? sources.filter((so) => so.id !== attributes.id) : sources;

      if (filtered.length > 0) {
        throw new Error(
          `A watchlist entity source with the name "${attributes.name}" already exists.`
        );
      }
    }
  }

  /**
   * Integrations Sync Marker Methods
   */
  async updateLastProcessedMarker(
    source: MonitoringEntitySource,
    lastProcessedMarker: string
  ): Promise<void> {
    if (!moment(lastProcessedMarker).isValid()) {
      throw new Error(`Invalid timestamp: ${lastProcessedMarker}`);
    }
    await this.update({
      ...source,
      integrations: {
        syncData: {
          lastUpdateProcessed: lastProcessedMarker,
        },
      },
    });
  }

  async getLastProcessedMarker(source: MonitoringEntitySource): Promise<string | undefined> {
    return source.integrations?.syncData?.lastUpdateProcessed;
  }

  async getLastFullSyncMarker(source: MonitoringEntitySource): Promise<string | undefined> {
    return source.integrations?.syncData?.lastFullSync;
  }

  async updateLastFullSyncMarker(
    source: MonitoringEntitySource,
    lastFullSyncMarker: string
  ): Promise<void> {
    if (!moment(lastFullSyncMarker).isValid()) {
      throw new Error(`Invalid timestamp: ${lastFullSyncMarker}`);
    }
    await this.update({
      ...source,
      integrations: {
        syncData: {
          lastFullSync: lastFullSyncMarker,
        },
      },
    });
  }
}
