/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import pLimit from 'p-limit';
import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import type { ISavedObjectsRepository } from '@kbn/core-saved-objects-api-server';
import type { Logger } from '@kbn/logging';
import { getSchemaVersion } from '@kbn/storage-adapter';
import type {
  SmlTypeDefinition,
  SmlContext,
  SmlCrawlerStateDocument,
  SmlCrawler,
  SmlListItem,
} from './types';
import type { SmlIndexer } from './sml_indexer';
import {
  createSmlCrawlerStateStorage,
  type SmlCrawlerStateStorage,
} from './sml_crawler_state_storage';
import { createSmlStorage, smlIndexName, storageSettings } from './sml_storage';
import { isNotFoundError } from './sml_service';

export type { SmlCrawler };

export interface SmlCrawlerDeps {
  indexer: SmlIndexer;
  logger: Logger;
}

export class SmlCrawlerImpl implements SmlCrawler {
  private readonly indexer: SmlIndexer;
  private readonly logger: Logger;

  constructor({ indexer, logger }: SmlCrawlerDeps) {
    this.indexer = indexer;
    this.logger = logger;
  }

  async crawl({
    definition,
    esClient,
    savedObjectsClient,
    abortSignal,
  }: {
    definition: SmlTypeDefinition;
    esClient: ElasticsearchClient;
    savedObjectsClient: ISavedObjectsRepository;
    abortSignal?: AbortSignal;
  }): Promise<void> {
    const crawlerStateStorage = createSmlCrawlerStateStorage({
      logger: this.logger,
      esClient,
    });
    const stateClient = crawlerStateStorage.getClient();

    const context: SmlContext = {
      esClient,
      savedObjectsClient,
      logger: this.logger,
    };

    const crawlStartTime = new Date().toISOString();
    this.logger.debug(`SML crawler: starting crawl for type '${definition.id}' across all spaces`);

    const indexRecreated = await this.recreateIndexIfMappingsChanged({ esClient });

    // Data integrity check: if the SML data index is empty for this type but
    // state docs exist, clear state to force a full re-index.
    // Also triggered when the index was just recreated due to a schema change.
    const integrityResetNeeded =
      indexRecreated ||
      (await this.checkDataIntegrity({
        esClient,
        stateClient,
        attachmentType: definition.id,
      }));

    // Stream source items page by page. For each page, batch-lookup state
    // docs by ID, diff, and write state updates stamped with crawlStartTime.
    let totalItems = 0;
    let newCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;

    try {
      for await (const page of definition.list(context)) {
        if (abortSignal?.aborted) {
          this.logger.info(
            `SML crawler: crawl aborted for type '${definition.id}' after ${totalItems} item(s)`
          );
          return;
        }

        totalItems += page.length;

        const result = await this.processPage({
          page,
          stateClient,
          attachmentType: definition.id,
          crawlStartTime,
          integrityResetNeeded,
        });

        newCount += result.newItems;
        updatedCount += result.updatedItems;
        unchangedCount += result.unchangedItems;
      }
    } catch (error) {
      this.logger.error(
        `SML crawler: failed to list items for type '${definition.id}': ${(error as Error).message}`
      );
      return;
    }

    this.logger.debug(
      `SML crawler: enumerated ${totalItems} item(s) for type '${definition.id}': ${newCount} new, ${updatedCount} updated, ${unchangedCount} unchanged`
    );

    // Mark-and-sweep: delete state docs not seen in this crawl run.
    const deletedCount = await this.sweepStaleState({
      stateClient,
      attachmentType: definition.id,
      crawlStartTime,
    });
    if (deletedCount > 0) {
      this.logger.info(
        `SML crawler: marked ${deletedCount} item(s) as deleted for type '${definition.id}'`
      );
    }

    if (newCount === 0 && updatedCount === 0 && deletedCount === 0) {
      this.logger.debug(`SML crawler: no state changes needed for type '${definition.id}'`);
    }

    // Process queued actions (create/update/delete)
    await this.processQueue({
      attachmentType: definition.id,
      esClient,
      savedObjectsClient,
      stateClient,
    });
  }

