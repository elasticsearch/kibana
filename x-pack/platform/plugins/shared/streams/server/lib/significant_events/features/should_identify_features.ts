/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { INFERRED_FEATURE_TYPES } from '@kbn/streams-schema';
import type { KnowledgeIndicatorClient } from '../../streams/ki';

export interface ShouldIdentifyFeaturesResult {
  shouldIdentify: boolean;
}

export async function shouldIdentifyFeatures({
  kiClient,
  streamName,
  thresholdHours,
}: {
  kiClient: KnowledgeIndicatorClient;
  streamName: string;
  thresholdHours: number;
}): Promise<ShouldIdentifyFeaturesResult> {
  const result = await kiClient.getLatestRevisionTimestamp(streamName, {
    types: [...INFERRED_FEATURE_TYPES],
  });

  if (!result) {
    return { shouldIdentify: true };
  }

  const newestTimestamp = new Date(result['@timestamp']).getTime();

  if (Number.isNaN(newestTimestamp)) {
    return { shouldIdentify: true };
  }

  const thresholdMs = thresholdHours * 3_600_000;

  return {
    shouldIdentify: Date.now() - newestTimestamp >= thresholdMs,
  };
}
