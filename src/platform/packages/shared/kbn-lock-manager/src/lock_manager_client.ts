/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// eslint-disable-next-line max-classes-per-file
import { errors } from '@elastic/elasticsearch';
import type { Logger } from '@kbn/logging';
import { v4 as uuid } from 'uuid';
import prettyMilliseconds from 'pretty-ms';
import { duration } from 'moment';
import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import { LOCKS_CONCRETE_INDEX_NAME, setupLockManagerIndex } from './setup_lock_manager_index';

export type LockId = string;
export interface LockDocument {
  createdAt: string;
  expiresAt: string;
  metadata: Record<string, any>;
  token: string;
}

export interface AcquireOptions {
  /**
   * Metadata to be stored with the lock. This can be any key-value pair.
   * This is not mapped and therefore not searchable.
   */
  metadata?: Record<string, any>;
  /**
   * Time to live (TTL) for the lock in milliseconds. Default is 30 seconds.
   * When a lock expires it can be acquired by another process
   */
  ttl?: number;
}

// The index assets should only be set up once
let runLockManagerSetupSuccessfully = false;
export const runSetupIndexAssetOnce = async (
  esClient: ElasticsearchClient,
  logger: Logger
): Promise<void> => {
  if (runLockManagerSetupSuccessfully) {
    return;
  }
  await setupLockManagerIndex(esClient, logger);
  runLockManagerSetupSuccessfully = true;
};

// For testing purposes, we need to be able to set it up every time
export function rerunSetupIndexAsset() {
  runLockManagerSetupSuccessfully = false;
}

export class LockManager {
  private token = uuid();

  constructor(
    private lockId: LockId,
    private esClient: ElasticsearchClient,
    private logger: Logger
  ) {}

  /**
   * Attempts to acquire a lock by creating a document with the given lockId.
   * If the lock exists and is expired, it will be released and acquisition retried.
   */
  public async acquire({
    metadata = {},
    ttl = duration(30, 'seconds').asMilliseconds(),
  }: AcquireOptions = {}): Promise<boolean> {
    let response: Awaited<ReturnType<ElasticsearchClient['update']>>;

    await runSetupIndexAssetOnce(this.esClient, this.logger);
    this.token = uuid();

    try {
      response = await this.esClient.update<LockDocument>(
        {
          index: LOCKS_CONCRETE_INDEX_NAME,
          id: this.lockId,
          scripted_upsert: true,
          script: {
            lang: 'painless',
            source: `
              // Get the current time on the ES server.
              long now = System.currentTimeMillis();
              
              // If creating the document, or if the lock is expired,
              // or if the current document is owned by the same token, then update it.
              if (ctx.op == 'create' ||
                  Instant.parse(ctx._source.expiresAt).toEpochMilli() < now ||
                  ctx._source.token == params.token) {
                def instantNow = Instant.ofEpochMilli(now);
                ctx._source.createdAt = instantNow.toString();
                ctx._source.expiresAt = instantNow.plusMillis(params.ttl).toString();
                ctx._source.metadata = params.metadata;
                ctx._source.token = params.token;
              } else {
                ctx.op = 'noop';
              }
            `,
            params: {
              ttl,
              token: this.token,
              metadata,
            },
          },
          // @ts-expect-error
          upsert: {},
        },
        {
          retryOnTimeout: true,
          maxRetries: 3,
        }
      );
    } catch (e) {
      if (isVersionConflictException(e)) {
        this.logger.debug(`Lock "${this.lockId}" already held (version conflict)`);
        return false;
      }

      this.logger.error(`Failed to acquire lock "${this.lockId}": ${e.message}`);
      return false;
    }

    switch (response.result) {
      case 'created': {
        this.logger.debug(
          `Lock "${this.lockId}" with token = ${
            this.token
          } acquired with ttl = ${prettyMilliseconds(ttl)}`
        );
        return true;
      }
      case 'updated': {
        this.logger.debug(
          `Lock "${this.lockId}" was expired and re-acquired with ttl = ${prettyMilliseconds(
            ttl
          )} and token = ${this.token}`
        );
        return true;
      }
      case 'noop': {
        this.logger.debug(
          `Lock "${this.lockId}" with token = ${this.token} could not be acquired. It is already held`
        );
        return false;
      }
    }

    this.logger.warn(`Unexpected response: ${response.result}`);
    return false;
  }

