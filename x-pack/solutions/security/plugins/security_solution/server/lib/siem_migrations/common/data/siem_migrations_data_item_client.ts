/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type {
  AggregationsAggregationContainer,
  AggregationsMaxAggregate,
  AggregationsMinAggregate,
  AggregationsStringTermsAggregate,
  AggregationsStringTermsBucket,
  BulkOperationContainer,
  Duration,
  QueryDslQueryContainer,
} from '@elastic/elasticsearch/lib/api/types';
import type { estypes } from '@elastic/elasticsearch';
import type { SiemMigrationVendor } from '../../../../../common/siem_migrations/model/common.gen';
import type {
  MigrationType,
  SiemMigrationFilters,
} from '../../../../../common/siem_migrations/types';
import type { ItemDocument, Stored } from '../types';
import {
  SiemMigrationStatus,
  MigrationTranslationResult,
} from '../../../../../common/siem_migrations/constants';
import { SiemMigrationsDataBaseClient } from './siem_migrations_data_base_client';
import { MAX_ES_SEARCH_SIZE } from './constants';
import type {
  SiemMigrationAllDataStats,
  SiemMigrationDataStats,
  SiemMigrationGetItemsOptions,
  SiemMigrationSort,
} from './types';
import { dsl } from './dsl_queries';

export type CreateMigrationItemInput<I extends ItemDocument> = Omit<
  I,
  '@timestamp' | 'id' | 'status' | 'created_by' | 'updated_by' | 'updated_at'
>;

/* BULK_MAX_SIZE defines the number to break down the bulk operations by.
 * The 500 number was chosen as a reasonable number to avoid large payloads. It can be adjusted if needed. */
const BULK_MAX_SIZE = 500 as const;
/* DEFAULT_SEARCH_BATCH_SIZE defines the default number of documents to retrieve per search operation
 * when retrieving search results in batches. */
const DEFAULT_SEARCH_BATCH_SIZE = 500 as const;

export abstract class SiemMigrationsDataItemClient<
  I extends ItemDocument = ItemDocument
