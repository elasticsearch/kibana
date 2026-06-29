/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import type { Feature } from '@kbn/streams-schema';
import { useKibana } from '../use_kibana';

export interface BulkOperationResult {
  succeededCount: number;
  failedCount: number;
}

type CrossStreamOp =
  | { delete: { id: string } }
  | { exclude: { id: string } }
  | { restore: { id: string } };

type BuildOp = (feature: Feature) => CrossStreamOp;

interface DiscoveryFeaturesApi {
  deleteFeaturesInBulk: (features: Feature[]) => Promise<BulkOperationResult>;
  excludeFeaturesInBulk: (features: Feature[]) => Promise<BulkOperationResult>;
  restoreFeaturesInBulk: (features: Feature[]) => Promise<BulkOperationResult>;
}

export function useDiscoveryFeaturesApi(): DiscoveryFeaturesApi {
  const {
    dependencies: {
      start: {
        streams: { streamsRepositoryClient },
      },
    },
  } = useKibana();

  return useMemo(() => {
    // All three methods share the same cross-stream endpoint. Server resolves
    // each feature's owning stream from its UUID — no client-side fan-out and
    // no per-op streamName needed. signal: null so unmount does not abort a
    // partially-applied mutation.
    const runBulk = async (features: Feature[], buildOp: BuildOp): Promise<BulkOperationResult> => {
      if (features.length === 0) {
        return { succeededCount: 0, failedCount: 0 };
      }
      const { succeeded, failed } = await streamsRepositoryClient.fetch(
        'POST /internal/streams/features/_bulk',
        {
          signal: null,
          params: { body: { operations: features.map(buildOp) } },
        }
      );
      return { succeededCount: succeeded, failedCount: failed };
    };

    return {
      deleteFeaturesInBulk: (features) =>
        runBulk(features, (feature) => ({ delete: { id: feature.uuid } })),
      excludeFeaturesInBulk: (features) =>
        runBulk(features, (feature) => ({ exclude: { id: feature.uuid } })),
      restoreFeaturesInBulk: (features) =>
        runBulk(features, (feature) => ({ restore: { id: feature.uuid } })),
    };
  }, [streamsRepositoryClient]);
}