  /**
   * Check whether we need to force a full re-index due to data integrity mismatch.
   * Returns true if state has docs but the SML data index is empty.
   */
  private async checkDataIntegrity({
    esClient,
    stateClient,
    attachmentType,
  }: {
    esClient: ElasticsearchClient;
    stateClient: ReturnType<SmlCrawlerStateStorage['getClient']>;
    attachmentType: string;
  }): Promise<boolean> {
    const stateCount = await this.countStateDocs({ stateClient, attachmentType });
    if (stateCount === 0) return false;

    const smlDataCount = await this.countSmlDocuments({ esClient, attachmentType });
    this.logger.debug(
      `SML crawler: integrity check for type '${attachmentType}' — ${stateCount} state doc(s), ${smlDataCount} SML data doc(s) in index '${smlIndexName}'`
    );
    if (smlDataCount === 0) {
      this.logger.warn(
        `SML crawler: data integrity mismatch for type '${attachmentType}' — ` +
          `${stateCount} state doc(s) but 0 documents in SML data index. ` +
          `Forcing full re-index.`
      );
      return true;
    }
    return false;
  }

  /**
   * Compare the current schema version with the one stored in the index _meta.
   * If they differ, drop and recreate the index so the new mappings take effect.
   * Returns true when the index was recreated.
   */
  private async recreateIndexIfMappingsChanged({
    esClient,
  }: {
    esClient: ElasticsearchClient;
  }): Promise<boolean> {
    const storage = createSmlStorage({ logger: this.logger, esClient });
    const smlClient = storage.getClient();

    const indexExists = await smlClient.existsIndex();
    if (!indexExists) {
      return false;
    }

    try {
      const expectedVersion = getSchemaVersion(storageSettings);
      const response = await esClient.indices.getMapping({ index: smlIndexName });
      const existingVersion = Object.values(response)[0]?.mappings?._meta?.version as
        | string
        | undefined;

      if (existingVersion !== expectedVersion) {
        this.logger.warn(
          `SML crawler: schema version mismatch (existing='${existingVersion}', expected='${expectedVersion}') — deleting index '${smlIndexName}' and recreating with current schema`
        );
        await smlClient.clean();
        return true;
      }
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }

    return false;
  }

  /**
   * Process a single page of source items: batch-lookup state, diff,
   * and write state updates with last_crawled_at stamped.
   */
  private async processPage({
    page,
    stateClient,
    attachmentType,
    crawlStartTime,
    integrityResetNeeded,
  }: {
    page: SmlListItem[];
    stateClient: ReturnType<SmlCrawlerStateStorage['getClient']>;
    attachmentType: string;
    crawlStartTime: string;
    integrityResetNeeded: boolean;
  }): Promise<{ newItems: number; updatedItems: number; unchangedItems: number }> {
    if (page.length === 0) return { newItems: 0, updatedItems: 0, unchangedItems: 0 };

    const stateMap = integrityResetNeeded
      ? new Map<string, SmlCrawlerStateDocument>()
      : await this.batchLookupState({ stateClient, attachmentType, ids: page.map((i) => i.id) });

    let newItems = 0;
    let updatedItems = 0;
    let unchangedItems = 0;
    const operations: Array<{ id: string; document: SmlCrawlerStateDocument }> = [];

    for (const item of page) {
      const existing = stateMap.get(item.id);
      let updateAction: SmlCrawlerStateDocument['update_action'];

      if (!existing) {
        newItems++;
        updateAction = 'create';
      } else if (
        existing.updated_at < item.updatedAt ||
        !arraysEqual(existing.spaces, item.spaces)
      ) {
        updatedItems++;
        updateAction = 'update';
      } else {
        unchangedItems++;
        updateAction = existing.update_action;
      }

      operations.push({
        id: `${attachmentType}:${item.id}`,
        document: {
          origin_id: item.id,
          type_id: attachmentType,
          spaces: item.spaces,
          created_at: existing?.created_at ?? crawlStartTime,
          updated_at: item.updatedAt,
          update_action: updateAction,
          last_crawled_at: crawlStartTime,
        },
      });
    }

    if (operations.length > 0) {
      await this.writeStateOperations({ stateClient, operations, attachmentType });
    }

    return { newItems, updatedItems, unchangedItems };
  }