> extends SiemMigrationsDataBaseClient {
  protected abstract type: MigrationType;
  public abstract getVendor(migrationId: string): Promise<SiemMigrationVendor | undefined>;

  /** Indexes an array of migration items in pending status */
  async create(items: CreateMigrationItemInput<I>[]): Promise<void> {
    const index = await this.getIndexName();
    const profileId = await this.getProfileUid();

    const createdAt = new Date().toISOString();

    const batches: CreateMigrationItemInput<I>[][] = [];
    for (let i = 0; i < items.length; i += BULK_MAX_SIZE) {
      batches.push(items.slice(i, i + BULK_MAX_SIZE));
    }

    await Promise.all(
      batches.map((itemsSlice) =>
        this.esClient
          .bulk({
            refresh: 'wait_for',
            operations: itemsSlice.flatMap((item) => [
              { create: { _index: index } },
              {
                ...item,
                '@timestamp': createdAt,
                status: SiemMigrationStatus.PENDING,
                created_by: profileId,
                updated_by: profileId,
                updated_at: createdAt,
              },
            ]),
          })
          .catch((error) => {
            this.logger.error(`Error creating migration ${this.type}: ${error.message}`);
            throw error;
          })
      )
    );
  }

  /** Updates an array of migration items that belong to the specified migration */
  async update<U extends Partial<ItemDocument>>(
    migrationId: string,
    itemsUpdate: U[]
  ): Promise<void> {
    const index = await this.getIndexName();
    const profileId = await this.getProfileUid();
    const itemsToUpdate = await this.filterItemsInMigration(migrationId, itemsUpdate);

    const updatedAt = new Date().toISOString();
    const batches: U[][] = [];
    for (let i = 0; i < itemsToUpdate.length; i += BULK_MAX_SIZE) {
      batches.push(itemsToUpdate.slice(i, i + BULK_MAX_SIZE));
    }

    const batchPromises = batches.map((itemsUpdateSlice) =>
      this.esClient
        .bulk({
          refresh: 'wait_for',
          operations: itemsUpdateSlice.flatMap((item) => {
            const { id, ...rest } = item;
            return [
              { update: { _index: index, _id: id } },
              {
                doc: {
                  ...rest,
                  updated_by: profileId,
                  updated_at: updatedAt,
                },
              },
            ];
          }),
        })
        .catch((error) => {
          this.logger.error(`Error updating migration ${this.type}: ${error.message}`);
          throw error;
        })
    );

    await Promise.all(batchPromises);
  }

  /**
   * Discards the items that do not belong to the migration.
   *
   * Item ids are caller supplied and updates are issued by document id, so without this an update
   * scoped to one migration could reach the items of another.
   */
  private async filterItemsInMigration<U extends Partial<ItemDocument>>(
    migrationId: string,
    itemsUpdate: U[]
  ): Promise<U[]> {
    const ids = itemsUpdate
      .map(({ id }) => id)
      .filter((id): id is string => typeof id === 'string');
    if (ids.length === 0) {
      return [];
    }

    const index = await this.getIndexName();
    const idsInMigration = new Set<string>();
    for (let i = 0; i < ids.length; i += BULK_MAX_SIZE) {
      const idsBatch = ids.slice(i, i + BULK_MAX_SIZE);
      const result = await this.esClient
        .search<I>({
          index,
          query: this.getFilterQuery(migrationId, { ids: idsBatch }),
          size: idsBatch.length,
          _source: false,
        })
        .catch((error) => {
          this.logger.error(`Error searching migration ${this.type}: ${error.message}`);
          throw error;
        });
      result.hits.hits.forEach(({ _id }) => {
        if (_id) {
          idsInMigration.add(_id);
        }
      });
    }

    return itemsUpdate.filter(({ id }) => typeof id === 'string' && idsInMigration.has(id));
  }

  /** Retrieves an array of migration items of a specific migration */
  async get(
    migrationId: string,
    { filters = {}, sort: sortParam = {}, from, size }: SiemMigrationGetItemsOptions = {}
  ): Promise<{ total: number; data: Stored<I>[] }> {
    const index = await this.getIndexName();
    const query = this.getFilterQuery(migrationId, filters);
    const sort = this.getSortOptions(sortParam);

    const result = await this.esClient
      .search<I>({ index, query, sort, from, size })
      .catch((error) => {
        this.logger.error(`Error searching migration ${this.type}: ${error.message}`);
        throw error;
      });
    return {
      total: this.getTotalHits(result),
      data: this.processResponseHits(result),
    };
  }

  async getByQuery(
    migrationId: string,
    { queryDSL, from, size }: { queryDSL: object; from?: number; size?: number }
  ): Promise<{ total: number; data: Stored<I>[] }> {
    const index = await this.getIndexName();
    const baseQuery = this.getFilterQuery(migrationId, {});
    const combinedQuery = {
      bool: {
        must: [baseQuery, queryDSL],
      },
    };
    const result = await this.esClient
      .search<I>({ index, query: combinedQuery, from, size })
      .catch((error) => {
        this.logger.error(`Error searching migration ${this.type} by query: ${error.message}`);
        throw error;
      });
    return {
      total: this.getTotalHits(result),
      data: this.processResponseHits(result),
    };
  }

  /** Prepares bulk ES delete operations for the migration items based on migrationId. */
  public async prepareDelete(migrationId: string): Promise<BulkOperationContainer[]> {
    const index = await this.getIndexName();
    const itemsToBeDeleted = await this.get(migrationId, { size: MAX_ES_SEARCH_SIZE });
    const itemsToBeDeletedDocIds = itemsToBeDeleted.data.map((item) => item.id);

    return itemsToBeDeletedDocIds.map((docId) => ({
      delete: { _index: index, _id: docId },
    }));
  }

  /** Returns batching functions to traverse all the migration items search results */
  public searchBatches(
    migrationId: string,
    options: { scroll?: Duration; size?: number; filters?: object } = {}
  ) {
    const { size = DEFAULT_SEARCH_BATCH_SIZE, filters = {}, scroll } = options;
    const query = this.getFilterQuery(migrationId, filters);
    const search = { query, sort: '_doc', scroll, size }; // sort by _doc to ensure consistent order
    try {
      return this.getSearchBatches<I>(search);
    } catch (error) {
      this.logger.error(`Error scrolling migration ${this.type}: ${error.message}`);
      throw error;
    }
  }

  /** Retrieves the stats for the migrations items with the provided id */
  public async getStats(migrationId: string): Promise<SiemMigrationDataStats> {
    const index = await this.getIndexName();
    const query = this.getFilterQuery(migrationId, { isEligibleForTranslation: true });
    const aggregations = {
      status: { terms: { field: 'status' } },
      createdAt: { min: { field: '@timestamp' } },
      lastUpdatedAt: { max: { field: 'updated_at' } },
    };

    const vendor = await this.getVendor(migrationId);
    const result = await this.esClient
      .search({ index, query, aggregations, _source: false })
      .catch((error) => {
        this.logger.error(`Error getting migration ${this.type} stats: ${error.message}`);
        throw error;
      });

    const aggs = result.aggregations ?? {};
    return {
      id: migrationId,
      items: {
        total: this.getTotalHits(result),
        ...this.statusAggCounts(aggs.status as AggregationsStringTermsAggregate),
      },
      created_at: (aggs.createdAt as AggregationsMinAggregate)?.value_as_string ?? '',
      last_updated_at: (aggs.lastUpdatedAt as AggregationsMaxAggregate)?.value_as_string ?? '',
      vendor,
    };
  }

  /** Retrieves the stats for all the migration items aggregated by migration id, in creation order */
  async getAllStats(): Promise<SiemMigrationAllDataStats> {
    const index = await this.getIndexName();
    const aggregations: { migrationIds: AggregationsAggregationContainer } = {
      migrationIds: {
        terms: { field: 'migration_id', order: { createdAt: 'asc' }, size: MAX_ES_SEARCH_SIZE },
        aggregations: {
          status: { terms: { field: 'status' } },
          createdAt: { min: { field: '@timestamp' } },
          lastUpdatedAt: { max: { field: 'updated_at' } },
        },
      },
    };

    const query = this.getFilterQuery(undefined, { isEligibleForTranslation: true });
    const result = await this.esClient
      .search({ index, query, aggregations, _source: false })
      .catch((error) => {
        this.logger.error(`Error getting all migration ${this.type} stats: ${error.message}`);
        throw error;
      });

    const migrationsAgg = result.aggregations?.migrationIds as AggregationsStringTermsAggregate;
    const buckets = (migrationsAgg?.buckets as AggregationsStringTermsBucket[]) ?? [];
    const vendors = await Promise.all(
      buckets.map(async (bucket) => this.getVendor(`${bucket.key}`))
    );
    return buckets.map<SiemMigrationDataStats>((bucket, idx) => ({
      id: `${bucket.key}`,
      vendor: vendors[idx],
      items: {
        total: bucket.doc_count,
        ...this.statusAggCounts(bucket.status as AggregationsStringTermsAggregate),
      },
      created_at: (bucket.createdAt as AggregationsMinAggregate | undefined)
        ?.value_as_string as string,
      last_updated_at: (bucket.lastUpdatedAt as AggregationsMaxAggregate | undefined)
        ?.value_as_string as string,
    }));
  }

  /** Updates one migration item status to `processing` */
  public async saveProcessing(id: string): Promise<void> {
    const index = await this.getIndexName();
    const profileId = await this.getProfileUid();
    const doc = {
      status: SiemMigrationStatus.PROCESSING,
      updated_by: profileId,
      updated_at: new Date().toISOString(),
    };
    await this.esClient.update({ index, id, doc, refresh: 'wait_for' }).catch((error) => {
      this.logger.error(
        `Error updating migration ${this.type} status to processing: ${error.message}`
      );
      throw error;
    });
  }

  /** Updates one migration item with the provided data and sets the status to `completed` */
  public async saveCompleted({ id, ...migrationItem }: Stored<I>): Promise<void> {
    const index = await this.getIndexName();
    const profileId = await this.getProfileUid();
    const doc = {
      ...migrationItem,
      status: SiemMigrationStatus.COMPLETED,
      updated_by: profileId,
      updated_at: new Date().toISOString(),
    };
    await this.esClient.update({ index, id, doc, refresh: 'wait_for' }).catch((error) => {
      this.logger.error(
        `Error updating migration ${this.type} status to completed: ${error.message}`
      );
      throw error;
    });
  }

  /** Updates one migration item with the provided data and sets the status to `failed` */
  public async saveError({ id, ...migrationItem }: Stored<I>): Promise<void> {
    const index = await this.getIndexName();
    const profileId = await this.getProfileUid();
    const doc = {
      ...migrationItem,
      status: SiemMigrationStatus.FAILED,
      updated_by: profileId,
      updated_at: new Date().toISOString(),
    };
    await this.esClient.update({ index, id, doc, refresh: 'wait_for' }).catch((error) => {
      this.logger.error(`Error updating migration ${this.type} status to failed: ${error.message}`);
      throw error;
    });
  }

  /** Updates all the migration items with the provided id with status `processing` back to `pending` */
  public async releaseProcessing(migrationId: string): Promise<void> {
    return this.updateStatus(
      migrationId,
      { status: SiemMigrationStatus.PROCESSING },
      SiemMigrationStatus.PENDING
    );
  }

  /** Updates all the migration items with the provided id and with status `statusToQuery` to `statusToUpdate` */
  public async updateStatus(
    migrationId: string,
    filter: object,
    statusToUpdate: SiemMigrationStatus,
    { refresh = false }: { refresh?: boolean } = {}
  ): Promise<void> {
    const index = await this.getIndexName();
    const query = this.getFilterQuery(migrationId, filter);
    const script = { source: `ctx._source['status'] = '${statusToUpdate}'` };
    await this.esClient.updateByQuery({ index, query, script, refresh }).catch((error) => {
      this.logger.error(`Error updating migration ${this.type} status: ${error.message}`);
      throw error;
    });
  }

  protected getVendorFromAggs(vendorAgg: AggregationsStringTermsAggregate): string {
    const buckets = vendorAgg.buckets as AggregationsStringTermsBucket[];
    return buckets[0]?.key?.toString() ?? 'unknown';
  }

  protected statusAggCounts(
    statusAgg: AggregationsStringTermsAggregate
  ): Record<SiemMigrationStatus, number> {
    const buckets = statusAgg.buckets as AggregationsStringTermsBucket[];
    return {
      [SiemMigrationStatus.PENDING]:
        buckets.find(({ key }) => key === SiemMigrationStatus.PENDING)?.doc_count ?? 0,
      [SiemMigrationStatus.PROCESSING]:
        buckets.find(({ key }) => key === SiemMigrationStatus.PROCESSING)?.doc_count ?? 0,
      [SiemMigrationStatus.COMPLETED]:
        buckets.find(({ key }) => key === SiemMigrationStatus.COMPLETED)?.doc_count ?? 0,
      [SiemMigrationStatus.FAILED]:
        buckets.find(({ key }) => key === SiemMigrationStatus.FAILED)?.doc_count ?? 0,
    };
  }

  protected translationResultAggCount(
    resultAgg: AggregationsStringTermsAggregate
  ): Record<MigrationTranslationResult, number> {
    const buckets = resultAgg.buckets as AggregationsStringTermsBucket[];
    return {
      [MigrationTranslationResult.FULL]:
        buckets.find(({ key }) => key === MigrationTranslationResult.FULL)?.doc_count ?? 0,
      [MigrationTranslationResult.PARTIAL]:
        buckets.find(({ key }) => key === MigrationTranslationResult.PARTIAL)?.doc_count ?? 0,
      [MigrationTranslationResult.UNTRANSLATABLE]:
        buckets.find(({ key }) => key === MigrationTranslationResult.UNTRANSLATABLE)?.doc_count ??
        0,
    };
  }

  protected getFilterQuery(
    migrationId?: string,
    filters: SiemMigrationFilters = {}
  ): { bool: { filter: QueryDslQueryContainer[] } } {
    const filter: QueryDslQueryContainer[] = [];

    if (migrationId) {
      filter.push({ term: { migration_id: migrationId } });
    }

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        filter.push({ terms: { status: filters.status } });
      } else {
        filter.push({ term: { status: filters.status } });
      }
    }
    if (filters.ids) {
      filter.push({ terms: { _id: filters.ids } });
    }
    if (filters.failed != null) {
      filter.push(filters.failed ? dsl.isFailed() : dsl.isNotFailed());
    }
    if (filters.fullyTranslated != null) {
      filter.push(filters.fullyTranslated ? dsl.isFullyTranslated() : dsl.isNotFullyTranslated());
    }
    if (filters.partiallyTranslated != null) {
      filter.push(
        filters.partiallyTranslated ? dsl.isPartiallyTranslated() : dsl.isNotPartiallyTranslated()
      );
    }
    if (filters.untranslatable != null) {
      filter.push(filters.untranslatable ? dsl.isUntranslatable() : dsl.isNotUntranslatable());
    }

    if (filters.isEligibleForTranslation) {
      filter.push(dsl.isEligibleForTranslation());
    }
    return { bool: { filter } };
  }

  protected abstract getSortOptions(sort?: SiemMigrationSort): estypes.Sort;
}
