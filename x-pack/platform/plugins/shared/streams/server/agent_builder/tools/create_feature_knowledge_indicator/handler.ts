/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BaseFeature } from '@kbn/streams-schema';
import type { Logger } from '@kbn/core/server';
import type { KnowledgeIndicatorClient } from '../../../lib/streams/ki';

export async function createFeatureKnowledgeIndicatorToolHandler({
  kiClient,
  streamName,
  featureInput,
  expiresAt,
  logger,
}: {
  kiClient: KnowledgeIndicatorClient;
  streamName: string;
  featureInput: Omit<BaseFeature, 'stream_name'>;
  expiresAt?: string;
  logger: Logger;
}): Promise<{ id: string }> {
  logger.debug(
    `ki_feature_create: creating feature KI for stream "${streamName}" with id "${featureInput.id}"`
  );

  const feature = {
    ...featureInput,
    stream_name: streamName,
    expires_at: expiresAt,
  };

  await kiClient.bulk(streamName, [{ index: { feature } }]);

  logger.debug(
    `ki_feature_create: created feature KI for stream "${streamName}" with id "${feature.id}"`
  );

  return {
    id: feature.id,
  };
}
