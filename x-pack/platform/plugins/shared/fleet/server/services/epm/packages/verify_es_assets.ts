/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import pMap from 'p-map';

import type { EsAssetReference } from '../../../types';
import { ElasticsearchAssetType } from '../../../types';

/**
 * Checks whether a single ES asset exists. Returns true if the asset is present, false if it is
 * definitively absent (404). Throws on unexpected errors so callers can decide whether to treat
 * those as missing or present.
 */
async function esAssetExists(
  esClient: ElasticsearchClient,
  { id, type }: EsAssetReference
): Promise<boolean> {
  switch (type) {
    case ElasticsearchAssetType.ingestPipeline: {
      const res = await esClient.ingest.getPipeline({ id }, { ignore: [404], meta: true });
      return res.statusCode !== 404;
    }
    case ElasticsearchAssetType.indexTemplate: {
      return esClient.indices.existsIndexTemplate({ name: id });
    }
    case ElasticsearchAssetType.componentTemplate: {
      return esClient.cluster.existsComponentTemplate({ name: id });
    }
    case ElasticsearchAssetType.transform: {
      const res = await esClient.transform.getTransform(
        { transform_id: id },
        { ignore: [404], meta: true }
      );
      return res.statusCode !== 404;
    }
    case ElasticsearchAssetType.ilmPolicy:
    case ElasticsearchAssetType.dataStreamIlmPolicy: {
      const res = await esClient.ilm.getLifecycle({ name: id }, { ignore: [404], meta: true });
      return res.statusCode !== 404;
    }
    case ElasticsearchAssetType.mlModel: {
      const res = await esClient.ml.getTrainedModels(
        { model_id: id },
        { ignore: [404], meta: true }
      );
      return res.statusCode !== 404;
    }
    default:
      // index, esqlView, knowledgeBase — not verifiable here; treat as present to avoid false failures
      return true;
  }
}

/**
 * Returns the subset of `refs` whose corresponding ES assets do not exist.
 * Per-asset errors are treated as "present" (logged but not surfaced as missing) to prevent
 * transient ES errors from triggering spurious install failures.
 */
export async function verifyEsAssetsExist(
  esClient: ElasticsearchClient,
  refs: EsAssetReference[],
  logger: { warn: (msg: string) => void }
): Promise<EsAssetReference[]> {
  const results = await pMap(
    refs,
    async (ref) => {
      try {
        const exists = await esAssetExists(esClient, ref);
        return { ref, exists };
      } catch (err) {
        // Unknown error — treat as present to avoid false negatives
        logger.warn(
          `verifyEsAssetsExist: unexpected error checking ${ref.type} "${ref.id}", treating as present: ${err?.message}`
        );
        return { ref, exists: true };
      }
    },
    { concurrency: 10 }
  );

  return results.filter(({ exists }) => !exists).map(({ ref }) => ref);
}
