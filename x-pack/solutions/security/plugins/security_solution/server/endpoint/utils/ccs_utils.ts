/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';

const CCS_CACHE_TTL_MS = 60 * 1000;

interface CcsCache {
  promise: Promise<boolean>;
  timestamp: number;
}

let ccsCache: CcsCache | null = null;

export const resetCcsCache = (): void => {
  ccsCache = null;
};

export const hasConnectedRemoteClusters = (
  esClient: ElasticsearchClient,
  ffEnabled: boolean = false
): Promise<boolean> => {
  if (ffEnabled === false) {
    return Promise.resolve(false);
  }

  const now = Date.now();

  if (ccsCache !== null && now - ccsCache.timestamp < CCS_CACHE_TTL_MS) {
    return ccsCache.promise;
  }

  const promise = esClient.cluster
    .remoteInfo()
    .then((response) => Object.values(response).some((r) => r.connected))
    .catch(() => {
      // Don't pin a transient remoteInfo() failure for the whole TTL — drop this cache entry
      // so the next call retries instead of serving a stale `false` that hides remote endpoints.
      if (ccsCache?.timestamp === now) {
        ccsCache = null;
      }
      return false;
    });

  ccsCache = { promise, timestamp: now };

  return promise;
};

export const prefixIndexPatternsWithCcs = (indexPattern: string, ccsEnabled: boolean): string => {
  if (!ccsEnabled) {
    return indexPattern;
  }

  const patterns = indexPattern.split(',');
  const ccsPatterns = patterns.map((p) => `*:${p}`);

  return [...patterns, ...ccsPatterns].join(',');
};