  /**
   * Process all queued actions (non-null update_action) for a type.
   * Uses `search_after` to paginate through all pending items.
   */
  private async processQueue({
    attachmentType,
    esClient,
    savedObjectsClient,
    stateClient,
  }: {
    attachmentType: string;
    esClient: ElasticsearchClient;
    savedObjectsClient: ISavedObjectsRepository;
    stateClient: ReturnType<SmlCrawlerStateStorage['getClient']>;
  }): Promise<void> {
    const pageSize = 1000;
    const limit = pLimit(10);
    let processedCount = 0;
    let errorCount = 0;
    let searchAfter: Array<string | number> | undefined;
    let hasMore = true;

    while (hasMore) {
      const pendingResponse = await stateClient.search({
        track_total_hits: false,
        query: {
          bool: {
            filter: [{ term: { type_id: attachmentType } }, { exists: { field: 'update_action' } }],
            must_not: [{ term: { update_action: '' } }],
          },
        },
        size: pageSize,
        sort: [{ origin_id: 'asc' }],
        ...(searchAfter ? { search_after: searchAfter } : {}),
      });

      const pendingItems = pendingResponse.hits.hits;
      if (pendingItems.length === 0) {
        if (processedCount === 0) {
          this.logger.debug(
            `SML crawler: no pending actions to process for type '${attachmentType}'`
          );
        }
        break;
      }

      this.logger.debug(
        `SML crawler: processing batch of ${pendingItems.length} pending action(s) for type '${attachmentType}'`
      );

      const stateAckOps: Array<
        { index: { _id: string; document: SmlCrawlerStateDocument } } | { delete: { _id: string } }
      > = [];

      const validHits = pendingItems.filter((hit) => {
        if (!hit._id) {
          this.logger.warn('SML crawler: skipping hit without _id');
          return false;
        }
        const doc = hit._source;
        if (!doc || !doc.update_action) {
          this.logger.debug(`SML crawler: skipping hit '${hit._id}' — no source or update_action`);
          return false;
        }
        return true;
      });

      // Identify origin_ids that already have manual entries so the crawler can skip
      // them entirely (and ACK their state) instead of letting the indexer's safety
      // net no-op every cycle. Skips apply only to create/update actions; delete is
      // always allowed because the upstream object is gone.
      const candidateOriginUris = Array.from(
        new Set(
          validHits
            .filter((hit) => hit._source!.update_action !== 'delete')
            .map((hit) => `${attachmentType}://${hit._source!.origin_id}`)
        )
      );
      const manualOriginUris = await this.findManualOriginUris({
        esClient,
        originUris: candidateOriginUris,
      });

      const indexPromises = validHits.map((hit) => {
        const doc = hit._source!;
        const action = doc.update_action!;

        if (action !== 'delete' && manualOriginUris.has(`${attachmentType}://${doc.origin_id}`)) {
          this.logger.debug(
            `SML crawler: skipping '${action}' for origin '${doc.origin_id}' (type: ${doc.type_id}) — manual entry exists`
          );
          stateAckOps.push({
            index: {
              _id: hit._id!,
              document: { ...doc, update_action: undefined },
            },
          });
          processedCount++;
          return Promise.resolve();
        }

        return limit(async () => {
          try {
            this.logger.debug(
              `SML crawler: processing '${action}' for origin '${doc.origin_id}' (type: ${doc.type_id})`
            );

            await this.indexer.indexAttachment({
              originId: doc.origin_id,
              attachmentType: doc.type_id,
              action,
              spaces: doc.spaces,
              esClient,
              savedObjectsClient,
              logger: this.logger,
            });

            if (action === 'delete') {
              stateAckOps.push({ delete: { _id: hit._id! } });
            } else {
              stateAckOps.push({
                index: {
                  _id: hit._id!,
                  document: { ...doc, update_action: undefined },
                },
              });
            }
            processedCount++;
          } catch (error) {
            errorCount++;
            this.logger.error(
              `SML crawler: failed to process action '${action}' for '${doc.origin_id}': ${
                (error as Error).message
              }`
            );
          }
        });
      });

      await Promise.all(indexPromises);

      if (stateAckOps.length > 0) {
        try {
          const bulkResponse = await stateClient.bulk({
            refresh: 'wait_for',
            operations: stateAckOps,
          });
          if (bulkResponse.errors) {
            const failedOps = bulkResponse.items.filter(
              (item) => (item.index?.error ?? item.delete?.error) !== undefined
            );
            this.logger.warn(
              `SML crawler: ${
                failedOps.length
              } state ACK operation(s) failed for type '${attachmentType}': ${JSON.stringify(
                failedOps.slice(0, 3)
              )}`
            );
          }
        } catch (error) {
          this.logger.error(
            `SML crawler: failed to ACK state updates for type '${attachmentType}': ${
              (error as Error).message
            }`
          );
        }
      }

      if (pendingItems.length < pageSize) {
        hasMore = false;
      } else {
        const lastHit = pendingItems[pendingItems.length - 1];
        searchAfter = lastHit.sort as Array<string | number>;
      }
    }

    if (processedCount > 0 || errorCount > 0) {
      this.logger.info(
        `SML crawler: queue processing complete for type '${attachmentType}': ${processedCount} succeeded, ${errorCount} failed`
      );
    }
  }