  /**
   * Releases the lock by deleting the document with the given lockId and token
   */
  public async release(): Promise<boolean> {
    let response: Awaited<ReturnType<ElasticsearchClient['update']>>;
    try {
      response = await this.esClient.update<LockDocument>(
        {
          index: LOCKS_CONCRETE_INDEX_NAME,
          id: this.lockId,
          scripted_upsert: false,
          script: {
            lang: 'painless',
            source: `
            if (ctx._source.token == params.token) {
              ctx.op = 'delete';
            } else {
              ctx.op = 'noop';
            }
          `,
            params: { token: this.token },
          },
        },
        {
          retryOnTimeout: true,
          maxRetries: 3,
        }
      );
    } catch (error: any) {
      if (isDocumentMissingException(error)) {
        this.logger.debug(`Lock "${this.lockId}" already released.`);
        return false;
      }

      this.logger.error(`Failed to release lock "${this.lockId}": ${error.message}`);
      throw error;
    }

    switch (response.result) {
      case 'deleted':
        this.logger.debug(`Lock "${this.lockId}" released with token ${this.token}.`);
        return true;
      case 'noop':
        this.logger.warn(
          `Lock "${this.lockId}" with token = ${this.token} could not be released. Token does not match.`
        );
        return false;
    }

    this.logger.warn(`Unexpected response: ${response.result}`);
    return false;
  }

  /**
   * Retrieves the lock document for a given lockId.
   * If the lock is expired, it will not be returned
   */
  public async get(): Promise<LockDocument | undefined> {
    const result = await this.esClient.get<LockDocument>(
      { index: LOCKS_CONCRETE_INDEX_NAME, id: this.lockId },
      { ignore: [404] }
    );

    if (!result._source) {
      return undefined;
    }

    const isExpired = new Date(result._source?.expiresAt).getTime() < Date.now();
    if (isExpired) {
      return undefined;
    }

    return result._source;
  }

  public async extendTtl(ttl: number): Promise<boolean> {
    try {
      await this.esClient.update<LockDocument>({
        index: LOCKS_CONCRETE_INDEX_NAME,
        id: this.lockId,
        script: {
          lang: 'painless',
          source: `
          if (ctx._source.token == params.token) {
            long now = System.currentTimeMillis();
            ctx._source.expiresAt = Instant.ofEpochMilli(now + params.ttl).toString();
          } else {
            ctx.op = 'noop';
          }`,
          params: {
            ttl,
            token: this.token,
          },
        },
      });
      this.logger.debug(`Lock "${this.lockId}" extended ttl with ${prettyMilliseconds(ttl)}.`);
      return true;
    } catch (error) {
      if (isVersionConflictException(error) || isDocumentMissingException(error)) {
        this.logger.debug(`Lock "${this.lockId}" was released concurrently. Not extending TTL.`);
        return false;
      }

      this.logger.error(`Failed to extend lock "${this.lockId}": ${error.message}`);
      this.logger.debug(error);
      return false;
    }
  }
}

export async function getLock({
  esClient,
  logger,
  lockId,
}: {
  esClient: ElasticsearchClient;
  logger: Logger;
  lockId: LockId;
}): Promise<LockDocument | undefined> {
  const lockManager = new LockManager(lockId, esClient, logger);
  return lockManager.get();
}

export function isLockAcquisitionError(error: unknown): error is LockAcquisitionError {
  return error instanceof LockAcquisitionError;
}

export async function withLock<T>(
  {
    esClient,
    logger,
    lockId,
    metadata,
    ttl = duration(30, 'seconds').asMilliseconds(),
  }: {
    esClient: ElasticsearchClient;
    logger: Logger;
    lockId: LockId;
  } & AcquireOptions,
  callback: () => Promise<T>
): Promise<T> {
  const lockManager = new LockManager(lockId, esClient, logger);
  const acquired = await lockManager.acquire({ metadata, ttl });

  if (!acquired) {
    logger.debug(`Lock "${lockId}" not acquired. Exiting.`);
    throw new LockAcquisitionError(`Lock "${lockId}" not acquired`);
  }

  // extend the ttl periodically
  const extendInterval = Math.floor(ttl / 4);
  logger.debug(`Extending TTL for lock "${lockId}" every ${prettyMilliseconds(extendInterval)}`);

  let extendTTlPromise = Promise.resolve(true);
  const intervalId = setInterval(() => {
    // wait for the previous extendTtl request to finish before sending the next one. This is to avoid flooding ES with extendTtl requests in cases where ES is slow to respond.
    extendTTlPromise = extendTTlPromise
      .then(() => lockManager.extendTtl(ttl))
      .catch((err) => {
        logger.error(`Failed to extend lock "${lockId}":`, err);
        return false;
      });
  }, extendInterval);

  try {
    return await callback();
  } finally {
    try {
      clearInterval(intervalId);
      await extendTTlPromise;
      await lockManager.release();
    } catch (error) {
      logger.error(`Failed to release lock "${lockId}" in withLock: ${error.message}`);
      logger.debug(error);
    }
  }
}

function isVersionConflictException(e: Error): boolean {
  return (
    e instanceof errors.ResponseError && e.body?.error?.type === 'version_conflict_engine_exception'
  );
}

function isDocumentMissingException(e: Error): boolean {
  return e instanceof errors.ResponseError && e.body?.error?.type === 'document_missing_exception';
}

export class LockAcquisitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LockAcquisitionError';
  }
}
