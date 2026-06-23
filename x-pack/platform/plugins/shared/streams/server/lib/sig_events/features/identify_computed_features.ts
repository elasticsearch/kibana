/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import type { Logger } from '@kbn/logging';
import type { FeatureUpsert, Streams } from '@kbn/streams-schema';
import { generateAllComputedFeatures } from '@kbn/streams-ai';
import type { KnowledgeIndicatorClient } from '../../streams/ki';
import { reconcileComputedFeatures } from './reconcile_features';

export interface IdentifyComputedFeaturesOptions {
  stream: Streams.all.Definition;
  streamName: string;
  start: number;
  end: number;
  esClient: ElasticsearchClient;
  kiClient: KnowledgeIndicatorClient;
  logger: Logger;
  runId: string;
}

export async function identifyComputedFeatures({
  stream,
  streamName,
  start,
  end,
  esClient,
  kiClient,
  logger,
  runId,
}: IdentifyComputedFeaturesOptions): Promise<FeatureUpsert[]> {
  const computedFeatures = await generateAllComputedFeatures({
    stream,
    start,
    end,
    esClient,
    logger: logger.get('computed_features'),
  });

  const reconciledComputedFeatures = reconcileComputedFeatures({
    computedFeatures,
    streamName,
    runId,
  });

  if (reconciledComputedFeatures.length > 0) {
    await kiClient.bulk(
      streamName,
      reconciledComputedFeatures.map((feature) => ({ index: { feature } }))
    );
  }

  return reconciledComputedFeatures;
}