  /**
   * Return the subset of `originIds` that already have at least one chunk with
   * `ingestion_method: 'manual'` in the SML data index. Used to skip dispatching
   * the indexer for items that are protected by a user-curated entry.
   *
   * Returns an empty set when the index does not exist yet or when the lookup
   * fails — manual protection is best-effort here; the indexer's own guard is
   * the authoritative check.
   */
  private async findManualOriginUris({
    esClient,
    originUris,
  }: {
    esClient: ElasticsearchClient;
    originUris: string[];
  }): Promise<Set<string>> {
    const result = new Set<string>();
    if (originUris.length === 0) return result;

    try {
      const response = await esClient.search<{ origin?: { uri?: string } }>({
        index: smlIndexName,
        ignore_unavailable: true,
        allow_no_indices: true,
        size: originUris.length,
        track_total_hits: false,
        _source: ['origin.uri'],
        query: {
          bool: {
            filter: [
              { terms: { 'origin.uri': originUris } },
              { term: { ingestion_method: 'manual' } },
            ],
          },
        },
        // Collapse so we get at most one hit per origin.uri even if multiple
        // manual chunks exist for the same origin.
        collapse: { field: 'origin.uri' },
      });

      for (const hit of response.hits.hits) {
        const originUri = hit._source?.origin?.uri;
        if (originUri) {
          result.add(originUri);
        }
      }
    } catch (error) {
      if (isNotFoundError(error)) {
        return result;
      }
      this.logger.warn(
        `SML crawler: failed to look up manual origin ids: ${(error as Error).message}`
      );
    }

    return result;
  }

  /**
   * Count how many documents exist in the SML data index for a given attachment type.
   * Returns 0 if the index doesn't exist yet.
   */
  private async countSmlDocuments({
    esClient,
    attachmentType,
  }: {
    esClient: ElasticsearchClient;
    attachmentType: string;
  }): Promise<number> {
    try {
      const response = await esClient.count({
        index: smlIndexName,
        ignore_unavailable: true,
        allow_no_indices: true,
        query: {
          term: { type: attachmentType },
        },
      });
      return response.count;
    } catch {
      // Index doesn't exist yet — that's fine, return 0
      return 0;
    }
  }

