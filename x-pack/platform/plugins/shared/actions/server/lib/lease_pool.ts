/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { LRUCache } from 'lru-cache';
import type { Logger } from '@kbn/core/server';

export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 1000;

interface PoolEntry<TClient> {
  promise: Promise<TClient>;
  terminate: (client: TClient) => Promise<void>;
}

export class LeasePool<TClient> {
  private readonly cache: LRUCache<string, PoolEntry<TClient>>;
  private readonly logger?: Logger;

  constructor(logger?: Logger) {
    this.logger = logger;
    this.cache = new LRUCache<string, PoolEntry<TClient>>({
      ttl: IDLE_TIMEOUT_MS,
      ttlAutopurge: true,
      ttlResolution: 0,
      updateAgeOnGet: true,
      max: MAX_ENTRIES,
      dispose: (value, key) => {
        void value.promise.then(
          (client) =>
            value.terminate(client).catch((err) => {
              this.logger?.warn(`Failed to terminate client for key "${key}": ${err.message}`);
            }),
          () => {}
        );
      },
    });
  }

  lease(
    key: string,
    buildFn: () => Promise<TClient>,
    terminate: (client: TClient) => Promise<void>
  ): Promise<TClient> {
    const existing = this.cache.get(key);
    if (existing !== undefined) {
      return existing.promise;
    }

    const promise = Promise.resolve().then(buildFn);
    promise.catch(() => {
      this.cache.delete(key);
    });

    const entry: PoolEntry<TClient> = { promise, terminate };
    this.cache.set(key, entry);
    return promise;
  }

  evict(connectorId: string): void {
    const prefix = `${connectorId}:`;
    const keysToEvict = [...this.cache.keys()].filter((key) => key.startsWith(prefix));
    for (const key of keysToEvict) {
      this.cache.delete(key);
    }
  }

  stop(): void {
    this.cache.clear();
  }
}