  /**
   * Batch-lookup state documents by their IDs using mget-style terms query.
   * Returns a map of origin_id → state document.
   */
  private async batchLookupState({
    stateClient,
    attachmentType,
    ids,
  }: {
    stateClient: ReturnType<SmlCrawlerStateStorage['getClient']>;
    attachmentType: string;
    ids: string[];
  }): Promise<Map<string, SmlCrawlerStateDocument>> {
    const result = new Map<string, SmlCrawlerStateDocument>();
    if (ids.length === 0) return result;

    const docIds = ids.map((id) => `${attachmentType}:${id}`);

    try {
      const response = await stateClient.search({
        track_total_hits: false,
        query: { ids: { values: docIds } },
        size: ids.length,
      });

      for (const hit of response.hits.hits) {
        if (hit._source) {
          result.set(hit._source.origin_id, hit._source);
        }
      }
    } catch (error) {
      this.logger.error(
        `SML crawler: failed to batch-lookup state for type '${attachmentType}': ${
          (error as Error).message
        }`
      );
      throw error;
    }

    return result;
  }

  /**
   * Write state operations via bulk API.
   */
  private async writeStateOperations({
    stateClient,
    operations,
    attachmentType,
  }: {
    stateClient: ReturnType<SmlCrawlerStateStorage['getClient']>;
    operations: Array<{ id: string; document: SmlCrawlerStateDocument }>;
    attachmentType: string;
  }): Promise<void> {
    try {
      const bulkResponse = await stateClient.bulk({
        refresh: 'wait_for',
        operations: operations.map(({ id, document }) => ({
          index: { _id: id, document },
        })),
      });
      if (bulkResponse.errors) {
        const failedOps = bulkResponse.items.filter((item) => item.index?.error);
        this.logger.warn(
          `SML crawler: ${
            failedOps.length
          } state write(s) failed for type '${attachmentType}': ${JSON.stringify(
            failedOps.slice(0, 3)
          )}`
        );
      }
    } catch (error) {
      this.logger.error(
        `SML crawler: failed to update state for type '${attachmentType}': ${
          (error as Error).message
        }`
      );
      throw error;
    }
  }

  /**
   * Mark-and-sweep: find state docs not seen in this crawl run
   * (last_crawled_at < crawlStartTime) and mark them for deletion.
   * Returns the number of items marked as deleted.
   */
  private async sweepStaleState({
    stateClient,
    attachmentType,
    crawlStartTime,
  }: {
    stateClient: ReturnType<SmlCrawlerStateStorage['getClient']>;
    attachmentType: string;
    crawlStartTime: string;
  }): Promise<number> {
    const pageSize = 1000;
    let markedCount = 0;
    let searchAfter: Array<string | number> | undefined;
    let hasMore = true;

    while (hasMore) {
      const response = await stateClient.search({
        track_total_hits: false,
        query: {
          bool: {
            filter: [
              { term: { type_id: attachmentType } },
              { range: { last_crawled_at: { lt: crawlStartTime } } },
            ],
          },
        },
        size: pageSize,
        sort: [{ origin_id: 'asc' }],
        ...(searchAfter ? { search_after: searchAfter } : {}),
      });

      const hits = response.hits.hits;
      if (hits.length === 0) break;

      const operations = hits
        .filter((hit) => hit._id && hit._source)
        .map((hit) => ({
          id: hit._id!,
          document: {
            ...hit._source!,
            update_action: 'delete' as const,
            last_crawled_at: crawlStartTime,
          },
        }));

      if (operations.length > 0) {
        await this.writeStateOperations({ stateClient, operations, attachmentType });
        markedCount += operations.length;
      }

      if (hits.length < pageSize) {
        hasMore = false;
      } else {
        const lastHit = hits[hits.length - 1];
        searchAfter = lastHit.sort as Array<string | number>;
      }
    }

    return markedCount;
  }

  /**
   * Count how many state docs exist for a given attachment type.
   */
  private async countStateDocs({
    stateClient,
    attachmentType,
  }: {
    stateClient: ReturnType<SmlCrawlerStateStorage['getClient']>;
    attachmentType: string;
  }): Promise<number> {
    try {
      const response = await stateClient.search({
        track_total_hits: true,
        query: {
          bool: {
            filter: [{ term: { type_id: attachmentType } }],
          },
        },
        size: 0,
      });
      return (response.hits.total as { value: number })?.value ?? 0;
    } catch {
      return 0;
    }
  }
}

const arraysEqual = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((val, i) => val === sortedB[i]);
};
